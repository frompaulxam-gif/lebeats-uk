import { knownButton, sources } from "./member-activity.mjs";
import { accountRequest } from "./accounts.mjs";

const origins = new Set(["https://lebeats.uk", "https://www.lebeats.uk"]);
const originalConsent = "Sign up for Black Card updates and LEB EATS discounts by email.";
const loyaltyConsent = "Sign up for Loyalty Card updates and LEB EATS discounts by email.";
const maxBytes = 4096;
const actions = new Set(["home_page", "menu_page", "menu_open", "call", "email_tap",
  "deliveroo", "uber_eats", "directions", "form_view", "form_start", "instagram_tap", "tiktok_tap"]);

async function readPayload(request) {
  if (!request.body || Number(request.headers.get("Content-Length")) > maxBytes) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

export default {
  async scheduled(_event, env) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM member_click_history WHERE clicked_at <= unixepoch('now','-30 days')"),
      env.DB.prepare("DELETE FROM counter_sessions WHERE expires_at<=unixepoch()")
    ]);
  },

  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === "/account" || path.startsWith("/account/")) return accountRequest(request, env, ctx, readPayload);
    if (path !== "/signup" && path !== "/events") return new Response(null, { status: 404 });
    const origin = request.headers.get("Origin");
    if (!origins.has(origin)) return new Response(null, { status: 403 });
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return new Response(null, { status: 405, headers });
    const contentType = request.headers.get("Content-Type")?.split(";")[0].trim();
    const activity = path === "/events";
    if (contentType !== (activity ? "text/plain" : "application/json")) {
      return new Response(null, { status: 415, headers });
    }
    try {
      const limiter = activity ? env.ACTIVITY_LIMIT : env.SIGNUP_LIMIT;
      const { success } = await limiter.limit({ key: request.headers.get("CF-Connecting-IP") || "unknown" });
      if (!success) return new Response(null, { status: 429, headers: { ...headers, "Retry-After": "60" } });

      const data = await readPayload(request).catch(() => null);
      if (activity) {
        const { action, source, placement } = data ?? {};
        const validAction = placement === undefined ? actions.has(action)
          : knownButton(placement, action);
        if (!validAction || !sources.has(source)) return new Response(null, { status: 422, headers });
        const day = new Date().toISOString().slice(0, 10);
        const total = env.DB.prepare(`
          INSERT INTO website_activity (day, source, action, total) VALUES (?, ?, ?, 1)
          ON CONFLICT(day, source, action) DO UPDATE SET total = total + 1
        `).bind(day, source, action);
        if (placement === undefined) await total.run();
        else {
          const click = env.DB.prepare(`
            INSERT INTO website_button_clicks (day, source, placement, action, total) VALUES (?, ?, ?, ?, 1)
            ON CONFLICT(day, source, placement, action) DO UPDATE SET total = total + 1
          `).bind(day, source, placement, action);
          await env.DB.batch([total, click]);
        }
        return new Response(null, { status: 204, headers });
      }
      const name = typeof data?.name === "string" ? data.name.trim() : "";
      const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
      if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/u.test(name)
          || email.length > 254 || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/u.test(email)) {
        return new Response(null, { status: 422, headers });
      }
      if (data.phone != null && typeof data.phone !== "string") return new Response(null, { status: 422, headers });
      const phone = data.phone?.trim() || null;
      if (phone) {
        const digits = phone.replace(/[^0-9]/g, "");
        if (phone.length > 40 || !/^\+?[0-9 ().-]+$/.test(phone) || digits.length < 7 || digits.length > 15) {
          return new Response(null, { status: 422, headers });
        }
      }
      const consentText = data.formVersion === "loyalty-card" ? loyaltyConsent : originalConsent;
      await env.DB.prepare(
        "INSERT INTO signups (email, name, phone, consent_text, signup_source) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING"
      ).bind(email, name, phone, consentText, sources.has(data.source) ? data.source : null).run();
      return Response.json({ saved: true }, { headers });
    } catch {
      return new Response(null, { status: 503, headers });
    }
  }
};
