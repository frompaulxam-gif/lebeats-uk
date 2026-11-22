import { randomBytes, scryptSync, createHash, timingSafeEqual } from "node:crypto";

const cookieName = "__Host-leb_session";
const sessionSeconds = 30 * 24 * 60 * 60;
const dummySalt = "e39a10401c4421f830397cb2b0c9eff9";
const dummyPassword = "s1:" + dummySalt + ":" + "0".repeat(64);

const digest = value => createHash("sha256").update(value).digest("hex");
const random = bytes => randomBytes(bytes).toString("hex");

function passwordDigest(password, salt = random(16)) {
  const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 });
  return ["s1", salt, hash.toString("hex")].join(":");
}

function passwordMatches(password, encoded) {
  const [version, salt] = encoded.split(":");
  return version === "s1" && timingSafeEqual(Buffer.from(encoded), Buffer.from(passwordDigest(password, salt)));
}

function newRecoveryKey() {
  return random(16).match(/.{4}/g).join("-");
}

function sessionDigest(request) {
  const token = (request.headers.get("Cookie") || "").split(/;\s*/).find(c => c.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  return token && /^[0-9a-f]{64}$/.test(token) ? digest(token) : null;
}

function reply(status, body, token) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  if (token !== undefined) headers["Set-Cookie"] = cookieName + "=" + token + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=" + (token ? sessionSeconds : 0);
  if (status === 429) headers["Retry-After"] = "60";
  return Response.json(body, { status, headers });
}

function sessionInsert(db, token, accountId, version) {
  return db.prepare(`INSERT INTO loyalty_sessions (token_digest,account_id,version,expires_at)
    SELECT ?,id,session_version,unixepoch()+? FROM loyalty_accounts WHERE id=? AND session_version=?`)
    .bind(digest(token), sessionSeconds, accountId, version);
}

async function sessionAccount(db, request) {
  const key = sessionDigest(request);
  if (!key) return null;
  return db.prepare(`SELECT a.id,a.name,a.email FROM loyalty_sessions s JOIN loyalty_accounts a ON a.id=s.account_id
    AND a.session_version=s.version WHERE s.token_digest=? AND s.expires_at>unixepoch()`).bind(key).first();
}

const validPassword = password => typeof password === "string" && Array.from(password).length >= 15 && password.length <= 128;
const invalidLogin = () => reply(401, { error: "Check your email and password and try again." });
const invalidKey = () => reply(401, { error: "Check your email and recovery key and try again." });

async function register(db, data, email) {
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/u.test(name)) return reply(422, { error: "Enter your name." });
  if (!validPassword(data.password)) return reply(422, { error: "Use a password of at least 15 characters." });
  const id = crypto.randomUUID();
  const token = random(32);
  const recoveryKey = newRecoveryKey();
  const [created] = await db.batch([
    db.prepare(`INSERT INTO loyalty_accounts (id,email,name,password_digest,recovery_digest)
      VALUES (?,?,?,?,?) ON CONFLICT(email) DO NOTHING`).bind(id, email, name, passwordDigest(data.password), digest(recoveryKey)),
    sessionInsert(db, token, id, 1)
  ]);
  if (!created.meta.changes) return reply(409, { error: "An account already uses this email. Sign in or reset your password." });
  return reply(201, { member: { id, name, email }, recoveryKey }, token);
}

async function login(db, password, email) {
  if (typeof password !== "string" || !password || password.length > 128) return invalidLogin();
  const account = await db.prepare("SELECT id,name,email,password_digest,session_version FROM loyalty_accounts WHERE email=?").bind(email).first();
  if (!passwordMatches(password, account?.password_digest || dummyPassword) || !account) return invalidLogin();
  const token = random(32);
  const result = await sessionInsert(db, token, account.id, account.session_version).run();
  if (!result.meta.changes) return invalidLogin();
  return reply(200, { member: { id: account.id, email: account.email, name: account.name } }, token);
}

