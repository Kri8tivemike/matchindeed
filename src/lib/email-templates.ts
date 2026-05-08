/**
 * Email Templates for MatchIndeed
 *
 * Provides styled HTML email templates for various platform notifications.
 * All templates follow a consistent brand style and are mobile-responsive.
 */

// ---------------------------------------------------------------
// BRAND CONSTANTS
// ---------------------------------------------------------------

const BRAND = {
  name: "MatchIndeed",
  primaryColor: "#1f419a",
  secondaryColor: "#2a44a3",
  gradient: "linear-gradient(135deg, #1f419a 0%, #2a44a3 100%)",
  footerText: "MatchIndeed — Video Dating, Done Right",
  supportEmail: "support@matchindeed.com",
  lightLogoUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://matchindeed.com"}/matchindeed-logo-white.png`,
  darkLogoUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://matchindeed.com"}/matchindeed-logo-black-font.png`,
};

// ---------------------------------------------------------------
// BASE LAYOUT
// ---------------------------------------------------------------

/**
 * Base email layout wrapper with branding and styling
 */
function baseLayout(title: string, bodyContent: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f7; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { text-align: center; padding: 24px; border-bottom: 1px solid #e5e7eb; margin-bottom: 24px; background: linear-gradient(135deg, #1e2a78 0%, #2a44a3 100%); border-radius: 14px; }
    .logo-mark { display: inline-block; }
    .logo-mark img { display: block; width: 170px; max-width: 100%; height: auto; margin: 0 auto; }
    .logo-mark .logo-dark { display: none; }
    h1 { color: #1a1a2e; font-size: 22px; margin: 0 0 8px; }
    p { color: #4a4a6a; font-size: 15px; line-height: 1.6; margin: 8px 0; }
    .highlight { background: #f0f2ff; border-left: 4px solid ${BRAND.primaryColor}; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
    .highlight p { margin: 4px 0; }
    .btn, .btn:link, .btn:visited { display: inline-block; padding: 14px 32px; background: ${BRAND.gradient}; color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 16px 0; }
    .btn span { color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; }
    .warning { background: #fff8e6; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
    .success { background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
    .danger { background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
    .footer { text-align: center; padding-top: 24px; border-top: 1px solid #eee; margin-top: 24px; }
    .footer p { color: #9ca3af; font-size: 13px; }
    .footer a { color: ${BRAND.primaryColor}; text-decoration: none; }
    .meta { color: #9ca3af; font-size: 13px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .badge-blue { background: #e0e7ff; color: #4338ca; }
    .badge-green { background: #d1fae5; color: #065f46; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    @media (prefers-color-scheme: dark) {
      body { background-color: #111827 !important; }
      .card { background: #1f2937 !important; box-shadow: none !important; }
      .header { background: #ffffff !important; border-bottom-color: #374151 !important; }
      .logo-mark .logo-light { display: none !important; }
      .logo-mark .logo-dark { display: block !important; }
      h1 { color: #f9fafb !important; }
      p { color: #d1d5db !important; }
      .highlight { background: #273449 !important; }
      .warning { background: #3a2c16 !important; }
      .success { background: #163227 !important; }
      .danger { background: #3b1f25 !important; }
      .btn, .btn:link, .btn:visited, .btn span { color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; }
      .footer { border-top-color: #374151 !important; }
      .footer p { color: #9ca3af !important; }
      .meta { color: #9ca3af !important; }
    }
    [data-ogsc] body { background-color: #111827 !important; }
    [data-ogsc] .card { background: #1f2937 !important; box-shadow: none !important; }
    [data-ogsc] .header { background: #ffffff !important; border-bottom-color: #374151 !important; }
    [data-ogsc] .logo-mark .logo-light { display: none !important; }
    [data-ogsc] .logo-mark .logo-dark { display: block !important; }
    [data-ogsc] .btn, [data-ogsc] .btn:link, [data-ogsc] .btn:visited, [data-ogsc] .btn span { color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo-mark">
          <img class="logo-light" src="${BRAND.lightLogoUrl}" alt="${BRAND.name}" width="170" height="68" />
          <img class="logo-dark" src="${BRAND.darkLogoUrl}" alt="${BRAND.name}" width="170" height="68" />
        </div>
      </div>
      ${bodyContent}
      <div class="footer">
        <p>${BRAND.footerText}</p>
        <p>Questions? <a href="mailto:${BRAND.supportEmail}">${BRAND.supportEmail}</a></p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();
}

// ---------------------------------------------------------------
// TEMPLATE TYPES
// ---------------------------------------------------------------

export type EmailTemplate =
  | "signup_confirmation"
  | "password_reset"
  | "meeting_request"
  | "meeting_accepted"
  | "meeting_approved"
  | "meeting_cancelled"
  | "profile_view"
  | "meeting_reminder"
  | "meeting_completed"
  | "cancellation_charge"
  | "investigation_notice"
  | "investigation_resolved"
  | "match_found"
  | "response_submitted"
  | "credit_refund"
  | "welcome"
  | "account_warning"
  | "account_deactivated"
  | "account_deletion_requested";

export type EmailData = {
  recipientName: string;
  [key: string]: string | number | boolean | null | undefined;
};

// ---------------------------------------------------------------
// TEMPLATE GENERATORS
// ---------------------------------------------------------------

/**
 * Generate an email template based on type and data
 */
export function generateEmail(
  template: EmailTemplate,
  data: EmailData
): { subject: string; html: string } {
  switch (template) {
    case "signup_confirmation":
      return signupConfirmationEmail(data);
    case "password_reset":
      return passwordResetEmail(data);
    case "meeting_request":
      return meetingRequestEmail(data);
    case "meeting_accepted":
      return meetingAcceptedEmail(data);
    case "meeting_approved":
      return meetingApprovedEmail(data);
    case "meeting_cancelled":
      return meetingCancelledEmail(data);
    case "profile_view":
      return profileViewEmail(data);
    case "meeting_reminder":
      return meetingReminderEmail(data);
    case "meeting_completed":
      return meetingCompletedEmail(data);
    case "cancellation_charge":
      return cancellationChargeEmail(data);
    case "investigation_notice":
      return investigationNoticeEmail(data);
    case "investigation_resolved":
      return investigationResolvedEmail(data);
    case "match_found":
      return matchFoundEmail(data);
    case "response_submitted":
      return responseSubmittedEmail(data);
    case "credit_refund":
      return creditRefundEmail(data);
    case "welcome":
      return welcomeEmail(data);
    case "account_warning":
      return accountWarningEmail(data);
    case "account_deactivated":
      return accountDeactivatedEmail(data);
    case "account_deletion_requested":
      return accountDeletionRequestedEmail(data);
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

// ---------------------------------------------------------------
// INDIVIDUAL TEMPLATES
// ---------------------------------------------------------------

function signupConfirmationEmail(data: EmailData) {
  const subject = "Confirm your MatchIndeed account";
  const html = baseLayout(
    subject,
    `
    <h1 style="text-align:center;">Confirm your account</h1>
    <p>Hi ${data.recipientName || "there"},</p>
    <p>Thank you for joining MatchIndeed — where intentional dating begins.</p>
    <p>To complete your sign-up and activate your account, please confirm your email address by clicking the button below:</p>
    <div style="text-align:center;">
      <a href="${data.confirmationUrl || "#"}" class="btn">Confirm My Account</a>
    </div>
    <p class="meta" style="text-align:center;">If the button doesn&apos;t work, use this link:</p>
    <p style="word-break:break-word; text-align:center;">
      <a href="${data.confirmationUrl || "#"}" style="color:${BRAND.primaryColor}; text-decoration:underline;">${data.confirmationUrl || "Confirmation Link"}</a>
    </p>
    <div class="highlight">
      <p><strong>Once confirmed, you&apos;ll be able to:</strong></p>
      <p>Set up your profile</p>
      <p>View who&apos;s interested in you</p>
      <p>Book video-date meetings</p>
      <p>Start connecting with real, intentional daters</p>
    </div>
    <p class="meta" style="text-align:center;">If you didn&apos;t create a MatchIndeed account, you can safely ignore this email.</p>
    `
  );
  return { subject, html };
}

function passwordResetEmail(data: EmailData) {
  const subject = "Reset your MatchIndeed password";
  const html = baseLayout(
    subject,
    `
    <h1 style="text-align:center;">Reset your password</h1>
    <p>Hi ${data.recipientName || "there"},</p>
    <p>We received a request to reset your MatchIndeed password.</p>
    <div class="highlight">
      <p><strong>Use the secure button below to choose a new password.</strong></p>
      <p>This reset link expires in 1 hour for your safety.</p>
    </div>
    <div style="text-align:center;">
      <a href="${data.resetUrl || "#"}" class="btn">Reset Password</a>
    </div>
    <p class="meta" style="text-align:center;">If the button doesn&apos;t work, use this secure link:</p>
    <p style="word-break:break-word; text-align:center;">
      <a href="${data.resetUrl || "#"}" style="color:${BRAND.primaryColor}; text-decoration:underline;">${data.resetUrl || "Password Reset Link"}</a>
    </p>
    <div class="warning">
      <p><strong>Didn&apos;t request this?</strong></p>
      <p>You can safely ignore this email if you did not ask to reset your password.</p>
    </div>
    `
  );
  return { subject, html };
}

function meetingRequestEmail(data: EmailData) {
  const subject = `New Video Dating Meeting Request from ${data.requesterName}`;
  const html = baseLayout(
    subject,
    `
    <h1>New Meeting Request!</h1>
    <p>Hi ${data.recipientName},</p>
    <p><strong>${data.requesterName}</strong> has requested a video dating meeting with you.</p>
    <div class="highlight">
      <p><strong>Date:</strong> ${data.meetingDate}</p>
      <p><strong>Time:</strong> ${data.meetingTime}</p>
      ${
        data.meetingTimeZone
          ? `<p><strong>Time zone:</strong> ${data.meetingTimeZone}</p>`
          : ""
      }
      <p><strong>Type:</strong> ${data.meetingType || "Video Call"}</p>
    </div>
    <p>Please log in to your dashboard to accept or decline this request.</p>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">View Request</a>
    </div>
    <div class="warning">
      <p><strong>Reminder:</strong> Once you accept, cancellation fees may apply per our cancellation policy.</p>
    </div>
    `
  );
  return { subject, html };
}

function accountDeactivatedEmail(data: EmailData) {
  const subject = "Your MatchIndeed Account Is Currently Deactivated";
  const html = baseLayout(
    subject,
    `
    <h1>Your MatchIndeed Account Is Currently Deactivated</h1>
    <p>Hi ${data.recipientName || "there"},</p>
    <p>Your profile is hidden and you cannot book dates, send messages, or interact with other members.</p>
    <p>You can reactivate your account at any time to continue connecting.</p>
    <div style="text-align:center;">
      <a href="${data.reactivateUrl || data.dashboardUrl || "#"}" class="btn">Reactivate My Account</a>
    </div>
    <p class="meta" style="text-align:center;">If you did not request this change, please contact MatchIndeed support.</p>
    `
  );
  return { subject, html };
}

function accountDeletionRequestedEmail(data: EmailData) {
  const subject = "We received your MatchIndeed account deletion request";
  const html = baseLayout(
    subject,
    `
    <h1>Account deletion request received</h1>
    <p>Hi ${data.recipientName || "there"},</p>
    <p>We’ve received your request to delete your MatchIndeed account.</p>
    <div class="warning">
      <p>Your profile is now hidden while our support team reviews your request.</p>
      ${
        data.requestedAt
          ? `<p><strong>Requested:</strong> ${data.requestedAt}</p>`
          : ""
      }
    </div>
    <p>We’ll contact you if we need any additional information before completing the request.</p>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">Contact Support</a>
    </div>
    <p class="meta" style="text-align:center;">If you did not submit this request, please contact MatchIndeed support immediately.</p>
    `
  );
  return { subject, html };
}

function meetingAcceptedEmail(data: EmailData) {
  const awaitingAdminApproval = Boolean(data.awaitingAdminApproval);
  const subject = awaitingAdminApproval
    ? `Meeting accepted — awaiting admin approval`
    : `Meeting Accepted! Your video date is confirmed`;
  const html = baseLayout(
    subject,
    `
    <h1>${awaitingAdminApproval ? "Meeting Accepted!" : "Meeting Confirmed!"}</h1>
    <p>Hi ${data.recipientName},</p>
    <p>${
      awaitingAdminApproval
        ? `<strong>${data.partnerName}</strong> has accepted this meeting request.`
        : `Great news! <strong>${data.partnerName}</strong> has accepted your meeting request.`
    }</p>
    <div class="${awaitingAdminApproval ? "highlight" : "success"}">
      <p><strong>Date:</strong> ${data.meetingDate}</p>
      <p><strong>Time:</strong> ${data.meetingTime}</p>
      ${
        data.meetingTimeZone
          ? `<p><strong>Time zone:</strong> ${data.meetingTimeZone}</p>`
          : ""
      }
      <p><strong>Status:</strong> <span class="badge ${awaitingAdminApproval ? "badge-amber" : "badge-green"}">${awaitingAdminApproval ? "Awaiting Admin Approval" : "Confirmed"}</span></p>
    </div>
    <p>${
      awaitingAdminApproval
        ? "Both participants have accepted. MatchIndeed admin will review the request and confirm the booking before the meeting link appears in your dashboard."
        : "Make sure to be on time. The meeting link will be available in your dashboard."
    }</p>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">Go to Dashboard</a>
    </div>
    ${
      awaitingAdminApproval
        ? ""
        : `<div class="warning">
      <p><strong>Important:</strong> Cancellation after confirmation will result in charges. Please ensure your availability.</p>
    </div>`
    }
    `
  );
  return { subject, html };
}

function meetingApprovedEmail(data: EmailData) {
  const subject = "Your video date has been approved by MatchIndeed";
  const html = baseLayout(
    subject,
    `
    <h1>Meeting Approved</h1>
    <p>Hi ${data.recipientName},</p>
    <p>Good news! MatchIndeed admin has approved your video meeting with <strong>${data.partnerName}</strong>.</p>
    <div class="success">
      <p><strong>Date:</strong> ${data.meetingDate}</p>
      <p><strong>Time:</strong> ${data.meetingTime}</p>
      ${
        data.meetingTimeZone
          ? `<p><strong>Time zone:</strong> ${data.meetingTimeZone}</p>`
          : ""
      }
      <p><strong>Status:</strong> <span class="badge badge-green">Approved by Admin</span></p>
    </div>
    <p>Your meeting link is now ready in your appointments. Please join on time and make sure you have a stable internet connection before the meeting starts.</p>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">View Meeting</a>
    </div>
    <div class="warning">
      <p><strong>Important:</strong> Cancellation after admin approval may result in charges. Please only cancel if absolutely necessary.</p>
    </div>
    `
  );
  return { subject, html };
}

function meetingCancelledEmail(data: EmailData) {
  const subject = `Video Dating Meeting Cancelled`;
  const html = baseLayout(
    subject,
    `
    <h1>Meeting Cancelled</h1>
    <p>Hi ${data.recipientName},</p>
    <p>Your video-dating meeting set for <strong>${data.meetingDate}</strong> was cancelled by <strong>${data.cancelledBy}</strong>.</p>
    ${
      data.cancellationReason
        ? `<div class="highlight"><p><strong>Reason for cancellation:</strong></p><p>${data.cancellationReason}</p></div>`
        : ""
    }
    ${
      data.freePlanRestored
        ? `<div class="success"><p>Your Free Plan credit has been restored and is ready to use anytime.</p></div>`
        : data.refundIssued
        ? `<div class="success"><p>Your credits have been refunded to your account.</p></div>`
        : data.chargeApplied
          ? `<div class="danger"><p>A cancellation fee has been applied as per our cancellation policy.</p></div>`
          : ""
    }
    <p>MatchIndeed Support</p>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">Back to Dashboard</a>
    </div>
    `
  );
  return { subject, html };
}

function profileViewEmail(data: EmailData) {
  const subject = `${data.partnerName} viewed your profile`;
  const html = baseLayout(
    subject,
    `
    <h1>Someone Viewed Your Profile</h1>
    <p>Hi ${data.recipientName},</p>
    <p><strong>${data.partnerName}</strong> viewed your profile on MatchIndeed.</p>
    <div class="highlight">
      <p>This is a great time to review their profile, like them back, or request a video date if you're interested.</p>
    </div>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn" style="display:inline-block;padding:14px 32px;background:${BRAND.gradient};color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin:16px 0;">
        <span style="color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;">See all views</span>
      </a>
    </div>
    `
  );
  return { subject, html };
}

function meetingReminderEmail(data: EmailData) {
  const subject = `Reminder: Your video date is ${data.timeUntil}`;
  const html = baseLayout(
    subject,
    `
    <h1>Meeting Reminder</h1>
    <p>Hi ${data.recipientName},</p>
    <p>Your video dating meeting is coming up ${data.timeUntil}!</p>
    <div class="highlight">
      <p><strong>Date:</strong> ${data.meetingDate}</p>
      <p><strong>Time:</strong> ${data.meetingTime}</p>
      ${
        data.meetingTimeZone
          ? `<p><strong>Time zone:</strong> ${data.meetingTimeZone}</p>`
          : ""
      }
      <p><strong>With:</strong> ${data.partnerName}</p>
    </div>
    <p>Make sure you&apos;re ready and your camera/microphone are working.</p>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">Join Meeting</a>
    </div>
    `
  );
  return { subject, html };
}

function meetingCompletedEmail(data: EmailData) {
  const subject = `Your video date has ended — submit your response`;
  const html = baseLayout(
    subject,
    `
    <h1>Meeting Complete!</h1>
    <p>Hi ${data.recipientName},</p>
    <p>Your video dating meeting with <strong>${data.partnerName}</strong> on <strong>${data.meetingDate}</strong> has ended.</p>
    <div class="highlight">
      <p>Please submit your response (Yes/No) to indicate whether you&apos;d like to connect further with ${data.partnerName}.</p>
    </div>
    <div style="text-align:center;">
      <a href="${data.responseUrl || "#"}" class="btn">Submit Response</a>
    </div>
    <p class="meta">If both of you say Yes, you&apos;ll be matched and can start messaging!</p>
    `
  );
  return { subject, html };
}

function cancellationChargeEmail(data: EmailData) {
  const subject = `Cancellation Credits Applied — Meeting #${data.meetingRef}`;
  const html = baseLayout(
    subject,
    `
    <h1>Cancellation Credits</h1>
    <p>Hi ${data.recipientName},</p>
    <p>Cancellation credits have been deducted from your account for the video dating meeting scheduled on <strong>${data.meetingDate}</strong>.</p>
    <div class="danger">
      <p><strong>Credits deducted:</strong> ${data.creditAmount}</p>
      <p><strong>Reason:</strong> ${data.reason || "Meeting cancelled after confirmation"}</p>
    </div>
    <p>Per our cancellation policy, cancellation credits apply when meetings are cancelled after they have been accepted and confirmed.</p>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">View Details</a>
    </div>
    <p class="meta">If you believe this credit deduction is incorrect, please contact support.</p>
    `
  );
  return { subject, html };
}

function investigationNoticeEmail(data: EmailData) {
  const subject = `Investigation Notice — Meeting Review in Progress`;
  const html = baseLayout(
    subject,
    `
    <h1>Investigation Notice</h1>
    <p>Dear ${data.recipientName},</p>
    <p>Your video dating meeting held on <strong>${data.meetingDate}</strong> will be reviewed to determine if there were any irregularities or inconsistencies which affect the charges.</p>
    <div class="warning">
      <p><strong>Status:</strong> <span class="badge badge-amber">Under Review</span></p>
      <p><strong>Expected Resolution:</strong> 1–2 business days</p>
    </div>
    <p>Our team will review the evidence and meeting details. You will be notified once the investigation is complete.</p>
    <p>No action is required from you at this time. Charges remain pending until the investigation concludes.</p>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">View Meeting Details</a>
    </div>
    `
  );
  return { subject, html };
}

function investigationResolvedEmail(data: EmailData) {
  const subject = `Investigation Complete — Meeting #${data.meetingRef}`;
  const html = baseLayout(
    subject,
    `
    <h1>Investigation Complete</h1>
    <p>Dear ${data.recipientName},</p>
    <p>After reviewing your video dating meeting held on <strong>${data.meetingDate}</strong>, the investigation has concluded.</p>
    ${
      data.refundIssued
        ? `<div class="success">
            <p><strong>Resolution:</strong> Refund Issued</p>
            <p>Your credits have been returned to your account.</p>
          </div>`
        : data.chargeApplied
          ? `<div class="danger">
              <p><strong>Resolution:</strong> Charges Applied</p>
              <p>Based on our investigation findings, charges have been applied to your account.</p>
            </div>`
          : `<div class="highlight">
              <p><strong>Resolution:</strong> No Action Required</p>
              <p>No charges have been applied based on the investigation outcome.</p>
            </div>`
    }
    ${data.adminNotes ? `<p class="meta">Notes: ${data.adminNotes}</p>` : ""}
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">View Account</a>
    </div>
    <p class="meta">If you have questions, please contact our support team.</p>
    `
  );
  return { subject, html };
}

function matchFoundEmail(data: EmailData) {
  const subject = `It's a Match! You and ${data.partnerName} said Yes!`;
  const html = baseLayout(
    subject,
    `
    <h1 style="text-align:center;">It&apos;s a Match! 🎉</h1>
    <p style="text-align:center;">Hi ${data.recipientName},</p>
    <p style="text-align:center; font-size: 17px;">Both you and <strong>${data.partnerName}</strong> said <strong>Yes</strong>!</p>
    <div class="success" style="text-align:center;">
      <p style="font-size: 16px; margin: 0;">You can now connect and start messaging.</p>
    </div>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">Start Chatting</a>
    </div>
    <p style="text-align:center;" class="meta">Good luck on your journey together!</p>
    `
  );
  return { subject, html };
}

function responseSubmittedEmail(data: EmailData) {
  const subject = `Your partner submitted their meeting response`;
  const html = baseLayout(
    subject,
    `
    <h1>Response Submitted</h1>
    <p>Hi ${data.recipientName},</p>
    <p><strong>${data.partnerName}</strong> has submitted their response for your video dating meeting on <strong>${data.meetingDate}</strong>.</p>
    ${
      data.yourResponsePending
        ? `<div class="highlight">
            <p>You haven&apos;t submitted your response yet. Please do so to see if it&apos;s a match!</p>
          </div>
          <div style="text-align:center;">
            <a href="${data.responseUrl || "#"}" class="btn">Submit Your Response</a>
          </div>`
        : `<div class="highlight">
            <p>Both responses are in. Check your dashboard for the result!</p>
          </div>
          <div style="text-align:center;">
            <a href="${data.dashboardUrl || "#"}" class="btn">View Result</a>
          </div>`
    }
    `
  );
  return { subject, html };
}

function creditRefundEmail(data: EmailData) {
  const subject = `Credit Refund — ${data.creditAmount} credits returned`;
  const html = baseLayout(
    subject,
    `
    <h1>Credits Refunded</h1>
    <p>Hi ${data.recipientName},</p>
    <p>We&apos;ve refunded <strong>${data.creditAmount} credits</strong> to your account.</p>
    <div class="success">
      <p><strong>Reason:</strong> ${data.reason}</p>
      ${data.walletAmount ? `<p><strong>Wallet Refund:</strong> ${data.walletAmount}</p>` : ""}
    </div>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">View Balance</a>
    </div>
    `
  );
  return { subject, html };
}

function welcomeEmail(data: EmailData) {
  const subject = `Welcome to MatchIndeed! Let's find your match`;
  const html = baseLayout(
    subject,
    `
    <h1 style="text-align:center;">Welcome to ${BRAND.name}!</h1>
    <p>Hi ${data.recipientName},</p>
    <p>We&apos;re thrilled to have you join MatchIndeed — the video dating platform where genuine connections happen face-to-face.</p>
    <div class="highlight">
      <p><strong>Next Steps:</strong></p>
      <p>1. Complete your profile with photos and a bio</p>
      <p>2. Set your preferences to find compatible matches</p>
      <p>3. Set your availability for video meetings</p>
      <p>4. Start discovering and connecting!</p>
    </div>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">Complete Your Profile</a>
    </div>
    `
  );
  return { subject, html };
}

function accountWarningEmail(data: EmailData) {
  const subject = `Account Notice — Action Required`;
  const html = baseLayout(
    subject,
    `
    <h1>Account Notice</h1>
    <p>Dear ${data.recipientName},</p>
    <div class="danger">
      <p><strong>Warning:</strong> ${data.warningMessage}</p>
    </div>
    <p>${data.details || "Please review your account activity and ensure compliance with our community guidelines."}</p>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">Review Account</a>
    </div>
    <p class="meta">If you believe this is an error, please contact support immediately.</p>
    `
  );
  return { subject, html };
}
