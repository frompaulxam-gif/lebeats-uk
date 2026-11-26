const brandedPage = location.origin === "https://lebeats.uk";
const tabKey = "leb.account.tab";
// Only the customer's own confirmed form details can be carried into registration.
const signupDraftKey = "leb.signup.finish.v1";
let temporaryDraft = null;
function clearSignupDraft() {
  temporaryDraft = null;
  try { sessionStorage.removeItem(signupDraftKey); } catch {}
  try { localStorage.removeItem(signupDraftKey); } catch {}
}
function saveSignupDraft({name, email, phone, country}, remember = false) {
  clearSignupDraft();
  temporaryDraft = {name, email, phone, country, expires: Date.now() + (remember ? 7 : 1) * 86400000};
  const json = JSON.stringify(temporaryDraft);
  try { sessionStorage.setItem(signupDraftKey, json); } catch {}
  if (remember) { try { localStorage.setItem(signupDraftKey, json); } catch {} }
}
function readSignupDraft() {
  for (const store of ["sessionStorage", "localStorage"]) {
    try {
      const draft = JSON.parse(window[store].getItem(signupDraftKey));
      if (draft && draft.expires > Date.now() && typeof draft.name === "string" && draft.name.trim()
          && typeof draft.email === "string" && draft.email.includes("@") && typeof draft.phone === "string"
          && typeof draft.country === "string") return draft;
      window[store].removeItem(signupDraftKey);
    } catch {}
  }
  return temporaryDraft?.expires > Date.now() ? temporaryDraft : null;
}
let tabSession = "";
if (brandedPage) {
  try { tabSession = sessionStorage.getItem(tabKey) || ""; } catch {}
}
let useTabSession = Boolean(tabSession);
function saveTabSession(value) {
  tabSession = value;
  try {
    if (value) sessionStorage.setItem(tabKey, value);
    else sessionStorage.removeItem(tabKey);
  } catch { /* Private browsers that disable storage can still use the open page. */ }
}
const serviceOrigin = brandedPage ? "https://leb-eats-black-card.raspy-waterfall-454f.workers.dev" : location.origin;
async function api(action, data) {
  const options = { credentials: useTabSession ? "omit" : "include", cache: "no-store", headers: {} };
  if (useTabSession) {
    options.headers["X-LEB-Session"] = "tab";
    if (tabSession) options.headers.Authorization = "Bearer " + tabSession;
  }
  if (data !== undefined) {
    options.method = "POST";
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(data);
  }
  const response = await fetch(serviceOrigin + "/account/api/" + action, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || "We couldn’t complete that request. Please try again.");
    error.status = response.status;
    error.field = result.field;
    throw error;
  }
  if (useTabSession && result.tabSession) saveTabSession(result.tabSession);
  if (["login","logout","register","reset"].includes(action)) {
    clearSignupDraft();
    // Other open pages recheck their own session, including browsers with tab-only sign-in.
    try { localStorage.setItem("leb.account.changed", crypto.randomUUID()); } catch {}
    window.dispatchEvent(new Event("leb-account-changed"));
  }
  return result;
}
