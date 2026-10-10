// Recruiter SMS routing via Twilio's REST API (fetch-only, no SDK -- same
// shape as operations/email.ts's direct Resend call, which suits stateless
// Deno Edge Functions).
//
// Deliberately best-effort: sendRecruiterSms() never throws. The application
// row is already saved before this runs, so a Twilio hiccup must not fail the
// candidate's submit or lose the lead -- the caller logs the failure and the
// lead is still in the `applications` table for follow-up.

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  recruiterNumber: string;
}

function getTwilioConfig(): TwilioConfig | null {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");
  const recruiterNumber = Deno.env.get("APPLICATIONS_RECRUITER_SMS");
  if (!accountSid || !authToken || !fromNumber || !recruiterNumber) return null;
  return { accountSid, authToken, fromNumber, recruiterNumber };
}

/**
 * Text the on-call recruiter about a new application. Returns a small result so
 * the caller can record whether the alert went out, without ever throwing.
 */
export async function sendRecruiterSms(
  body: string,
): Promise<{ sent: boolean; reason?: string }> {
  const cfg = getTwilioConfig();
  if (!cfg) {
    return {
      sent: false,
      reason:
        "SMS not configured (missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER / APPLICATIONS_RECRUITER_SMS).",
    };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
    const form = new URLSearchParams({
      To: cfg.recruiterNumber,
      From: cfg.fromNumber,
      Body: body,
    });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${cfg.accountSid}:${cfg.authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      return { sent: false, reason: `Twilio API error (${res.status}): ${text}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
