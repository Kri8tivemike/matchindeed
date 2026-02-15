/**
 * Email Sending Utility for MatchIndeed
 *
 * Provides a centralized email sending service using Postmark.
 * Falls back gracefully when POSTMARK_SERVER_TOKEN is not configured (dev mode).
 *
 * Environment variables:
 * - POSTMARK_SERVER_TOKEN: Server API token from postmarkapp.com
 * - EMAIL_FROM: Sender email (default: noreply@matchindeed.com)
 * - NEXT_PUBLIC_APP_URL: Used for generating dashboard links in templates
 */

import * as postmark from "postmark";
import {
  generateEmail,
  type EmailTemplate,
  type EmailData,
} from "./email-templates";
import { shouldSendEmail } from "./notification-preferences";

// ---------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------

const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN;
const EMAIL_FROM = process.env.EMAIL_FROM || "MatchIndeed <noreply@matchindeed.com>";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

/**
 * Use the "outbound" stream in production and the "broadcast" stream
 * in development so test emails go through Postmark's API (validating
 * your integration) but hit a separate stream you can easily monitor.
 * Set POSTMARK_MESSAGE_STREAM=outbound in production .env.
 */
const MESSAGE_STREAM = process.env.POSTMARK_MESSAGE_STREAM || "outbound";

/** Whether email sending is available */
const isEmailConfigured = !!POSTMARK_SERVER_TOKEN;

/** Postmark client (only instantiated when configured) */
const client = isEmailConfigured
  ? new postmark.ServerClient(POSTMARK_SERVER_TOKEN!)
  : null;

// ---------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------

export type SendEmailOptions = {
  to: string;
  template: EmailTemplate;
  data: EmailData;
  /** Override the generated subject line */
  subject?: string;
  /** CC recipients */
  cc?: string[];
  /** Reply-to address */
  replyTo?: string;
  /**
   * Recipient's user ID — when provided, the system checks their
   * notification preferences before sending. If the user has opted
   * out of email for this category, the email is silently skipped.
   * Omit to always send (e.g. system/admin emails).
   */
  recipientUserId?: string;
};

export type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  /** True when email was skipped because Postmark is not configured */
  skipped?: boolean;
};

// ---------------------------------------------------------------
// CORE SEND FUNCTION
// ---------------------------------------------------------------

/**
 * Send an email using a pre-defined template.
 *
 * In development (without POSTMARK_SERVER_TOKEN), logs the email to the console
 * instead of sending, to avoid errors and allow easy debugging.
 *
 * @param options - Email options including recipient, template, and template data
 * @returns Result object with success status
 */
/**
 * Maps email templates to notification type strings used by
 * the preference system. Used to check if the user opted out.
 */
const TEMPLATE_TO_NOTIFICATION_TYPE: Record<string, string> = {
  meeting_request: "meeting_request",
  meeting_accepted: "meeting_accepted",
  meeting_cancelled: "meeting_cancelled",
  meeting_reminder: "meeting_reminder",
  meeting_completed: "meeting_completed",
  cancellation_charge: "meeting_cancelled",
  investigation_notice: "meeting_investigation",
  investigation_resolved: "investigation_resolved",
  match_found: "match_found",
  response_submitted: "meeting_response_submitted",
  credit_refund: "credit_refund",
  welcome: "welcome", // Always sent (system)
  account_warning: "account_warning", // Always sent (system)
};

