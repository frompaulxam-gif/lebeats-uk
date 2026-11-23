(() => {
  const endpoint = "https://leb-eats-black-card.raspy-waterfall-454f.workers.dev/events";
  const apiBase = new URL("/account/api/", endpoint).href;
  let receipt = null;
  let permissionRevision = 0;
  function sessionOptions() {
    let token;
    try { token = sessionStorage.getItem("leb.account.tab"); } catch {}
    return token ? { credentials: "omit", headers: {"Authorization":"Bearer " + token, "X-LEB-Session":"tab"} }
      : {credentials:"include", headers:{}};
  }
  async function refreshPermission() {
    const revision = ++permissionRevision;
    receipt = null;
    if (disabled || document.hidden || location.origin !== "https://lebeats.uk") return;
    try {
      const response = await fetch(apiBase + "activity-setting?scope=buttons", {
        ...sessionOptions(), cache:"no-store", referrerPolicy:"no-referrer"
      });
      if (!response.ok) return;
      const permission = await response.json();
      if (revision === permissionRevision) receipt = permission.receipt;
    } catch { /* Aggregate counts work independently of the account service. */ }
  }
  const preferenceKey = "lebeats.measurement.off";
  const privacySignal = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
  let disabled = privacySignal;
  try { disabled ||= localStorage.getItem(preferenceKey) === "1"; } catch {}
  const checkbox = document.querySelector("[data-measurement-optout]");
  if (checkbox) {
    checkbox.checked = disabled;
    checkbox.disabled = privacySignal;
    checkbox.addEventListener("change", () => {
      disabled = checkbox.checked;
      refreshPermission();
      try {
        if (disabled) localStorage.setItem(preferenceKey, "1");
        else localStorage.removeItem(preferenceKey);
      } catch {}
    });
  }

  window.addEventListener("storage", event => {
    if (event.key !== preferenceKey && event.key !== null) return;
    disabled = privacySignal || event.newValue === "1";
    if (checkbox) checkbox.checked = disabled;
    refreshPermission();
  });

  document.addEventListener("visibilitychange", refreshPermission);
  window.addEventListener("pageshow", e => { if (e.persisted) refreshPermission(); });
  refreshPermission();

  const knownSources = new Set(["instagram", "facebook", "tiktok", "google", "google_business",
    "google_ads", "meta_ads", "poster", "email", "direct", "other", "internal_test"]);
  const url = new URL(location.href);
  const referrer = document.referrer ? new URL(document.referrer) : null;
  const tag = url.searchParams.get("utm_source")?.toLowerCase();
  function trafficSource() {
    if (tag) return knownSources.has(tag) ? tag : "other";
    if (!referrer) return "direct";
    const host = referrer.hostname;
    if (referrer.origin === location.origin) return "internal";
    for (const service of ["instagram", "facebook", "tiktok"]) {
      if (host === service + ".com" || host.endsWith("." + service + ".com")) return service;
    }
    if (/(^|\.)google\.(com|co\.uk)$/.test(host)) return "google";
    return "other";
  }
  const source = trafficSource();
  window.lebSignupSource = () => disabled ? null : source;
  function record(action, placement) {
    if (disabled) return;
    fetch(endpoint, { method: "POST", credentials: "omit", keepalive: true,
      referrerPolicy: "no-referrer", body: JSON.stringify({action, source, placement})
    }).catch(() => {});
    if (placement && receipt) {
      const options = sessionOptions();
      fetch(apiBase + "member-click", { ...options, method:"POST", keepalive:true,
        headers:{...options.headers, "Content-Type":"application/json"}, referrerPolicy:"no-referrer",
        body:JSON.stringify({eventId:crypto.randomUUID(), receipt, action, placement, source})
      }).catch(() => {});
    }
  }
  // Carry only a recognised channel between the two public pages. No visitor identifier.
  if (!disabled && source !== "internal") {
    for (const link of document.querySelectorAll('a[href]')) {
      const dest = new URL(link.href, location.href);
      if (dest.origin !== location.origin || dest.pathname === url.pathname ||
          !["/", "/menu.html"].includes(dest.pathname)) continue;
      dest.searchParams.set("utm_source", source);
      link.href = dest.href;
    }
  }
  const menuPage = url.pathname === "/menu.html";
  function countPage() {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", countPage);
    record(menuPage ? "menu_page" : "home_page");
  }
  document.addEventListener("visibilitychange", countPage);
  countPage();
  // Cached pages published before button tagging can still contribute to the original totals.
  const legacyPage = !document.querySelector("[data-measure-click]");
  function legacyAction(href) {
    const dest = new URL(href);
    if (dest.protocol === "tel:") return "call";
    if (dest.protocol === "mailto:") return "email_tap";
    if (dest.origin === url.origin && (dest.hash === "#menu-list" ||
        dest.pathname === "/assets/leb-eats-printed-menu.jpg")) return "menu_open";
    if (dest.hostname === "www.google.com" && dest.pathname.startsWith("/maps")) return "directions";
    return { "deliveroo.co.uk": "deliveroo", "www.ubereats.com": "uber_eats",
      "www.instagram.com": "instagram_tap", "www.tiktok.com": "tiktok_tap" }[dest.hostname];
  }
  function trackLink(event) {
    if (!event.isTrusted || (event.type === "auxclick" && event.button !== 1)) return;
    if (legacyPage) {
      const href = event.target.closest?.("a[href]")?.href;
      const action = href && legacyAction(href);
      if (action) record(action);
      return;
    }
    const control = event.target.closest?.("[data-measure-click]");
    if (!control || (event.type === "auxclick" && !control.matches("a[href]"))) return;
    const [placement, action] = control.dataset.measureClick.split(".");
    record(action, placement);
  }
  document.addEventListener("click", trackLink, true);
  document.addEventListener("auxclick", trackLink, true);
  const dialog = document.getElementById("card-dialog");
  if (dialog) {
    const firstOpen = new MutationObserver(() => {
      if (dialog.open) {
        record("form_view");
        firstOpen.disconnect();
      }
    });
    firstOpen.observe(dialog, { attributes: true, attributeFilter: ["open"] });
  }
  document.getElementById("card-form")?.addEventListener("input", () => record("form_start"), {once:true});
})();
