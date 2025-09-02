require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Resend } = require("resend");
const { z } = require("zod");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Zod Schema for Validation ────────────────────────────────────────
const QuoteSchema = z.object({
  name: z.string().min(2),
  company: z.string().min(2),
  email: z.string().email(),
  phone: z
    .string()
    .regex(
      /^(\+27\s?[6-8]\d\s?\d{3}\s?\d{4}|0[6-8]\d\s?\d{3}\s?\d{4})$/,
      "Invalid South African number"
    ),
  service: z.string().min(1),
  message: z.string().max(400).optional(),
  captchaToken: z.string().optional(),
});

// ─── POST Endpoint ─────────────────────────────────────────────────────
app.post("/quote", async (req, res) => {
  // 1. Validate input
  const parsed = QuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ errors: parsed.error.format() });
  }

  const { name, company, email, phone, service, message, captchaToken } =
    parsed.data;

  // 2. (Optional) CAPTCHA Verification
  if (captchaToken && process.env.RECAPTCHA_SECRET) {
    try {
      const verifyRes = await fetch(
        "https://www.google.com/recaptcha/api/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: process.env.RECAPTCHA_SECRET,
            response: captchaToken,
          }),
        }
      );

      const verifyData = await verifyRes.json();
      if (!verifyData.success || verifyData.score < 0.4) {
        return res.status(403).json({ message: "Failed CAPTCHA verification" });
      }
    } catch (err) {
      console.error("reCAPTCHA verify error", err);
    }
  }

  // 3. Send email
  try {
    const { error: sendError } = await resend.emails.send({
      from: process.env.MAIL_FROM,
      to: [process.env.MAIL_TO],
      replyTo: email,
      subject: `Motshete Website Quote: ${service} – ${company}`,
      html: `
        <h2>New Quote Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Company:</strong> ${company}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Service:</strong> ${service}</p>
        ${message ? `<p><strong>Message:</strong><br/>${message.replace(/\n/g, "<br/>")}</p>` : ""}
        <hr/>
        <small>Submitted at ${new Date().toLocaleString("en-ZA")}</small>
      `,
    });

    if (sendError) {
      throw sendError;
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("✉️ send error:", err);
    return res.status(500).json({ message: "Email delivery failed" });
  }
});

// ─── Start (for local dev only) ───────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Motshete Backend running at http://localhost:${PORT}`);
});
