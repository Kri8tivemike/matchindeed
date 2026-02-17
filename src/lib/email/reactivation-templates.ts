/**
 * Reactivation Email Templates
 * Handles all reactivation-related email communications
 */

// Extract the baseLayout function from existing email-templates.ts pattern
const BRAND = {
  name: "MatchIndeed",
  primaryColor: "#1f419a",
  secondaryColor: "#2a44a3",
  gradient: "linear-gradient(135deg, #1f419a 0%, #2a44a3 100%)",
  footerText: "MatchIndeed — Video Dating, Done Right",
  supportEmail: "support@matchindeed.com",
};

function baseEmailLayout(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
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
    .logo { font-size: 24px; font-weight: 800; background: ${BRAND.gradient}; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    h1 { color: #1a1a2e; font-size: 22px; margin: 0 0 8px 0; font-weight: 700; }
    h2 { color: #1a1a2e; font-size: 18px; margin: 16px 0 12px 0; font-weight: 600; }
    p { color: #4a4a6a; font-size: 15px; line-height: 1.6; margin: 12px 0; }
    .highlight { background: #f0f2ff; border-left: 4px solid ${BRAND.primaryColor}; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
    .highlight p { margin: 4px 0; }
    .btn { display: inline-block; padding: 14px 32px; background: ${BRAND.gradient}; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 16px 0; }
    .success { background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
    .danger { background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
    .info { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
    .footer { text-align: center; padding-top: 24px; border-top: 1px solid #eee; margin-top: 24px; font-size: 12px; color: #666; }
    .divider { border-top: 1px solid #eee; margin: 24px 0; }
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
        <p>Questions? Contact us at <a href="mailto:${BRAND.supportEmail}">${BRAND.supportEmail}</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Email sent when user submits a reactivation request
 */
export function reactivationRequestReceivedTemplate(
  userName: string,
  partnerName: string,
  reason: string
): string {
  const body = `
    <h1>Profile Reactivation Request Received</h1>
    <p>Hi ${userName},</p>
    <p>Thank you for your profile reactivation request. We've received your submission and are reviewing it.</p>
    
    <div class="info">
      <h2>Request Details</h2>
      <p><strong>Match Partner:</strong> ${partnerName}</p>
      <p><strong>Your Reason:</strong> ${reason}</p>
    </div>
    
    <p>Here's what happens next:</p>
    <ol>
      <li>We'll notify your previous match partner about your request</li>
      <li>We'll give them 7 days to respond if they wish</li>
      <li>Our team will review and approve/deny your request</li>
      <li>You'll receive an email with the decision</li>
    </ol>
    
    <p>If you have any questions, please don't hesitate to reach out.</p>
    <p>Best regards,<br>The MatchIndeed Team</p>
  `;
  
  return baseEmailLayout("Profile Reactivation Request Received", body);
}

/**
 * Email sent to previous match partner notifying them of reactivation request
 */
export function reactivationPartnerNotificationTemplate(
  partnerName: string,
  userName: string,
  reason: string
): string {
  const body = `
    <h1>Someone Wants to Reactivate Your Match</h1>
    <p>Hi ${partnerName},</p>
    <p>${userName} has requested to reactivate your match and continue exploring a connection with you.</p>
    
    <div class="highlight">
      <p><strong>Their Reason:</strong></p>
      <p>${reason}</p>
    </div>
    
    <p>We wanted to give you the opportunity to respond. You have 7 days to let us know if you'd like to:</p>
    <ul>
      <li><strong>Allow the reactivation</strong> - Continue exploring this connection</li>
      <li><strong>Object to it</strong> - Prefer to move forward with other matches</li>
      <li><strong>Not respond</strong> - We'll proceed with our review</li>
    </ul>
    
    <p style="margin-top: 20px;">Your privacy and preferences are important to us. This is completely optional, and either way, we'll handle it respectfully.</p>
    <p>Best regards,<br>The MatchIndeed Team</p>
  `;
  
  return baseEmailLayout("Reactivation Request Notification", body);
}

/**
 * Email sent when reactivation is approved
 */
export function reactivationApprovedTemplate(
  userName: string,
  partnerName: string,
  adminNotes?: string
): string {
  const body = `
    <h1>Your Profile Reactivation is Approved! 🎉</h1>
    <p>Hi ${userName},</p>
    <p>Good news! Your profile reactivation request has been approved by our team.</p>
    
    <div class="success">
      <h2>What This Means</h2>
      <p>Your profile has been reactivated and you're now able to continue exploring your match with ${partnerName}. You can log back into your account and pick up where you left off.</p>
    </div>
    
    ${adminNotes ? `<div class="info"><p><strong>Notes from our team:</strong> ${adminNotes}</p></div>` : ''}
    
    <p>We're excited to see where this connection goes! If you have any questions or need assistance, feel free to reach out.</p>
    <p>Happy connecting,<br>The MatchIndeed Team</p>
  `;
  
  return baseEmailLayout("Profile Reactivation Approved", body);
}

/**
 * Email sent when reactivation is denied
 */
export function reactivationDeniedTemplate(
  userName: string,
  adminNotes?: string
): string {
  const body = `
    <h1>Profile Reactivation Request - Update</h1>
    <p>Hi ${userName},</p>
    <p>We've completed our review of your profile reactivation request.</p>
    
    <div class="danger">
      <h2>Decision: Not Approved at This Time</h2>
      <p>Unfortunately, we're unable to approve your reactivation request at this time.</p>
    </div>
    
    ${adminNotes ? `<div class="info"><p><strong>Reason:</strong> ${adminNotes}</p></div>` : ''}
    
    <p>This doesn't mean the end of your MatchIndeed journey! You're still welcome to explore new connections and matches on our platform.</p>
    
    <p>If you believe this decision was made in error, or if you'd like to discuss it further, please contact our support team.</p>
    <p>Best regards,<br>The MatchIndeed Team</p>
  `;
  
  return baseEmailLayout("Profile Reactivation Request - Update", body);
}

/**
 * Email sent to partner when reactivation is approved (informing them the match continues)
 */
export function reactivationApprovedPartnerNotificationTemplate(
  partnerName: string,
  userName: string
): string {
  const body = `
    <h1>Your Match Has Been Reactivated</h1>
    <p>Hi ${partnerName},</p>
    <p>${userName} has had their reactivation request approved. Your match is now active again!</p>
    
    <div class="success">
      <p>You can now continue your connection and communication with ${userName} at any time.</p>
    </div>
    
    <p>Looking forward to seeing where this connection leads!</p>
    <p>Best regards,<br>The MatchIndeed Team</p>
  `;
  
  return baseEmailLayout("Match Reactivation Confirmed", body);
}

export default {
  reactivationRequestReceivedTemplate,
  reactivationPartnerNotificationTemplate,
  reactivationApprovedTemplate,
  reactivationDeniedTemplate,
  reactivationApprovedPartnerNotificationTemplate,
};
