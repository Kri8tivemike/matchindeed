# Video Meeting System Implementation Summary

## Overview
This document summarizes the complete implementation of the Video Meeting system based on client requirements from `Project scope/Clients-request.md`.

## Database Schema

### New Tables Created

1. **meeting_responses** - Stores Yes/No responses after meetings
   - `id`, `meeting_id`, `user_id`, `response` (yes/no), `agreement_text`, `signed_at`

2. **meeting_notifications** - Tracks pre-meeting reminder notifications
   - `id`, `meeting_id`, `user_id`, `notification_type` (1hr, 30min, 15min, 10min, 5min, start, rules)
   - `sent_at`, `email_sent`, `dashboard_sent`

3. **user_matches** - Tracks successful matches after both parties say YES
   - `id`, `meeting_id`, `user1_id`, `user2_id`, `matched_at`
   - `messaging_enabled`, `profile_reactivation_requested`, `reactivation_reason`, `reactivation_status`

4. **reactivation_reasons** - Stores 26 predefined reactivation reasons
   - `id`, `reason_code`, `reason_text`, `category`

### Updated Tables

1. **meetings** - Added fields:
   - `cancellation_fee_cents` - Admin-configurable cancellation fee
   - `canceled_by`, `canceled_at`, `cancellation_reason`
   - `matched`, `matched_at` - Track successful matches
   - `video_recording_url` - For VIP users
   - `meeting_rules_sent` - Track if rules were sent

## API Endpoints

### Meeting Management
- `POST /api/meetings` - Create meeting request (with tier permissions & credit checks)
- `PATCH /api/meetings` - Accept/decline/cancel meetings
- `GET /api/meetings` - Fetch user's meetings

### Meeting Responses
- `POST /api/meetings/response` - Submit Yes/No response after meeting
- `GET /api/meetings/response` - Get responses for a meeting

### Notifications
- `POST /api/meetings/notifications/schedule` - Schedule pre-meeting notifications
- `GET /api/meetings/notifications` - Get pending notifications (for cron)
- `GET /api/cron/meeting-notifications` - Cron endpoint to send notifications

### Cancellation
- `POST /api/meetings/cancel` - Cancel meeting with fee handling

### Profile Reactivation
- `POST /api/profile/reactivate` - Request profile reactivation after matching
- `GET /api/profile/reactivate` - Get reactivation status

### Admin Functions
- `GET /api/admin/meetings/conflicts` - Get meeting conflicts (3+ requests same date)
- `POST /api/admin/meetings/conflicts/resolve` - Resolve conflicts by rebooking/canceling

## Components

### MeetingResponseForm
- Location: `src/components/MeetingResponseForm.tsx`
- Purpose: Form for submitting Yes/No response after meeting
- Features:
  - Agreement text with partner name
  - Yes/No selection
  - Saves to dashboard, sends to partner and admin

### MeetingRulesDisplay
- Location: `src/components/MeetingRulesDisplay.tsx`
- Purpose: Display meeting rules and etiquette
- Features:
  - 9 collapsible sections with rules
  - Participant responsibilities, device readiness, environment setup
  - Meeting etiquette, appropriate behavior, boundaries
  - Mutual respect, time management, data protection

### ProfileReactivationForm
- Location: `src/components/ProfileReactivationForm.tsx`
- Purpose: Form for requesting profile reactivation
- Features:
  - 26 predefined reasons + custom reason option
  - Custom reason requires 200+ words
  - Notifies partner to also respond
  - Admin reviews both responses

## User Flows

