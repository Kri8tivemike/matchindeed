/**
 * Email Sending Utility for MatchIndeed
 *
 * Provides a centralized email sending service using Resend.
 * Falls back gracefully when RESEND_API_KEY is not configured (dev mode).
 *
 * Environment variables:
 * - RESEND_API_KEY: API key from resend.com
 * - EMAIL_FROM: Sender email (default: noreply@matchindeed.com)
 * - NEXT_PUBLIC_APP_URL: Used for generating dashboard links in templates
 */
import {
  generateEmail,
  type EmailTemplate,
  type EmailData,
} from "./email-templates";
import { shouldSendEmail } from "./notification-preferences";

// ---------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "MatchIndeed <noreply@matchindeed.com>";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
const RESEND_API_BASE_URL = process.env.RESEND_API_BASE_URL || "https://api.resend.com";

/** Whether email sending is available */
const isEmailConfigured = !!RESEND_API_KEY;

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
  /** True when email was skipped because email provider is not configured */
  skipped?: boolean;
};

// ---------------------------------------------------------------
// CORE SEND FUNCTION
// ---------------------------------------------------------------

/**
 * Send an email using a pre-defined template.
 *
 * In development (without RESEND_API_KEY), logs the email to the console
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
  signup_confirmation: "signup_confirmation",
  password_reset: "password_reset",
  meeting_request: "meeting_request",
  meeting_request_reminder: "meeting_request",
  no_active_video_slot: "no_active_video_slot",
  activity_received: "like",
  new_message: "new_message",
  daily_profile_views: "profile_view",
  daily_new_likes: "like",
  daily_recommendations: "match_found",
  meeting_accepted: "meeting_accepted",
  meeting_approved: "meeting_accepted",
  meeting_cancelled: "meeting_cancelled",
  profile_view: "profile_view",
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
  account_deactivated: "account_warning", // System lifecycle email
  account_deletion_requested: "account_warning", // System lifecycle email
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

    // If Resend is not configured, log to console (dev mode)
    if (!RESEND_API_KEY) {
      console.log(
        `[Email] (Dev Mode — No RESEND_API_KEY) Would send email:`,
        {
          to: options.to,
          subject,
          template: options.template,
          dataKeys: Object.keys(options.data),
        }
      );
      return { success: true, skipped: true };
    }

    // Send via Resend
    const response = await fetch(`${RESEND_API_BASE_URL}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: options.to,
        subject,
        html,
        cc: options.cc,
        reply_to: options.replyTo,
      }),
    });

    const payload = await response.json().catch(() => ({} as Record<string, unknown>));
    const messageId = typeof payload.id === "string" ? payload.id : undefined;
    const errorMessage = typeof payload.message === "string"
      ? payload.message
      : `Resend API error (${response.status})`;

    if (!response.ok) {
      console.error("[Email] Resend error:", errorMessage);
      return { success: false, error: errorMessage };
    }

    console.log(`[Email] Sent "${options.template}" to ${options.to}`, {
      messageId,
    });
    return { success: true, messageId };
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
    meetingTimeZone?: string;
    meetingType?: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "meeting_request",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/meetings?tab=pending` },
    recipientUserId,
  });
}

/** Send a reminder for an unanswered meeting request */
export async function sendMeetingRequestReminderEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    requesterName: string;
    meetingDate: string;
    meetingTime: string;
    meetingTimeZone?: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "meeting_request_reminder",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/meetings?tab=pending` },
    recipientUserId,
  });
}

/** Prompt a user to create an active video-date calendar slot */
export async function sendNoActiveVideoSlotEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    actorName: string;
    triggerLabel: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "no_active_video_slot",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/calendar` },
    recipientUserId,
  });
}

