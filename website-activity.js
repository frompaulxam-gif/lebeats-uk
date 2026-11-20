(() => {
  const endpoint = "https://leb-eats-black-card.raspy-waterfall-454f.workers.dev/events";
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
      try {
        if (disabled) localStorage.setItem(preferenceKey, "1");
        else localStorage.removeItem(preferenceKey);
      } catch {}
    });
  }

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
  function record(action) {
    if (disabled) return;
    fetch(endpoint, { method: "POST", credentials: "omit", keepalive: true,
      referrerPolicy: "no-referrer", body: JSON.stringify({action, source})
    }).catch(() => {});
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
  const metricByHost = new Map([
    ["deliveroo.co.uk", "deliveroo"], ["www.ubereats.com", "uber_eats"],
    ["www.instagram.com", "instagram_tap"], ["www.tiktok.com", "tiktok_tap"]
  ]);
  const menuPage = url.pathname === "/menu.html";
  function countPage() {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", countPage);
    record(menuPage ? "menu_page" : "home_page");
  }
  document.addEventListener("visibilitychange", countPage);
  countPage();
  function trackLink(event) {
    if (!event.isTrusted || (event.type === "auxclick" && event.button !== 1)) return;
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const dest = new URL(link.href, location.href);
    if (dest.protocol === "tel:") record("call");
    else if (dest.protocol === "mailto:") record("email_tap");
    else if (dest.origin === url.origin && (dest.hash === "#menu-list" ||
             dest.pathname === "/assets/leb-eats-printed-menu.jpg")) record("menu_open");
    else if (dest.hostname === "www.google.com" && dest.pathname.startsWith("/maps")) record("directions");
    else if (metricByHost.has(dest.hostname)) record(metricByHost.get(dest.hostname));
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
