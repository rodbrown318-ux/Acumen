import { StaffRequestInput } from "./types.ts";

// Best-effort email to the agency when a facility requests staff. Never throws:
// the request is already saved before this runs, so a mail hiccup must not fail
// the facility's submit. Uses Resend like operations/email.ts.
export async function notifyAgency(
  input: StaffRequestInput,
  tenantName: string,
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  const to = Deno.env.get("STAFFING_NOTIFY_EMAIL") || Deno.env.get("OPERATIONS_ESCALATION_EMAIL");
  if (!apiKey || !fromEmail || !to) {
    return { sent: false, reason: "Missing RESEND_API_KEY / RESEND_FROM_EMAIL / STAFFING_NOTIFY_EMAIL." };
  }

  const rows = [
    ["Facility", input.facilityName],
    ["Requester", `${input.requesterName} — ${input.requesterEmail}${input.requesterPhone ? ` / ${input.requesterPhone}` : ""}`],
    ["Role", `${input.role}${input.credential ? ` (${input.credential})` : ""}`],
    ["Headcount", String(input.headcount ?? 1)],
    ["City", input.city ?? "—"],
    ["Type", input.employmentType ?? "—"],
    ["Dates", `${input.startDate ?? "—"}${input.endDate ? ` → ${input.endDate}` : ""}`],
    ["Notes", input.notes ?? "—"],
  ].map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`).join("");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to,
        subject: `New staff request: ${input.headcount ?? 1}× ${input.role} — ${input.facilityName}`,
        html: `<p>New staffing request for <strong>${escapeHtml(tenantName)}</strong>:</p><ul>${rows}</ul>`,
      }),
    });
    if (!res.ok) return { sent: false, reason: `Resend API error (${res.status}): ${await res.text()}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
