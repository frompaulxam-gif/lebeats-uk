import clickMap from "./clicks.json" with { type: "json" };

export const sources = new Set(["instagram", "facebook", "tiktok", "google", "google_business",
  "google_ads", "meta_ads", "poster", "email", "direct", "internal", "other", "internal_test"]);

export function knownButton(placement, action) {
  return typeof placement === "string" && Object.hasOwn(clickMap.areas, placement)
    && clickMap.areas[placement].actions.includes(action);
}

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const isUuid = value => typeof value === "string" && uuidPattern.test(value);
const signedInAccount = `SELECT a.id FROM loyalty_sessions s JOIN loyalty_accounts a
  ON a.id=s.account_id AND a.session_version=s.version
  WHERE s.token_digest=? AND s.expires_at>unixepoch()`;

export async function memberActivity(action, request, env, sessionKey, readPayload, reply) {
  const permissionOnly = request.method === "GET" && new URL(request.url).searchParams.get("scope") === "buttons";
  if (!sessionKey) return permissionOnly ? reply(200, {receipt:null}) : reply(401, {});
  const db = env.DB;
  const privacySignal = request.headers.get("Sec-GPC") === "1" || request.headers.get("DNT") === "1";
  if (request.method === "GET") {
    const preference = await db.prepare(`SELECT a.id, c.receipt FROM loyalty_accounts a
      LEFT JOIN member_click_consent c ON c.account_id=a.id WHERE a.id=(${signedInAccount})`)
      .bind(sessionKey).first();
    if (permissionOnly) return reply(200, {receipt: privacySignal ? null : preference?.receipt || null});
    return preference ? reply(200, preference) : reply(401, {});
  }
  const limiter = action === "member-click" ? env.ACTIVITY_LIMIT : env.ACCOUNT_LIMIT;
  if (!(await limiter.limit({key:"member-activity:" + sessionKey})).success) return reply(429, {});
  const data = await readPayload(request).catch(() => null);
  if (action === "member-click") {
    if (!knownButton(data?.placement, data?.action) || !sources.has(data.source)
        || !isUuid(data.receipt) || !isUuid(data.eventId)) return reply(422, {});
    if (!privacySignal) {
      // Authenticate, check the current consent and write in one statement, including on retries.
      await db.prepare(`INSERT INTO member_click_history (account_id,event_id,placement,action,source)
        SELECT account_id,?,?,?,? FROM member_click_consent
        WHERE account_id=(${signedInAccount}) AND receipt=?
        ON CONFLICT(event_id) DO NOTHING`)
        .bind(data.eventId, data.placement, data.action, data.source, sessionKey, data.receipt).run();
    }
    return new Response(null, {status:204, headers:{"Cache-Control":"no-store"}});
  }
  if (typeof data?.enabled !== "boolean" || !isUuid(data.accountId)) return reply(422, {});
  if (data.enabled && privacySignal) return reply(403, {error:"Website measurement is turned off in this browser."});
  const update = data.enabled
    ? db.prepare(`INSERT INTO member_click_consent (account_id,receipt,notice_version)
        SELECT id,?,1 FROM loyalty_accounts WHERE id=? AND id=(${signedInAccount})
        ON CONFLICT(account_id) DO NOTHING`).bind(crypto.randomUUID(), data.accountId, sessionKey)
    : db.prepare(`DELETE FROM member_click_consent WHERE account_id=? AND account_id=(${signedInAccount})`)
        .bind(data.accountId, sessionKey);
  const [, state] = await db.batch([update, db.prepare(`SELECT a.id, c.receipt FROM loyalty_accounts a
    LEFT JOIN member_click_consent c ON c.account_id=a.id WHERE a.id=? AND a.id=(${signedInAccount})`)
    .bind(data.accountId, sessionKey)]);
  return state.results.length ? reply(200, state.results[0]) : reply(401, {error:"Please sign in again."});
}
