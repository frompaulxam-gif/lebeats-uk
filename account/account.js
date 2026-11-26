const byId = id => document.getElementById(id);
const views = ["register", "login", "reset", "member"];
const publicViews = views.slice(0, 3);
const dialCountry = byId("dial-country");
const registerPhone = byId("register-phone");
const phoneNumbers = window.libphonenumber;
const flag = code => String.fromCodePoint(...Array.from(code, c => 127397 + c.charCodeAt(0)));
if (phoneNumbers) {
  const names = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en-GB"], {type:"region"}) : null;
  const countries = phoneNumbers.getCountries().map(code => ({code, name:names?.of(code) || code}));
  countries.sort((a,b) => a.name.localeCompare(b.name, "en-GB"));
  dialCountry.replaceChildren(...countries.map(({code, name}) => new Option(
    flag(code) + " " + name + " (+" + phoneNumbers.getCountryCallingCode(code) + ")", code, code === "GB", code === "GB"
  )));
}
function showDialCode() {
  const code = dialCountry.value;
  byId("dial-label").textContent = flag(code) + " +" + (phoneNumbers?.getCountryCallingCode(code) || "44");
  registerPhone.placeholder = code === "GB" ? "7700 900123" : "Phone number";
  registerPhone.setCustomValidity("");
}
dialCountry.addEventListener("change", showDialCode);
registerPhone.addEventListener("input", () => registerPhone.setCustomValidity(""));
registerPhone.form.addEventListener("reset", () => queueMicrotask(showDialCode));
let member = null;
let ready = false;
let busy = false;
let loadingId = 0;

let trailRevision = 0;
let pendingTrail = false;
function resetTrail() {
  trailRevision++;
  pendingTrail = false;
  byId("member-trail").hidden = !member;
  const fresh = document.createElement("leb-trail");
  fresh.id = "customer-trail";
  fresh.setAttribute("customer","");
  byId("customer-trail").replaceWith(fresh);
  byId("trail-status").textContent = "";
  if (member) refreshTrail();
}
async function refreshTrail() {
  if (!member || pendingTrail || document.hidden) return;
  const revision = trailRevision;
  pendingTrail = true;
  try {
    const response = await api("loyalty");
    if (revision !== trailRevision) return;
    if (response.id !== member.id) { clearKey(); await load(); return; }
    const trail = byId("customer-trail");
    const total = response.card.total;
    const seenKey = "leb.trail.seen." + member.id;
    let seen = Math.max(0,total-1);
    if (!trail.state) {
      try {
        const saved = localStorage.getItem(seenKey);
        if (saved !== null && Number.isSafeInteger(Number(saved))) seen = Number(saved);
      } catch { /* The card also works without browser storage. */ }
    }
    const changed = trail.state?.total !== total;
    trail.update(response.card, seen);
    if (changed) { try { localStorage.setItem(seenKey,String(total)); } catch {} }
    byId("trail-status").textContent = "";
  } catch (error) {
    if (revision !== trailRevision) return;
    if (error.status===401) { clearKey(); member = null; history.replaceState(null,"","#login"); show(); announce("Your session has ended. Sign in to see your card."); }
    else byId("trail-status").textContent = "Couldn’t update your card. We’ll try again shortly.";
  } finally { if (revision === trailRevision) pendingTrail = false; }
}
setInterval(refreshTrail,6000);
window.addEventListener("focus",refreshTrail);
document.addEventListener("visibilitychange",refreshTrail);

function clearKey() {
  byId("key-value").textContent = "";
  byId("key-box").hidden = true;
  byId("copy").textContent = "Copy key";
}

const registration = registerPhone.form;
let displayedDraft;
function showRegistrationDraft() {
  const draft = readSignupDraft();
  const identity = draft ? JSON.stringify(draft) : "";
  if (identity === displayedDraft) return;
  displayedDraft = identity;
  registration.reset();
  for (const field of ["email", "name"]) {
    registration.elements[field].value = draft?.[field] || "";
    registration.elements[field].closest("label").hidden = Boolean(draft);
  }
  if (draft) {
    registerPhone.value = draft.phone;
    if (dialCountry.querySelector('option[value="' + CSS.escape(draft.country) + '"]')) dialCountry.value = draft.country;
    byId("login").querySelector("[name=email]").value = draft.email;
  }
  registerPhone.closest(".phone-field").hidden = Boolean(draft?.phone);
  registration.elements.emailOffers.closest("label").hidden = Boolean(draft);
  byId("signup-resume").hidden = !draft;
  byId("resume-email").textContent = draft?.email || "";
  showDialCode();
}
byId("different-details").addEventListener("click", () => {
  clearSignupDraft();
  showRegistrationDraft();
  registration.elements.name.focus();
});

