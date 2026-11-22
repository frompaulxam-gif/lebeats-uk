const byId = id => document.getElementById(id);
const views = ["register", "login", "reset", "member"];
const publicViews = views.slice(0, 3);
let member = null;
let ready = false;
let busy = false;
let loadingId = 0;

async function api(action, data) {
  const options = { credentials: "same-origin", cache: "no-store" };
  if (data !== undefined) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(data);
  }
  const response = await fetch("/account/api/" + action, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || "We couldn’t complete that request. Please try again.");
    error.status = response.status;
    throw error;
  }
  return result;
}

function clearKey() {
  byId("key-value").textContent = "";
  byId("key-box").hidden = true;
  byId("copy").textContent = "Copy key";
}

function show(focus = false) {
  const hash = location.hash.slice(1);
  const view = member ? "member" : publicViews.includes(hash) ? hash : "register";
  for (const id of views) byId(id).hidden = id !== view;
  byId("loading").hidden = true;
  document.body.classList.toggle("signed-in", Boolean(member));
  byId("card-holder").textContent = member?.name || "LEB EATS · Uppingham Road";
  byId("member-email").textContent = member?.email || "";
  byId("member-intro").textContent = member ? "Welcome, " + member.name + "." : "";
  byId("notice").textContent = "";
  if (focus) byId(view).querySelector("h1").focus();
}

function announce(message) {
  byId("notice").textContent = message;
  byId("notice").focus();
}

function setBusy(value) {
  busy = value;
  for (const button of document.querySelectorAll("form button, #logout")) button.disabled = value;
}

async function load() {
  const current = ++loadingId;
  let problem = "";
  try {
    member = (await api("session")).member;
  } catch (error) {
    member = null;
    if (error.status !== 401) problem = "We couldn’t check your session. Refresh to try again.";
  }
  if (current !== loadingId) return;
  ready = true;
  show();
  if (problem) announce(problem);
}

window.addEventListener("hashchange", () => {
  if (ready && !member) {
    for (const field of document.querySelectorAll('input[type="password"]')) field.value = "";
    show(true);
  }
});
window.addEventListener("pageshow", event => { if (event.persisted) { clearKey(); load(); } });

for (const form of document.querySelectorAll("form")) {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    byId("notice").textContent = "";
    try {
      const action = form.getAttribute("action").split("/").pop();
      const response = await api(action, Object.fromEntries(new FormData(form)));
      member = response.member;
      for (const accountForm of document.forms) accountForm.reset();
      byId("manage-key").open = false;
      history.replaceState(null, "", location.pathname);
      clearKey();
      show(true);
      if (response.recoveryKey) {
        byId("key-value").textContent = response.recoveryKey;
        byId("key-box").hidden = false;
      }
    } catch (error) {
      announce(error.message === "Failed to fetch" ? "Check your connection and try again." : error.message);
    } finally { setBusy(false); }
  });
}

byId("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(byId("key-value").textContent);
    byId("copy").textContent = "Copied";
  } catch { announce("Select the recovery key and copy it to a safe place."); }
});
byId("saved").addEventListener("click", () => { clearKey(); byId("member").querySelector("h1").focus(); });
byId("logout").addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try {
    await api("logout", {});
    member = null;
    clearKey();
    for (const form of document.forms) form.reset();
    byId("manage-key").open = false;
    history.replaceState(null, "", "#login");
    show(true);
  } catch { announce("We couldn’t sign you out. Please try again."); }
  finally { setBusy(false); }
});
load();
