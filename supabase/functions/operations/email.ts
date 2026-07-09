import { Caregiver, Shift } from "./types.ts";

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
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromEmail, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

export async function sendShiftOfferEmail(
  caregiver: Caregiver,
  shift: Shift,
  respondBaseUrl: string,
  responseToken: string,
): Promise<void> {
  const acceptUrl = `${respondBaseUrl}?token=${responseToken}&decision=accept`;
  const declineUrl = `${respondBaseUrl}?token=${responseToken}&decision=decline`;

  await sendEmail(
    caregiver.email,
    `Shift offer: ${shift.client_site} on ${formatDate(shift.start_time)}`,
    `
      <p>Hi ${escapeHtml(caregiver.full_name)},</p>
      <p>You've been matched to a shift:</p>
      <ul>
        <li><strong>Site:</strong> ${escapeHtml(shift.client_site)}</li>
        <li><strong>Role:</strong> ${escapeHtml(shift.role_required)}</li>
        <li><strong>Start:</strong> ${formatDate(shift.start_time)}</li>
        <li><strong>End:</strong> ${formatDate(shift.end_time)}</li>
      </ul>
      <p>
        <a href="${acceptUrl}">Accept this shift</a> &nbsp;|&nbsp;
        <a href="${declineUrl}">Decline</a>
      </p>
    `,
  );
}

export async function sendEscalationAlert(escalationEmail: string, shift: Shift): Promise<void> {
  await sendEmail(
    escalationEmail,
    `URGENT: Shift unfilled 4 hours before start — ${shift.client_site}`,
    `
      <p>The following shift is still unfilled less than 4 hours before it starts:</p>
      <ul>
        <li><strong>Site:</strong> ${escapeHtml(shift.client_site)}</li>
        <li><strong>Role:</strong> ${escapeHtml(shift.role_required)}</li>
        <li><strong>Start:</strong> ${formatDate(shift.start_time)}</li>
        <li><strong>Shift ID:</strong> ${shift.id}</li>
      </ul>
      <p>The Operations Agent could not find or confirm a caregiver in time. Manual follow-up is needed.</p>
    `,
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toUTCString();
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
