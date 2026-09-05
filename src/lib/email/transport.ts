import { randomUUID } from "node:crypto";

export type DeliveryResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
};

type Message = { from: string; to: string; subject: string; html: string; cc?: string[]; reply_to?: string };

/** One key and identical body for every retry, including ambiguous network failures. */
export async function deliverEmail(
  message: Message,
  options: { idempotencyKey?: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return process.env.NODE_ENV === "production"
      ? { success: false, error: "RESEND_API_KEY is not configured" }
      : { success: true, skipped: true };
  }
  const request = options.fetch || fetch;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const key = options.idempotencyKey || randomUUID();
  const body = JSON.stringify(message);
  let lastError = "Email delivery failed";
  for (let attempt = 0; attempt < 3; attempt++) {
    let delay = 1000 * 2 ** attempt;
    try {
      const response = await request(`${process.env.RESEND_API_BASE_URL || "https://api.resend.com"}/emails`, {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": key },
        body,
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && typeof payload.id === "string" && payload.id) {
        return { success: true, messageId: payload.id };
      }
      lastError = payload.message || (response.ok ? "Email provider returned no message ID" : `Resend API error (${response.status})`);
      const retryable = response.status === 429 || response.status >= 500 ||
        (response.status === 409 && payload.name === "concurrent_idempotent_requests");
      if (!retryable) return { success: false, error: lastError };
      const retryAfter = Number(response.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        // Return an explicit failure instead of retrying before a long quota reset.
        if (retryAfter > 10) return { success: false, error: lastError };
        delay = Math.max(delay, retryAfter * 1000);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Email network failure";
    }
    if (attempt < 2) await sleep(delay);
  }
  return { success: false, error: lastError };
}
