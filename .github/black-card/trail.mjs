import { createHash, randomBytes } from "node:crypto";

const digest = value => createHash("sha256").update(value).digest("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const counterActions = new Set(["counter-login","counter-logout","counter-find","counter-order","counter-redeem"]);
const activeSession = `SELECT c.id FROM counter_sessions s JOIN counter_staff c ON c.id=s.staff_id
  WHERE s.token_digest=? AND s.expires_at>unixepoch() AND c.enabled=1`;

export async function cardState(db, member, customerView) {
  // Read the total and earned rewards in a single snapshot.
  const queries = [
    db.prepare("SELECT COUNT(*) AS orders, MAX(stamp_number) AS latest FROM loyalty_orders WHERE account_id=?").bind(member.id),
    db.prepare(`SELECT id, stamp_number AS stamp, redeemed_at AS usedAt${customerView ? ", CASE WHEN redeemed_at IS NULL THEN claim_code END AS code" : ""}
      FROM loyalty_orders WHERE account_id=? AND claim_code IS NOT NULL ORDER BY stamp_number DESC`).bind(member.id)
  ];
  if (!customerView) {
    queries.push(db.prepare(`SELECT created_at AS recordedAt, stamp_number AS stamp FROM loyalty_orders
      WHERE account_id=? ORDER BY stamp_number DESC LIMIT 5`).bind(member.id));
  }
  const [balance, earned, recent] = await db.batch(queries);
  const welcome = member.points > 0 ? 1 : 0;
  const {orders,latest} = balance.results[0];
  const total = latest ?? welcome;
  return {
    orders, welcome, total, cycle: Math.max(1, Math.ceil(total / 8)),
    level: total ? ((total - 1) % 8) + 1 : 0,
    rewards: earned.results, ...(recent ? {recent: recent.results} : {})
  };
}

export async function counterRequest(action, request, env, data, reply) {
  const db = env.DB;
  if (action === "counter-login") {
    const key = "counter-login:" + (request.headers.get("CF-Connecting-IP") || "local");
    if (!(await env.ACCOUNT_LIMIT.limit({key})).success) return reply(429,{error:"Wait a minute before trying again."});
    if (typeof data.code !== "string" || data.code.length > 128) return reply(401,{error:"Check your staff code."});
    const token = randomBytes(32).toString("hex");
    const issued = await db.prepare(`INSERT INTO counter_sessions (token_digest,staff_id,expires_at)
      SELECT ?,id,unixepoch()+28800 FROM counter_staff WHERE code_digest=? AND enabled=1`)
      .bind(digest(token), digest(data.code.trim())).run();
    return issued.meta.changes ? reply(200,{token}) : reply(401,{error:"Check your staff code."});
  }
  const bearer = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("Authorization") || "");
  const key = bearer && digest(bearer[1]);
  const staff = key && await db.prepare(activeSession).bind(key).first();
  if (!staff) return reply(401,{error:"Sign in to the counter to continue."});
  if (action === "counter-logout") {
    await db.prepare("DELETE FROM counter_sessions WHERE token_digest=?").bind(key).run();
    return reply(200,{});
  }
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  if (!email || email.length>254) return reply(422,{error:"Enter the email on the customer’s account."});
  const member = await db.prepare("SELECT id,name,email,points FROM loyalty_accounts WHERE email=?").bind(email).first();
  if (!member) return reply(404,{error:"No loyalty account with that email. Check the spelling or ask the customer to create an account."});
  let note = "";
  if (action === "counter-order") {
    if (!uuid.test(data.orderId) || !Number.isSafeInteger(data.expectedTotal) || data.expectedTotal < 0)
      return reply(422,{error:"Find the customer again before adding an order."});
    // The INSERT and its balance check are one write. A retry reuses its receipt;
    // two tills viewing the same old balance cannot both stamp it silently.
    const added = await db.prepare(`INSERT INTO loyalty_orders (id,account_id,staff_id,stamp_number,claim_code)
      SELECT ?,?,c.id,prior+1,CASE WHEN (prior+1)%4=0 THEN hex(randomblob(4)) END
      FROM (${activeSession}) c CROSS JOIN
        (SELECT COALESCE(MAX(stamp_number),?) AS prior FROM loyalty_orders WHERE account_id=?)
      WHERE prior=? ON CONFLICT(id) DO NOTHING`)
      .bind(data.orderId, member.id, key, member.points>0 ? 1 : 0, member.id, data.expectedTotal).run();
    if (!added.meta.changes) {
      const receipt = await db.prepare("SELECT id FROM loyalty_orders WHERE id=? AND account_id=? AND staff_id=?").bind(data.orderId,member.id,staff.id).first();
      if (!receipt) return reply(409,{error:"The card has changed. Find the customer again and check the latest order before adding another."});
    }
    note = added.meta.changes ? "Order added." : "This order was already added.";
  }
  if (action === "counter-redeem") {
    if (!uuid.test(data.rewardId) || typeof data.code !== "string" || !/^[0-9A-F]{8}$/.test(data.code))
      return reply(422,{error:"Enter the eight-character code from the customer’s reward."});
    if (!(await env.ACCOUNT_LIMIT.limit({key:"counter-redeem:"+staff.id})).success)
      return reply(429,{error:"Wait a minute before trying another reward code."});
    const used = await db.prepare(`UPDATE loyalty_orders SET redeemed_at=unixepoch(),redeemed_by=?
      WHERE id=? AND account_id=? AND claim_code=? AND redeemed_at IS NULL AND EXISTS (${activeSession})`)
      .bind(staff.id,data.rewardId,member.id,data.code,key).run();
    if (!used.meta.changes) return reply(409,{error:"Reward wasn’t redeemed. Check the code and refresh the customer’s card to see if it was already used."});
    note = "Reward redeemed.";
  }
  return reply(200,{name:member.name,email:member.email,card:await cardState(db, member, false),note});
}
