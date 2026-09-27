/* E-MAIL (2026-09-27): sent through Resend (resend.com) when RESEND_API_KEY
   is set; MAIL_FROM is the sender, on a domain verified there (e.g.
   "8K Labels <hello@8k.wine>"). Without a key nothing is sent and the
   caller is told so — the admin then sees the link on the page instead. */
export async function sendMail(m: { to: string; subject: string; text: string; html?: string }): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "e-mail is not set up (RESEND_API_KEY)" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || "8K Labels <onboarding@resend.dev>", to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }),
  });
  if (!r.ok) return { sent: false, error: `mail failed (${r.status}): ${(await r.text()).slice(0, 200)}` };
  return { sent: true };
}
