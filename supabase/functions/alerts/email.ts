import { MatchedShift } from "./db.ts";

// Resend integration, same shape as operations/email.ts.
function getResendConfig() {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !fromEmail) {
    throw new Error("Missing RESEND_API_KEY or RESEND_FROM_EMAIL in the function's environment.");
  }
  return { apiKey, fromEmail };
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const { apiKey, fromEmail } = getResendConfig();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromEmail, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

/** Email a caregiver the new shifts matching one of their saved searches. */
export async function sendJobAlertEmail(
  to: string,
  caregiverName: string,
  searchLabel: string,
  shifts: MatchedShift[],
): Promise<void> {
  const items = shifts.map((s) => {
    const pay = s.payRateMin != null && s.payRateMax != null ? ` — $${s.payRateMin}–$${s.payRateMax}/hr` : "";
    const where = s.city ? ` (${s.city})` : "";
    return `<li><strong>${escapeHtml(s.role)}</strong> at ${escapeHtml(s.facility)}${escapeHtml(where)}${pay}</li>`;
  }).join("");

  await sendEmail(
    to,
    `${shifts.length} new ${shifts.length === 1 ? "shift" : "shifts"} matching “${searchLabel}”`,
    `
      <p>Hi ${escapeHtml(caregiverName.split(" ")[0])},</p>
      <p>New openings just matched your saved search <strong>“${escapeHtml(searchLabel)}”</strong>:</p>
      <ul>${items}</ul>
      <p>Log in to your Complete Staffing portal to apply — these fill fast.</p>
    `,
  );
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