export async function sendEmail(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  try {
    // ---- Check notification preferences ----
    if (options.recipientUserId) {
      const notificationType =
        TEMPLATE_TO_NOTIFICATION_TYPE[options.template] || options.template;

      try {
        const allowed = await shouldSendEmail(
          options.recipientUserId,
          notificationType
        );
        if (!allowed) {
          console.log(
            `[Email] Skipped "${options.template}" to ${options.to} — user opted out`
          );
          return { success: true, skipped: true };
        }
      } catch {
        // If preference check fails, send anyway (fail-open)
      }
    }

    // Ensure data has the dashboard URL for links
    const enrichedData: EmailData = {
      ...options.data,
      dashboardUrl: options.data.dashboardUrl || `${APP_URL}/dashboard`,
    };

    // Generate email content from template
    const { subject: generatedSubject, html } = generateEmail(
      options.template,
      enrichedData
    );

    const subject = options.subject || generatedSubject;

    // If Postmark is not configured, log to console (dev mode)
    if (!client) {
      console.log(
        `[Email] (Dev Mode — No POSTMARK_SERVER_TOKEN) Would send email:`,
        {
          to: options.to,
          subject,
          template: options.template,
          dataKeys: Object.keys(options.data),
        }
      );
      return { success: true, skipped: true };
    }

    // Send via Postmark
    const result = await client.sendEmail({
      From: EMAIL_FROM,
      To: options.to,
      Subject: subject,
      HtmlBody: html,
      Cc: options.cc?.join(", ") || undefined,
      ReplyTo: options.replyTo || undefined,
      MessageStream: MESSAGE_STREAM,
    });

    if (result.ErrorCode !== 0) {
      console.error("[Email] Postmark error:", result.Message);
      return { success: false, error: result.Message };
    }

    console.log(`[Email] Sent "${options.template}" to ${options.to}`, {
      messageId: result.MessageID,
    });
    return { success: true, messageId: result.MessageID };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected email error";
    console.error("[Email] Unexpected error:", error);
    return {
      success: false,
      error: message,
    };
  }
}

// ---------------------------------------------------------------
// CONVENIENCE FUNCTIONS
// Each accepts an optional `recipientUserId` as the last param
// to enable preference-aware sending. If omitted, email always sends.
// ---------------------------------------------------------------

/** Send a meeting request notification email */
export async function sendMeetingRequestEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    requesterName: string;
    meetingDate: string;
    meetingTime: string;
    meetingType?: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "meeting_request",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/meetings` },
    recipientUserId,
  });
}

/** Send a meeting accepted notification email */
export async function sendMeetingAcceptedEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    partnerName: string;
    meetingDate: string;
    meetingTime: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "meeting_accepted",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/meetings` },
    recipientUserId,
  });
}

/** Send a meeting cancelled notification email */
export async function sendMeetingCancelledEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    meetingDate: string;
    cancelledBy: string;
    refundIssued?: boolean;
    chargeApplied?: boolean;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "meeting_cancelled",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/meetings` },
    recipientUserId,
  });
}

/** Send a cancellation charge notification email */
export async function sendCancellationChargeEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    meetingDate: string;
    meetingRef: string;
    chargeAmount: string;
    reason?: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "cancellation_charge",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/profile/wallet` },
    recipientUserId,
  });
}

/** Send an investigation notice email */
export async function sendInvestigationNoticeEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    meetingDate: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "investigation_notice",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/meetings` },
    recipientUserId,
  });
}

/** Send an investigation resolved email */
export async function sendInvestigationResolvedEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    meetingDate: string;
    meetingRef: string;
    refundIssued?: boolean;
    chargeApplied?: boolean;
    adminNotes?: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "investigation_resolved",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/profile/wallet` },
    recipientUserId,
  });
}

/** Send a "It's a Match!" email */
export async function sendMatchFoundEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    partnerName: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "match_found",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/likes` },
    recipientUserId,
  });
}

/** Send a meeting response submitted email (partner notified) */
export async function sendResponseSubmittedEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    partnerName: string;
    meetingDate: string;
    yourResponsePending: boolean;
    meetingId: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "response_submitted",
    data: {
      ...data,
      responseUrl: `${APP_URL}/dashboard/meetings/${data.meetingId}/response`,
      dashboardUrl: `${APP_URL}/dashboard/meetings`,
    },
    recipientUserId,
  });
}

/** Send a meeting reminder email */
export async function sendMeetingReminderEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    partnerName: string;
    meetingDate: string;
    meetingTime: string;
    timeUntil: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "meeting_reminder",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/meetings` },
    recipientUserId,
  });
}

/** Send a welcome email to new users (always sends — no pref check) */
export async function sendWelcomeEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
  }
) {
  return sendEmail({
    to: recipientEmail,
    template: "welcome",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/profile/edit` },
    // No recipientUserId — welcome emails always send
  });
}

/**
 * Check if email service is configured and available
 */
export function isEmailServiceAvailable(): boolean {
  return isEmailConfigured;
}
