// api/quote.js

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

// ─── Validation Schema ──────────────────────────────────────────────
const QuoteSchema = z.object({
  name: z.string().min(2),
  company: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(7),
  service: z.string().min(1),
  message: z.string().max(400).optional(),

  // Optional tracking/meta fields
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  page: z.string().optional(),
  referral: z.string().optional(),
  captchaToken: z.string().optional(),
});

app.post("/quote", async (req, res) => {
  const parsed = QuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ errors: parsed.error.format() });
  }

  const {
    name,
    company,
    email,
    phone,
    service,
    message,
  } = parsed.data;

  try {
    const { error: sendError } = await resend.emails.send({
      from: process.env.MAIL_FROM,
      to: [process.env.MAIL_TO],
      replyTo: email,
      subject: `Quote Request: ${service} – ${company}`,
      html: `
        <h2>New Quote Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Company:</strong> ${company}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Service:</strong> ${service}</p>
        ${message ? `<p><strong>Message:</strong><br/>${message.replace(/\n/g, "<br/>")}</p>` : ""}
        <hr/>
        <p><small>Received at ${new Date().toLocaleString("en-ZA")}</small></p>
      `,
    });

    if (sendError) throw sendError;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("✉️ Email send failed:", err);
    return res
      .status(500)
      .json({ message: "Could not send quote request email" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Quote API listening on http://localhost:${PORT}`);
});