/** Send an instant email when another member likes/winks/shows interest */
export async function sendActivityReceivedEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    actorName: string;
    actionLabel: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "activity_received",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/likes?tab=received` },
    recipientUserId,
  });
}

/** Send an instant email when a match sends a new message */
export async function sendNewMessageEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    senderName: string;
    matchId: string;
    preview?: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "new_message",
    data: {
      ...data,
      dashboardUrl: `${APP_URL}/dashboard/messages/${data.matchId}`,
    },
    recipientUserId,
  });
}

/** Send the daily profile-view digest email */
export async function sendDailyProfileViewsEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    count: number;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "daily_profile_views",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/likes?tab=views` },
    recipientUserId,
  });
}

/** Send the daily new-likes digest email */
export async function sendDailyNewLikesEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    count: number;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "daily_new_likes",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/likes?tab=received` },
    recipientUserId,
  });
}

/** Send the daily recommended matches digest email */
export async function sendDailyRecommendationsEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    count: number;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "daily_recommendations",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/discover` },
    recipientUserId,
  });
}

export async function sendSignupConfirmationEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    confirmationUrl: string;
  }
) {
  return sendEmail({
    to: recipientEmail,
    template: "signup_confirmation",
    data,
  });
}

export async function sendPasswordResetEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    resetUrl: string;
  }
) {
  return sendEmail({
    to: recipientEmail,
    template: "password_reset",
    data,
  });
}

export async function sendAccountDeactivatedEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    reactivateUrl?: string;
  }
) {
  return sendEmail({
    to: recipientEmail,
    template: "account_deactivated",
    data: {
      ...data,
      dashboardUrl: `${APP_URL}/dashboard/profile/my-account`,
      reactivateUrl:
        data.reactivateUrl || `${APP_URL}/dashboard/profile/my-account`,
    },
  });
}

export async function sendAccountDeletionRequestedEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    requestedAt?: string;
  }
) {
  return sendEmail({
    to: recipientEmail,
    template: "account_deletion_requested",
    data: {
      ...data,
      dashboardUrl: `${APP_URL}/contact-us`,
    },
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
    meetingTimeZone?: string;
    awaitingAdminApproval?: boolean;
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

/** Send an admin-approved meeting notification email */
export async function sendMeetingApprovedEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    partnerName: string;
    meetingDate: string;
    meetingTime: string;
    meetingTimeZone?: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "meeting_approved",
    data: { ...data, dashboardUrl: `${APP_URL}/dashboard/meetings` },
    recipientUserId,
  });
}

/** Send a profile view notification email */
export async function sendProfileViewEmail(
  recipientEmail: string,
  data: {
    recipientName: string;
    partnerName: string;
  },
  recipientUserId?: string
) {
  return sendEmail({
    to: recipientEmail,
    template: "profile_view",
    data: {
      ...data,
      dashboardUrl: `${APP_URL}/dashboard/likes?tab=views`,
    },
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
    freePlanRestored?: boolean;
    chargeApplied?: boolean;
    cancellationReason?: string;
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
    creditAmount: string;
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
    meetingTimeZone?: string;
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

/**
 * Send an email with raw HTML content.
 * Use for templates that generate HTML directly (e.g. reactivation emails).
 */
export async function sendRawHtmlEmail(
  to: string,
  subject: string,
  html: string
): Promise<SendEmailResult> {
  try {
    if (!RESEND_API_KEY) {
      console.log(`[Email] (Dev Mode) Would send raw HTML to ${to}:`, subject);
      return { success: true, skipped: true };
    }

    const response = await fetch(`${RESEND_API_BASE_URL}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to,
        subject,
        html,
      }),
    });

    const payload = await response.json().catch(() => ({} as Record<string, unknown>));
    const messageId = typeof payload.id === "string" ? payload.id : undefined;
    const errorMessage = typeof payload.message === "string"
      ? payload.message
      : `Resend API error (${response.status})`;

    if (!response.ok) {
      return { success: false, error: errorMessage };
    }

    return { success: true, messageId };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected email error";
    return { success: false, error: message };
  }
}