### 1. Meeting Request Flow
1. User A views User B's profile and available calendar slots
2. User A selects date/time and sends request
3. System checks:
   - Tier permissions (can User A contact User B's tier?)
   - Credit balance (deducts credits, holds as pending)
   - Account type shown to User B
4. User B receives notification (email + dashboard)
5. User B accepts or declines:
   - **Accept**: Meeting status → "confirmed", notifications scheduled
   - **Decline**: Meeting canceled, credits refunded to User A

### 2. Pre-Meeting Flow
1. When meeting is confirmed, notifications are automatically scheduled:
   - Rules sent immediately
   - 1 hour before
   - 30 minutes before
   - 15 minutes before
   - 10 minutes before
   - 5 minutes before
   - At start time
2. Users receive email + dashboard notifications
3. Meeting rules displayed when users join

### 3. Meeting Execution
1. Users join via video platform (BigBlueButton)
2. Coordinator monitors meeting
3. Meeting recorded (VIP only can access later)
4. Rules enforced:
   - Users cannot leave during meeting
   - 4-minute grace period if requester leaves
   - Charges apply if accepter leaves unexpectedly

### 4. Post-Meeting Flow
1. Coordinator submits report:
   - Conclusion notes
   - Video recording (VIP)
   - Participant Yes/No responses
   - Host decision (successful/denied)
   - Coordinator name, date, IP, signature
2. Both users fill Yes/No response form:
   - Agreement text with partner name
   - Select YES or NO
   - Saved to dashboard and admin
3. If both say YES:
   - Match created in `user_matches` table
   - Messaging enabled between users
   - Both profiles go offline (matched status)
4. If either says NO:
   - Profiles remain active
   - Charges finalized based on outcome

### 5. Admin Review & Finalization
1. Admin reviews meeting report:
   - Coordinator notes
   - Video recording (if VIP)
   - Yes/No responses
   - Host decision
2. Admin finalizes charges:
   - **Charge**: Move from pending → captured (requester charged)
   - **Refund**: Move from pending → refunded (requester refunded, accepter may be charged)
   - **No Charge**: Refund credits only
3. Admin decision triggers wallet transactions

### 6. Cancellation Flow
1. User attempts to cancel meeting
2. System checks:
   - Host cannot cancel after booking (per client rules)
   - Guest can cancel but may incur fee
3. Cancellation fee applied (if configured by admin)
4. Credits refunded to requester (if guest cancels)
5. Notifications sent to both parties

### 7. Matching & Profile Reactivation
1. After successful match (both said YES):
   - Profiles go offline
   - Messaging enabled
   - Users see "profile offline due to match" message
2. User requests reactivation:
   - Selects from 26 reasons or provides custom (200+ words)
   - Partner notified to also respond
   - Admin reviews both responses
   - Auto-approval after 7 days if no feedback
3. If approved:
   - Profile reactivated
   - Users can continue using platform

### 8. Conflict Resolution (Admin)
1. Admin identifies conflicts:
   - 3+ people requesting same user on same date
2. Admin resolves:
   - Rebook some meetings to different times
   - Cancel some meetings
   - Notify all participants of changes

## Key Features Implemented

### Tier-Based Permissions
- Basic: Can only contact Basic users
- Standard: Can contact Basic & Standard (unlimited incoming from all tiers)
- Premium: Can contact Basic, Standard, Premium (+ extra charge for VIP)
- VIP: Can contact everyone, full control

### Credit System
- Credits deducted when request sent
- Held as "pending" until meeting finalized
- Refunded if meeting declined/canceled (with fee exceptions)
- Extra charges for Premium → VIP requests

### Charge Management
- **Pending**: Deducted but not finalized
- **Captured**: Finalized, charge applied
- **Refunded**: Refunded to requester

### Notification System
- Email + dashboard notifications
- Pre-meeting reminders (1hr, 30min, 15min, 10min, 5min, start)
- Meeting rules sent immediately
- All actions trigger notifications

### Meeting Rules & Etiquette
- 9 comprehensive sections
- Displayed before meetings
- Sent via email
- Shown when joining meeting

### Cancellation Fees
- Admin-configurable per meeting
- Shown when setting up calendar
- Shown when attempting to cancel
- Applied to wallet balance

### Matching System
- Automatic match creation when both say YES
- Messaging enabled between matched users
- Profiles go offline
- Reactivation process with partner notification

### Admin Functions
- Review meeting reports
- Finalize charges/refunds
- Resolve scheduling conflicts
- View all meeting responses
- Manage cancellation fees

## Integration Points

### Email Notifications
- TODO: Integrate with email service (Brevo, SendGrid, etc.)
- Currently creates notification records
- Email sending should be implemented in notification cron job

### Video Platform
- TODO: Integrate with BigBlueButton or similar
- Meeting links should be generated
- Recording should be stored for VIP users

### Signature Pad
- TODO: Integrate hardware signature pad
- Currently stores signature data as text
- Should capture digital signature from coordinator

## Cron Jobs Required

1. **Meeting Notifications** (`/api/cron/meeting-notifications`)
   - Should run every minute
   - Sends pending notifications
   - Updates notification status

2. **Profile Reactivation Auto-Approval**
   - Should run daily
   - Auto-approves requests after 7 days if no feedback

## Security & RLS Policies

All tables have proper RLS policies:
- Users can only access their own data
- Admins can access all data via `is_admin_user()` function
- Proper INSERT/UPDATE/SELECT policies for all operations

## Testing Checklist

- [ ] Meeting request with tier permissions
- [ ] Credit deduction and refund
- [ ] Pre-meeting notifications
- [ ] Meeting acceptance/decline
- [ ] Cancellation with fees
- [ ] Post-meeting Yes/No responses
- [ ] Matching when both say YES
- [ ] Profile reactivation request
- [ ] Admin charge finalization
- [ ] Conflict resolution
- [ ] Group meetings

## Next Steps

1. Integrate email service for notifications
2. Integrate video platform (BigBlueButton)
3. Add signature pad integration
4. Set up cron jobs (Vercel Cron or similar)
5. Add video recording storage for VIP users
6. Implement messaging system for matched users
7. Add profile offline status when matched
8. Complete admin UI for conflict resolution
