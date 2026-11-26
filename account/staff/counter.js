const el = id => document.getElementById(id);
const base = location.origin === "https://lebeats.uk" ? "https://leb-eats-black-card.raspy-waterfall-454f.workers.dev" : location.origin;
function read(key) { try { return sessionStorage.getItem("leb.counter."+key); } catch { return null; } }
function save(key,value) { try {
  if (value) sessionStorage.setItem("leb.counter."+key,value);
  else sessionStorage.removeItem("leb.counter."+key);
} catch {} }
let token = read("session") || "";
let pending = null;
try { pending = JSON.parse(read("receipt")); } catch {}
let customer = null, reward = null, busy = false, added = false;
const email = el("find").elements.email;
const feedback = message => { el("feedback").textContent = message; };
function controls() {
  el("staff-login").hidden = Boolean(token);
  el("workspace").hidden = el("staff-logout").hidden = !token;
  el("customer").hidden = el("card-view").hidden = !customer;
  el("redeem").hidden = !reward;
  for (const item of document.querySelectorAll("form button,input,#staff-logout,.reward-row button")) item.disabled = busy;
  el("add").disabled = busy || added || !customer;
  el("add").textContent = added ? "Order recorded ✓" : pending?.email === customer?.email && pending ? "Check last order" : "Add order";
}
function clearCustomer() {
  reward = customer = null;
  added = false;
  el("address").textContent = el("who").textContent = "";
  el("redeem").reset();
  el("recent-orders").open=false; el("order-list").replaceChildren();
  const old = el("counter-trail");
  const clean = document.createElement("leb-trail"); clean.id = old.id; old.replaceWith(clean);
  controls();
}
function lock() {
  token = ""; save("session","");
  el("find").reset(); el("staff-login").reset();
  clearCustomer();
}
async function request(action,data) {
  const headers = {"Content-Type":"application/json"};
  if (token) headers.Authorization = "Bearer "+token;
  const result = await fetch(base+"/account/api/counter-"+action,{method:"POST",credentials:"omit",headers,body:JSON.stringify(data),cache:"no-store"});
  const body = await result.json();
  if (!result.ok) {
    if (result.status===401 && token) lock();
    const err = new Error(body.error || "Couldn’t complete the request.");
    err.status=result.status;
    throw err;
  }
  return body;
}
function display(result) {
  customer = result;
  el("who").textContent = result.name;
  el("address").textContent = result.email;
  el("counter-trail").update(result.card);
  el("order-count").textContent = result.card.orders + (result.card.orders === 1 ? " recorded order" : " recorded orders");
  el("order-list").replaceChildren(...result.card.recent.map(order=>{
    const li = document.createElement("li");
    const time = new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(order.recordedAt*1000);
    li.textContent = time+" · Card "+Math.ceil(order.stamp/8)+", stamp "+((order.stamp-1)%8+1);
    return li;
  }));
  if (result.card.orders === 0) el("recent-orders").open=false;
}
function handle(id,type,operation) {
  el(id).addEventListener(type,async event=>{
    event.preventDefault();
    if (busy) return;
    busy=true; controls(); feedback("");
    try { await operation(); }
    catch (err) { feedback(err.status ? err.message : "Connection interrupted. Try again to check the result."); }
    finally { busy=false; controls(); }
  });
}
handle("staff-login","submit",async()=>{
  const {token:session} = await request("login",{code:el("staff-login").elements.code.value});
  token=session; save("session",token); el("staff-login").reset(); controls();
  requestAnimationFrame(()=>email.focus());
});
email.addEventListener("input",()=>{ clearCustomer(); feedback(""); });
handle("find","submit",async()=>{
  clearCustomer();
  if (pending && pending.email !== email.value.trim().toLowerCase()) {
    throw Object.assign(new Error("An order still needs checking. Look up "+pending.email+" and check the last order first."),{status:409});
  }
  try { display(await request("find",{email:email.value})); }
  catch (err) {
    if (err.status===404 && pending?.email===email.value.trim().toLowerCase()) { pending=null; save("receipt",""); }
    throw err;
  }
});
handle("add","click",async()=>{
  if (!customer || added) return;
  if (!pending) {
    pending={email:customer.email,orderId:crypto.randomUUID(),expectedTotal:customer.card.total};
    save("receipt",JSON.stringify(pending));
  }
  try {
    const result=await request("order",pending);
    added=true; pending=null; save("receipt",""); display(result);
    feedback(result.note+" "+result.card.level+" of 8 stamps.");
  } catch(err) {
    if (err.status===409 || err.status===404 || err.status===422) { pending=null; save("receipt",""); clearCustomer(); }
    throw err;
  }
});
el("card-view").addEventListener("redeem-reward",event=>{
  if (busy || !customer) return;
  reward=event.detail; el("redeem").reset(); el("redeem-title").textContent="Redeem "+reward.title;
  controls(); feedback(""); el("redeem").elements.code.focus();
});
el("cancel").addEventListener("click",()=>{reward=null; el("redeem").reset(); controls();});
handle("redeem","submit",async()=>{
  const code=el("redeem").elements.code.value.trim().toUpperCase().replace(/\s/g,"");
  const result=await request("redeem",{email:customer.email,rewardId:reward.id,code});
  reward=null; el("redeem").reset(); display(result); feedback(result.note);
});
handle("staff-logout","click",async()=>{
  await request("logout",{}); lock(); feedback("Counter locked.");
});
window.addEventListener("pageshow",event=>{if(event.persisted){clearCustomer();el("find").reset();feedback("");}});
controls();
