// Cloudflare Worker: serves the static site and handles the contact form.
// POST /api/contact sends the message through Resend (https://resend.com).
//
// Required secret:   RESEND_API_KEY   (wrangler secret put RESEND_API_KEY)
// Optional vars:     CONTACT_TO, CONTACT_FROM (see wrangler.jsonc)

const MAX = { name: 200, email: 320, message: 5000 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "recodelabs.org") {
      url.hostname = "www.recodelabs.org";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      return handleContact(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  const respond = (ok, error, status) =>
    wantsJson
      ? json(ok ? { ok: true } : { ok: false, error }, status)
      : Response.redirect(new URL(`/?contact=${ok ? "sent" : "error"}#contact`, request.url).toString(), 303);

  let data;
  try {
    const form = await request.formData();
    data = Object.fromEntries(form);
  } catch {
    return respond(false, "Could not read the form.", 400);
  }

  // Honeypot: real visitors never fill this hidden field.
  if (data.company) return respond(true, null, 200);

  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim();
  const message = String(data.message || "").trim();

  if (!name || !email || !message) return respond(false, "Please fill in every field.", 400);
  if (name.length > MAX.name || email.length > MAX.email || message.length > MAX.message) {
    return respond(false, "One of the fields is too long.", 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond(false, "Please enter a valid email address.", 400);

  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return respond(false, "The form is not configured yet.", 500);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM || "Recode Labs website <website@recodelabs.org>",
      to: [env.CONTACT_TO || "hello@recodelabs.org"],
      reply_to: `${name.replace(/[<>"\r\n]/g, "")} <${email}>`,
      subject: `Website contact: ${name.replace(/[\r\n]/g, " ").slice(0, 80)}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}\n`,
    }),
  });

  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return respond(false, "The message could not be sent. Please email hello@recodelabs.org.", 502);
  }
  return respond(true, null, 200);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
