const origins = new Set(["https://lebeats.uk", "https://www.lebeats.uk"]);
const originalConsent = "Sign up for Black Card updates and LEB EATS discounts by email.";
const loyaltyConsent = "Sign up for Loyalty Card updates and LEB EATS discounts by email.";
const maxBytes = 4096;

async function readSignup(request) {
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
  async fetch(request, env) {
    if (new URL(request.url).pathname !== "/signup") return new Response(null, { status: 404 });
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
    if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
      return new Response(null, { status: 415, headers });
    }
    try {
      const { success } = await env.SIGNUP_LIMIT.limit({ key: request.headers.get("CF-Connecting-IP") || "unknown" });
      if (!success) return new Response(null, { status: 429, headers: { ...headers, "Retry-After": "60" } });

      const data = await readSignup(request).catch(() => null);
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
        "INSERT INTO signups (email, name, phone, consent_text) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING"
      ).bind(email, name, phone, consentText).run();
      return Response.json({ saved: true }, { headers });
    } catch {
      return new Response(null, { status: 503, headers });
    }
  }
};
