import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { cardState, counterRequest } from "../trail.mjs";

test("welcome and legacy cards, receipts, reward ownership and rollover", async () => {
  const sql = new DatabaseSync(":memory:");
  const digest = text => createHash("sha256").update(text).digest("hex");
  for (const migration of ["0004_customer_accounts","0007_account_phone","0008_loyalty_points","0009_loyalty_trail"]) {
    sql.exec(readFileSync(new URL("../migrations/"+migration+".sql",import.meta.url),"utf8"));
  }
  const db = {
    prepare(query) {
      const stmt = sql.prepare(query);
      return {bind(...args) {
        return {
          first: () => stmt.get(...args),
          run: () => ({meta:stmt.run(...args)}),
          all: () => ({results:stmt.all(...args)})
        };
      }};
    },
    batch: queries => queries.map(q=>q.all())
  };
  const env = {DB:db, ACCOUNT_LIMIT:{limit:()=>({success:true})}};
  const email = "new@example.invalid", legacyEmail = "legacy@example.invalid";
  const addMember = sql.prepare("INSERT INTO loyalty_accounts (id,name,email,password_digest,recovery_digest,points) VALUES (?,'Test',?,'test','test',?)");
  addMember.run("new",email,1);
  addMember.run("legacy",legacyEmail,0);
  sql.prepare("INSERT INTO counter_staff(id,code_digest) VALUES ('counter',?)").run(digest("test-only"));
  let token = "";
  async function call(action,data) {
    const req = new Request("https://example.invalid",{headers:{Authorization:"Bearer "+token}});
    return counterRequest("counter-"+action,req,env,data,(status,body)=>({status,...body}));
  }
  assert.equal((await call("find",{email})).status,401);
  token = (await call("login",{code:"test-only"})).token;
  assert.equal((await call("find",{email:legacyEmail})).card.level,0);
  assert.equal((await call("find",{email})).card.level,1);
  const first = {email,expectedTotal:1,orderId:randomUUID()};
  assert.equal((await call("order",first)).card.orders,1);
  assert.equal((await call("order",first)).card.orders,1);
  assert.equal((await call("order",{...first,orderId:randomUUID()})).status,409);
  for(let total=2;total<9;total++) {
    assert.equal((await call("order",{email,expectedTotal:total,orderId:randomUUID()})).card.total,total+1);
  }
  const staff = (await call("find",{email})).card;
  assert.equal(staff.level,1);
  assert.equal(staff.cycle,2);
  assert.equal(staff.orders,8);
  assert.equal(staff.recent.length,5);
  assert.deepEqual(staff.rewards.map(r=>r.stamp),[8,4]);
  assert.ok(staff.rewards.every(r=>!("code" in r)));
  const customer = await cardState(db,{id:"new",points:1},true);
  const reward = customer.rewards[1];
  const claim = {email,rewardId:reward.id,code:reward.code};
  assert.equal((await call("redeem",{...claim,email:legacyEmail})).status,409);
  assert.equal((await call("redeem",claim)).status,200);
  assert.equal((await call("redeem",claim)).status,409);
  const after=await cardState(db,{id:"new",points:1},true);
  assert.equal(after.rewards[1].code,null);
  assert.equal(after.rewards[0].usedAt,null);
  await call("logout",{});
  assert.equal((await call("find",{email})).status,401);
  sql.close();
});
