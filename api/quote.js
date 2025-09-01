// api/quote.js
const { Resend } = require("resend");
const { z } = require("zod");

// CORS allowlist (adjust to your frontend origin)
const ALLOW_ORIGINS = [
  "https://www.motshete.com",
  "https://motshete.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

const QuoteSchema = z.object({
  name: z.string().min(2),
  company: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(7),
  service: z.string().min(1),
  message: z.string().max(400).optional(),
  // optional extras you might send
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  page: z.string().optional(),
  referral: z.string().optional(),
  captchaToken: z.string().optional(),
});

function cors(res, origin) {
  const allowed = origin && ALLOW_ORIGINS.includes(origin);
  res.setHeader(
    "Access-Control-Allow-Origin",
    allowed ? origin : "https://www.motshete.com"
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  cors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method Not Allowed" });

  // Parse JSON body (Vercel provides it already; still safe guard)
  let body = req.body;
  if (!body || typeof body !== "object") {
    try {
      body = JSON.parse(req.body || "{}");
    } catch {
      body = {};
    }
  }

  const parsed = QuoteSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(422).json({ errors: parsed.error.format() });
  }

  const { name, company, email, phone, service, message } = parsed.data;

  // Basic env checks to avoid opaque 500s
  const requiredEnv = ["RESEND_API_KEY", "MAIL_FROM", "MAIL_TO"];
  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length) {
    return res.status(500).json({
      message: "Server misconfigured",
      details: `Missing env: ${missing.join(", ")}`,
    });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { error } = await resend.emails.send({
      from: `Quotes <${process.env.MAIL_FROM}>`, // e.g. quotes@send.motshete.com
      to: [process.env.MAIL_TO], // your inbox
      replyTo: email,
      subject: `Quote Request: ${service} – ${company}`,
      html: `
        <h2>New Quote Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Company:</strong> ${company}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Service:</strong> ${service}</p>
        ${message ? `<p><strong>Message:</strong><br/>${String(message).replace(/\n/g, "<br/>")}</p>` : ""}
        <hr/>
        <p><small>Received at ${new Date().toLocaleString("en-ZA")}</small></p>
      `,
    });

    if (error) {
      // Common causes: domain not verified, wrong from, invalid to
      console.error("Resend error:", error);
      return res.status(502).json({
        message: "Email provider error",
        details: error.message || String(error),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Unhandled send error:", err);
    return res.status(500).json({
      message: "Could not send quote request email",
      details: err?.message || String(err),
    });
  }
};
