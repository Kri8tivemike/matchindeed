/**
 * SMS Provider Integration — Africa's Talking & Sinch
 *
 * Unified SMS sending interface with two provider options:
 * - Africa's Talking (best for Nigeria/Africa — cheaper local rates)
 * - Sinch (best for global reach)
 *
 * The active provider is determined by which env vars are set.
 * If both are configured, Africa's Talking is preferred for African numbers.
 *
 * Environment variables (set ONE provider):
 *
 * Africa's Talking:
 *   AT_API_KEY      — from https://africastalking.com
 *   AT_USERNAME     — Africa's Talking username
 *   AT_SENDER_ID    — SMS sender ID (e.g., "MatchIndeed")
 *
 * Sinch:
 *   SINCH_SERVICE_PLAN_ID — from https://dashboard.sinch.com
 *   SINCH_API_TOKEN       — Sinch API token
 *   SINCH_SENDER_NUMBER   — Sinch sender number (E.164 format)
 *
 * Usage:
 *   import { sendSMS } from "@/lib/sms";
 *   await sendSMS("+2348012345678", "Your OTP is 123456");
 */

// ---------------------------------------------------------------
// Africa's Talking SMS
// ---------------------------------------------------------------
async function sendViaAfricasTalking(
  to: string,
  message: string
): Promise<boolean> {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  const senderId = process.env.AT_SENDER_ID || "MatchIndeed";

  if (!apiKey || !username) return false;

  try {
    const params = new URLSearchParams({
      username,
      to,
      message,
      from: senderId,
    });

    const response = await fetch(
      "https://api.africastalking.com/version1/messaging",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          apiKey,
        },
        body: params.toString(),
      }
    );

    const data = await response.json();
    const recipients = data?.SMSMessageData?.Recipients || [];

    // Check if any recipient succeeded
    return recipients.some(
      (r: { status: string }) => r.status === "Success" || r.status === "Sent"
    );
  } catch (error) {
    console.error("[Africa's Talking] SMS failed:", error);
    return false;
  }
}

// ---------------------------------------------------------------
// Sinch SMS
// ---------------------------------------------------------------
async function sendViaSinch(to: string, message: string): Promise<boolean> {
  const servicePlanId = process.env.SINCH_SERVICE_PLAN_ID;
  const apiToken = process.env.SINCH_API_TOKEN;
  const senderNumber = process.env.SINCH_SENDER_NUMBER;

  if (!servicePlanId || !apiToken || !senderNumber) return false;

  try {
    const response = await fetch(
      `https://us.sms.api.sinch.com/xms/v1/${servicePlanId}/batches`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          from: senderNumber,
          to: [to],
          body: message,
        }),
      }
    );

    const data = await response.json();
    return !!data.id; // Sinch returns a batch ID on success
  } catch (error) {
    console.error("[Sinch] SMS failed:", error);
    return false;
  }
}

// ---------------------------------------------------------------
// Unified SMS Interface
// ---------------------------------------------------------------

/**
 * Detect if a phone number is African (starts with African country codes).
 */
function isAfricanNumber(phone: string): boolean {
  const africanPrefixes = [
    "+234", // Nigeria
    "+254", // Kenya
    "+256", // Uganda
    "+255", // Tanzania
    "+233", // Ghana
    "+27",  // South Africa
    "+225", // Ivory Coast
    "+237", // Cameroon
    "+251", // Ethiopia
  ];
  return africanPrefixes.some((prefix) => phone.startsWith(prefix));
}

/**
 * Detect which provider is configured.
 */
function getAvailableProvider(): "africastalking" | "sinch" | null {
  if (process.env.AT_API_KEY && process.env.AT_USERNAME) return "africastalking";
  if (process.env.SINCH_SERVICE_PLAN_ID && process.env.SINCH_API_TOKEN) return "sinch";
  return null;
}

/**
 * Send an SMS message.
 * Automatically selects the best provider based on configuration and destination.
 *
 * @param to - Phone number in E.164 format (e.g., "+2348012345678")
 * @param message - SMS text (max 160 chars for single SMS)
 */
export async function sendSMS(to: string, message: string): Promise<boolean> {
  const provider = getAvailableProvider();

  if (!provider) {
    console.warn("[SMS] No SMS provider configured — skipping");
    return false;
  }

  // If both providers were available, prefer Africa's Talking for African numbers
  if (provider === "africastalking" || isAfricanNumber(to)) {
    const atResult = await sendViaAfricasTalking(to, message);
    if (atResult) return true;
  }

  // Fallback to Sinch for international numbers
  if (provider === "sinch") {
    return sendViaSinch(to, message);
  }

  return false;
}

// ---------------------------------------------------------------
// Pre-built SMS Templates
// ---------------------------------------------------------------
export const SMS_TEMPLATES = {
  OTP: (code: string) =>
    `Your MatchIndeed verification code is: ${code}. Valid for 10 minutes.`,

  MEETING_REMINDER: (name: string, time: string) =>
    `Reminder: Your MatchIndeed video meeting with ${name} is at ${time}. Don't be late!`,

  MATCH_NOTIFICATION: (name: string) =>
    `You have a new match on MatchIndeed! ${name} is interested in you. Open the app to connect.`,

  ACCOUNT_ALERT: (action: string) =>
    `MatchIndeed security alert: ${action}. If this wasn't you, contact support immediately.`,
} as const;
