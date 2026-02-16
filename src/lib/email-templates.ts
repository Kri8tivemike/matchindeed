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
    .header { text-align: center; padding-bottom: 24px; border-bottom: 1px solid #eee; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 800; background: ${BRAND.gradient}; -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    h1 { color: #1a1a2e; font-size: 22px; margin: 0 0 8px; }
    p { color: #4a4a6a; font-size: 15px; line-height: 1.6; margin: 8px 0; }
    .highlight { background: #f0f2ff; border-left: 4px solid ${BRAND.primaryColor}; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
    .highlight p { margin: 4px 0; }
    .btn { display: inline-block; padding: 14px 32px; background: ${BRAND.gradient}; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 16px 0; }
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
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">${BRAND.name}</div>
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
  | "meeting_request"
  | "meeting_accepted"
  | "meeting_cancelled"
  | "meeting_reminder"
  | "meeting_completed"
  | "cancellation_charge"
  | "investigation_notice"
  | "investigation_resolved"
  | "match_found"
  | "response_submitted"
  | "credit_refund"
  | "welcome"
  | "account_warning";

export type EmailData = {
  recipientName: string;
  [key: string]: any;
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
    case "meeting_request":
      return meetingRequestEmail(data);
    case "meeting_accepted":
      return meetingAcceptedEmail(data);
    case "meeting_cancelled":
      return meetingCancelledEmail(data);
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
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

// ---------------------------------------------------------------
// INDIVIDUAL TEMPLATES
// ---------------------------------------------------------------

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

function meetingAcceptedEmail(data: EmailData) {
  const subject = `Meeting Accepted! Your video date is confirmed`;
  const html = baseLayout(
    subject,
    `
    <h1>Meeting Confirmed!</h1>
    <p>Hi ${data.recipientName},</p>
    <p>Great news! <strong>${data.partnerName}</strong> has accepted your meeting request.</p>
    <div class="success">
      <p><strong>Date:</strong> ${data.meetingDate}</p>
      <p><strong>Time:</strong> ${data.meetingTime}</p>
      <p><strong>Status:</strong> <span class="badge badge-green">Confirmed</span></p>
    </div>
    <p>Make sure to be on time. The meeting link will be available in your dashboard.</p>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">Go to Dashboard</a>
    </div>
    <div class="warning">
      <p><strong>Important:</strong> Cancellation after confirmation will result in charges. Please ensure your availability.</p>
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
    <p>The video dating meeting scheduled for <strong>${data.meetingDate}</strong> has been cancelled by <strong>${data.cancelledBy}</strong>.</p>
    ${
      data.refundIssued
        ? `<div class="success"><p>Your credits have been refunded to your account.</p></div>`
        : data.chargeApplied
          ? `<div class="danger"><p>A cancellation fee has been applied as per our cancellation policy.</p></div>`
          : ""
    }
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">Back to Dashboard</a>
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
  const subject = `Cancellation Charge Applied — Meeting #${data.meetingRef}`;
  const html = baseLayout(
    subject,
    `
    <h1>Cancellation Charge</h1>
    <p>Hi ${data.recipientName},</p>
    <p>A cancellation charge has been applied to your account for the video dating meeting scheduled on <strong>${data.meetingDate}</strong>.</p>
    <div class="danger">
      <p><strong>Charge:</strong> ${data.chargeAmount}</p>
      <p><strong>Reason:</strong> ${data.reason || "Meeting cancelled after confirmation"}</p>
    </div>
    <p>Per our cancellation policy, charges apply when meetings are cancelled after they have been accepted and confirmed.</p>
    <div style="text-align:center;">
      <a href="${data.dashboardUrl || "#"}" class="btn">View Details</a>
    </div>
    <p class="meta">If you believe this charge is incorrect, please contact support.</p>
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