function show(focus = false) {
  const hash = location.hash.slice(1);
  const view = member ? "member" : publicViews.includes(hash) ? hash : "register";
  if (!member) showRegistrationDraft();
  else { clearSignupDraft(); displayedDraft = undefined; }
  for (const id of views) byId(id).hidden = id !== view;
  resetClickSettings();
  byId("loading").hidden = true;
  document.body.classList.toggle("signed-in", Boolean(member));
  resetTrail();
  byId("member-email").textContent = member?.email || "";
  byId("member-phone").textContent = member?.phone || "";
  byId("member-phone-row").hidden = !member?.phone;
  byId("member-intro").textContent = member ? "Welcome, " + member.name + "." : "";
  byId("notice").textContent = "";
  if (focus) (member ? byId("member-trail") : byId(view)).querySelector("h1,h2").focus();
}

const clickSettings = byId("click-settings");
const clickChoice = byId("click-choice");
const clickStatus = byId("click-status");
let clickState = null;
let settingRevision = 0;

function resetClickSettings() {
  settingRevision++;
  clickSettings.open = false;
  clickState = null;
  clickChoice.disabled = true;
  clickStatus.textContent = "";
}

function measurementOff() {
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1") return true;
  try { return localStorage.getItem("lebeats.measurement.off") === "1"; } catch { return false; }
}

async function updateClickSettings(change = false) {
  if (!member || !clickSettings.open) return;
  const accountId = member.id;
  const revision = ++settingRevision;
  const saving = change && clickState !== null;
  clickChoice.disabled = true;
  clickChoice.textContent = saving ? "Saving…" : "Checking setting…";
  clickStatus.textContent = "";
  try {
    const result = await api("activity-setting", saving ? {accountId, enabled: !clickState} : undefined);
    if (revision !== settingRevision || !clickSettings.open) return;
    if (result.id !== accountId) throw new Error("Reload your account to check this setting.");
    clickState = Boolean(result.receipt);
    const blocked = measurementOff();
    clickChoice.textContent = clickState ? "Turn off and delete my history" : "Turn on click history";
    clickChoice.disabled = blocked && !clickState;
    clickStatus.textContent = clickState
      ? (blocked ? "On for your account. Measurement is paused in this browser." : "Click history is on.")
      : (saving ? "Click history is off. Your saved clicks have been deleted." : "Click history is off.")
        + (blocked ? " Website measurement is turned off in this browser." : "");
  } catch (error) {
    if (revision !== settingRevision || !clickSettings.open) return;
    clickState = null;
    clickChoice.disabled = false;
    clickChoice.textContent = "Check setting again";
    clickStatus.textContent = error.status === 401 ? "Your session has ended. Sign in again." : "We couldn’t confirm your setting. Please check again.";
  }
}

clickSettings.addEventListener("toggle", () => {
  if (clickSettings.open) updateClickSettings();
  else { settingRevision++; clickState = null; }
});
clickChoice.addEventListener("click", () => updateClickSettings(true));
window.addEventListener("storage", e => {
  if ((e.key === "lebeats.measurement.off" || e.key === null) && clickState !== null) updateClickSettings();
});

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
    if (useTabSession && error.status === 401) saveTabSession("");
    if (brandedPage && !useTabSession && error.status === 401) {
      try {
        const check = await api("cookie-check");
        if (current !== loadingId) return;
        useTabSession = !check.supported;
      } catch { problem = "We couldn’t check your session. Refresh to try again."; }
    }
    if (error.status !== 401) problem = "We couldn’t check your session. Refresh to try again.";
  }
  if (current !== loadingId) return;
  const tabInfo = byId("tab-info");
  if (tabInfo) tabInfo.hidden = !useTabSession;
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
      const data = Object.fromEntries(new FormData(form));
      if (action === "register") data.emailOffers = registration.elements.emailOffers.checked;
      const response = await api(action, data);
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
      if (error.status === 409 && form === registration) {
        byId("login").querySelector("[name=email]").value = registration.elements.email.value;
        registration.elements.password.value = "";
        history.replaceState(null, "", "#login");
        show(true);
        announce("An account already uses this email. Enter your existing password to see your card.");
        return;
      }
      if (error.field === "phone" && form === registerPhone.form) {
        registerPhone.setCustomValidity(error.message);
        registerPhone.reportValidity();
        return;
      }
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
byId("saved").addEventListener("click", () => { clearKey(); byId("member").querySelector("h1,h2").focus(); });
byId("logout").addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try {
    await api("logout", {});
    if (useTabSession) saveTabSession("");
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