async function reset(db, data, email) {
  if (!validPassword(data.password)) return reply(422, { error: "Use a new password of at least 15 characters." });
  const key = typeof data.key === "string" ? data.key.trim().toLowerCase() : "";
  if (!/^(?:[0-9a-f]{4}-){7}[0-9a-f]{4}$/.test(key)) return invalidKey();
  const account = await db.prepare("SELECT id,name,email,session_version FROM loyalty_accounts WHERE email=? AND recovery_digest=?").bind(email, digest(key)).first();
  if (!account) return invalidKey();
  const token = random(32);
  const recoveryKey = newRecoveryKey();
  const nextVersion = account.session_version + 1;
  // The session can only be inserted by the reset that owns the new recovery digest.
  const [changed] = await db.batch([
    db.prepare(`UPDATE loyalty_accounts SET password_digest=?,recovery_digest=?,session_version=?
      WHERE id=? AND recovery_digest=? AND session_version=?`).bind(passwordDigest(data.password), digest(recoveryKey), nextVersion, account.id, digest(key), account.session_version),
    db.prepare(`INSERT INTO loyalty_sessions (token_digest,account_id,version,expires_at)
      SELECT ?,id,session_version,unixepoch()+? FROM loyalty_accounts WHERE id=? AND recovery_digest=?`).bind(digest(token), sessionSeconds, account.id, digest(recoveryKey))
  ]);
  if (!changed.meta.changes) return invalidKey();
  return reply(200, { member: { id: account.id, name: account.name, email: account.email }, recoveryKey }, token);
}

async function replaceKey(db, request, password) {
  if (typeof password !== "string" || !password || password.length > 128) return invalidLogin();
  const member = await sessionAccount(db, request);
  if (!member) return reply(401, { error: "Please sign in again." });
  const account = await db.prepare("SELECT password_digest,session_version FROM loyalty_accounts WHERE id=?").bind(member.id).first();
  if (!account || !passwordMatches(password, account.password_digest)) return reply(401, { error: "Check your current password." });
  const recoveryKey = newRecoveryKey();
  const result = await db.prepare("UPDATE loyalty_accounts SET recovery_digest=? WHERE id=? AND session_version=?").bind(digest(recoveryKey), member.id, account.session_version).run();
  if (!result.meta.changes) return reply(401, { error: "Please sign in again." });
  return reply(200, { member, recoveryKey });
}

const paths = new Set(["register", "login", "reset", "logout", "session", "replace-key"]);
export async function accountRequest(request, env, ctx, readPayload) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/account/api/")) {
    const asset = await env.ACCOUNT_ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    response.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' https://lebeats.uk; font-src 'self' https://lebeats.uk; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Robots-Tag", "noindex");
    return response;
  }
  const action = url.pathname.slice("/account/api/".length);
  if (!paths.has(action)) return reply(404, {});
  if (request.method !== (action === "session" ? "GET" : "POST")) return reply(405, {});
  try {
    if (action === "session") {
      const member = await sessionAccount(env.DB, request);
      return member ? reply(200, { member }) : reply(401, { error: "Please sign in." });
    }
    if (request.headers.get("Origin") !== url.origin) return reply(403, {});
    if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") return reply(415, {});
    if (action === "logout") {
      const key = sessionDigest(request);
      if (key) await env.DB.prepare("DELETE FROM loyalty_sessions WHERE token_digest=?").bind(key).run();
      return reply(200, {}, "");
    }
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!(await env.ACCOUNT_LIMIT.limit({ key: "ip:" + ip })).success) return reply(429, { error: "Please wait a minute and try again." });
    const data = await readPayload(request).catch(() => null);
    if (!data || typeof data !== "object") return reply(422, { error: "Please check your details." });
    if (action === "replace-key") return await replaceKey(env.DB, request, data.password);
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/u.test(email)) return reply(422, { error: "Enter a valid email address." });
    if (!(await env.ACCOUNT_LIMIT.limit({ key: "email:" + digest(email) })).success) return reply(429, { error: "Please wait a minute and try again." });
    if (randomBytes(1)[0] < 8) ctx.waitUntil(env.DB.prepare("DELETE FROM loyalty_sessions WHERE expires_at<=unixepoch()").run());
    if (action === "register") return await register(env.DB, data, email);
    if (action === "login") return await login(env.DB, data.password, email);
    return await reset(env.DB, data, email);
  } catch {
    return reply(503, { error: "We couldn’t reach your account. Please try again shortly." });
  }
}
