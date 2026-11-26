import assert from "node:assert/strict";
import { createHash, scryptSync } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import worker from "../worker.mjs";

test("email-only, abandoned, completed and repeated signups have distinct outcomes", async () => {
  const sql = new DatabaseSync(":memory:");
  const folder = new URL("../migrations/", import.meta.url);
  for (const name of readdirSync(folder).filter(s => s.endsWith(".sql")).sort()) {
    sql.exec(readFileSync(new URL(name, folder), "utf8"));
  }
  function prepare(query, args = []) {
    const stmt = sql.prepare(query);
    return {
      bind: (...values) => prepare(query, values),
      first: () => stmt.get(...args),
      run: () => ({meta:stmt.run(...args)}),
      execute() {
        const results = stmt.all(...args);
        return {results, meta:sql.prepare("SELECT changes() AS changes").get()};
      }
    };
  }
  const DB = {prepare, batch(queries) {
    sql.exec("BEGIN");
    try { const out = queries.map(q => q.execute()); sql.exec("COMMIT"); return out; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  }};
  const limiter = {limit: () => ({success:true})};
  const env = {DB, SIGNUP_LIMIT:limiter, ACCOUNT_LIMIT:limiter};
  const ctx = {waitUntil() {}};
  async function call(route, body, token) {
    const headers = {"Content-Type":"application/json", Origin:"https://lebeats.uk", "X-LEB-Session":"tab"};
    if (token) headers.Authorization = "Bearer "+token;
    const req = new Request("https://service.example"+route, {headers,method:body ? "POST" : "GET",body:body ? JSON.stringify(body) : undefined});
    return worker.fetch(req, env, ctx);
  }
  const account = (action, data, token) => call("/account/api/"+action,data,token);
  const contact = email => sql.prepare("SELECT * FROM loyalty_contacts WHERE email=?").get(email);
  const details = {name:"Alex", email:"Alex@Example.invalid", country:"GB"};
  const email = details.email.toLowerCase();
  const password = "A2345678";
  const mailSignup = {...details,formVersion:"loyalty-card"};
  assert.equal((await call("/signup",mailSignup)).status,200);
  assert.equal((await call("/signup",{...mailSignup,email})).status,200);
  assert.equal(contact(email).email_opt_in,1);
  assert.equal(contact(email).account_id,null);
  assert.equal(contact(email).phone,null);
  assert.equal((await account("login",{email,password})).status,401);
  sql.prepare("INSERT INTO counter_staff (id,code_digest) VALUES (?,?)").run("test-staff",createHash("sha256").update("local-staff").digest("hex"));
  const staff = (await (await account("counter-login",{code:"local-staff"})).json()).token;
  assert.equal((await account("counter-find",{email},staff)).status,404);
  assert.equal((await account("counter-order",{email,expectedTotal:0,orderId:crypto.randomUUID()},staff)).status,404);
  for (const weak of ["", "Abc1234", "lower123", "Uppercase"]) {
    assert.equal((await account("register",{...details,password:weak})).status,422);
  }
  assert.equal((await account("register",{...details,password,phone:"invalid"})).status,422);
  assert.equal(contact(email).account_id,null);
  const attempts=await Promise.all([0,1].map(()=>account("register",{...details,password,phone:"07700 900123",emailOffers:true})));
  assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
  const created=await attempts.find(r=>r.status===201).json();
  assert.equal(contact(email).phone,"+447700900123");
  assert.equal(contact(email).account_id,created.member.id);
  const card=(await (await account("loyalty",null,created.tabSession)).json()).card;
  assert.equal(card.total,1);
  assert.equal(card.orders,0);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM loyalty_contacts").get().n,1);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM signups").get().n,1);
  assert.equal((await account("reset",{email,key:created.recoveryKey,password:"nocapital1"})).status,422);
  assert.equal((await account("reset",{email,key:created.recoveryKey,password:"Renewed8"})).status,200);
  const other = "account@example.invalid";
  assert.equal((await account("register",{...details,email:other,password})).status,201);
  assert.equal(contact(other).email_opt_in,0);
  assert.equal((await account("register",{...details,email:other,password,emailOffers:true})).status,409);
  assert.equal(contact(other).email_opt_in,0);
  assert.equal((await call("/signup",{...mailSignup,email:other})).status,200);
  assert.equal(contact(other).email_opt_in,1);
  const direct = "offers@example.invalid";
  assert.equal((await account("register",{...details,email:direct,password,emailOffers:true})).status,201);
  assert.equal(contact(direct).email_opt_in,1);
  assert.equal(contact(direct).phone,null);
  sql.exec("CREATE TRIGGER simulate_outage BEFORE INSERT ON signups BEGIN SELECT RAISE(ABORT,'unavailable'); END;");
  const retried = {...details,email:"retry@example.invalid",password,emailOffers:true};
  assert.equal((await account("register",retried)).status,503);
  assert.equal(contact(retried.email),undefined);
  sql.exec("DROP TRIGGER simulate_outage");
  assert.equal((await account("register",retried)).status,201);
  assert.equal(contact(retried.email).email_opt_in,1);
  const legacyPassword = "previously accepted passphrase";
  const salt = "26f17953cf918ab21134a925fc8e61ae";
  const hash = scryptSync(legacyPassword,salt,32,{N:16384,r:8,p:5}).toString("hex");
  sql.prepare("UPDATE loyalty_accounts SET password_digest=? WHERE email=?").run("s1:"+salt+":"+hash,other);
  assert.equal((await account("login",{email:other,password:legacyPassword})).status,200);
  sql.close();
});
