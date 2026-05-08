# MatchIndeed API Inventory

Date: April 27, 2026
Base URL: `https://matchindeed.com`
Total active API routes in codebase: `74`

## Notes

- This inventory is based on the current Next.js route files under `src/app/api`.
- `Status` in this report means the route is currently present in the codebase and part of the active application surface.
- `Access Level` indicates the expected audience:
  - `Public`: accessible without signed-in user context
  - `User`: intended for authenticated app users
  - `Admin`: intended for admin console users
  - `Coordinator`: intended for coordinator console users
  - `Internal`: cron jobs, maintenance, or system integrations
  - `Webhook`: provider callback endpoint

## Public / Core

| API URL | Purpose | Access Level | Status |
| --- | --- | --- | --- |
| `/api/agreements` | Terms or rules acknowledgement data | Public | Active |
| `/api/auth/forgot-password` | Start password reset flow | Public | Active |
| `/api/auth/provision` | Auth/session provisioning helper | Public | Active |
| `/api/auth/register` | New account registration | Public | Active |
| `/api/auth/resend-verification` | Resend email verification | Public | Active |
| `/api/fingerprint` | Device or browser fingerprint support | Public | Active |
| `/api/geo` | Geo lookup for user experience or policy logic | Public | Active |
| `/api/health` | Application health check endpoint | Public | Active |
| `/api/subscription-pricing` | Public subscription pricing payload | Public | Active |
| `/api/support` | Support/contact form handling | Public | Active |

## Discovery / User Engagement

| API URL | Purpose | Access Level | Status |
| --- | --- | --- | --- |
| `/api/activities` | Activity feed or engagement tracking | User | Active |
| `/api/calendar` | Calendar slot create/read/update flow | User | Active |
| `/api/lifecycle/profile-progress` | Onboarding/profile completion state | User | Active |
| `/api/matches` | Match discovery and match records | User | Active |
| `/api/messages` | User messaging and conversation actions | User | Active |
| `/api/notifications` | Notification list and notification state | User | Active |
| `/api/photo/upload` | Photo upload pipeline | User | Active |
| `/api/reports` | User reporting and complaint submission | User | Active |
| `/api/top-picks` | Top picks recommendation feed | User | Active |

## Profile / Account

| API URL | Purpose | Access Level | Status |
| --- | --- | --- | --- |
| `/api/profile/account` | Account profile details and updates | User | Active |
| `/api/profile/block` | Block or unblock another user | User | Active |
| `/api/profile/block/ids` | Fetch blocked user IDs | User | Active |
| `/api/profile/blocked-locations` | Manage blocked locations/preferences | User | Active |
| `/api/profile/heartbeat` | Presence/session heartbeat updates | User | Active |
| `/api/profile/notification-preferences` | Notification preference settings | User | Active |
| `/api/profile/reactivate` | Start account reactivation flow | User | Active |
| `/api/profile/reactivate/respond` | Submit reactivation response/action | User | Active |
| `/api/profile/view` | View user profile data | User | Active |
| `/api/profile/visibility` | Manage profile visibility state | User | Active |
| `/api/reactivation/send-notification` | Send reactivation-related notifications | Internal | Active |

## Meetings / Host Operations

| API URL | Purpose | Access Level | Status |
| --- | --- | --- | --- |
| `/api/meetings` | Create/list meeting records and requests | User | Active |
| `/api/meetings/acknowledge-rules` | Save meeting rules acknowledgement | User | Active |
| `/api/meetings/availability` | Meeting availability checks | User | Active |
| `/api/meetings/cancel` | Cancel scheduled/requested meetings | User | Active |
| `/api/meetings/finalize` | Finalize meeting state transition | User | Active |
| `/api/meetings/notifications` | Meeting-related notifications | User | Active |
| `/api/meetings/notifications/schedule` | Schedule reminder notifications | Internal | Active |
| `/api/meetings/response` | Accept or decline meeting requests | User | Active |
| `/api/meetings/video-link` | Fetch or validate meeting video link | User | Active |
| `/api/host/meetings` | Host-facing meeting management | User | Active |
| `/api/host/report` | Host/coordinator meeting report submission | User | Active |

## Payments / Wallet / Subscription

| API URL | Purpose | Access Level | Status |
| --- | --- | --- | --- |
| `/api/add-credits` | Add user meeting credits | User | Active |
| `/api/correct-wallet-balance` | Wallet correction/repair utility | Internal | Active |
| `/api/create-checkout-session` | Start Stripe checkout session | User | Active |
| `/api/use-wallet-balance` | Apply wallet balance toward payment | User | Active |
| `/api/verify-payment` | Verify completed payment status | User | Active |
| `/api/verify-subscription` | Verify subscription activation/result | User | Active |
| `/api/webhook/stripe` | Stripe webhook receiver | Webhook | Active |

## Admin APIs

| API URL | Purpose | Access Level | Status |
| --- | --- | --- | --- |
| `/api/admin/activity-limits` | Manage per-tier activity rate limits | Admin | Active |
| `/api/admin/analytics` | Admin analytics dashboard data | Admin | Active |
| `/api/admin/coordinators` | Coordinator listing and management | Admin | Active |
| `/api/admin/meetings` | Admin meeting list and management | Admin | Active |
| `/api/admin/meetings/approve` | Approve meetings and related readiness flow | Admin | Active |
| `/api/admin/meetings/coordinator` | Assign or remove coordinator from meeting | Admin | Active |
| `/api/admin/meetings/reschedule` | Admin reschedule action | Admin | Active |
| `/api/admin/meetings/resolve` | Post-meeting review or dispute resolution | Admin | Active |
| `/api/admin/mfa/recovery-code` | Admin 2FA recovery code management | Admin | Active |
| `/api/admin/mfa/recovery-code/verify` | Admin recovery-code sign-in verification | Admin | Active |
| `/api/admin/permissions` | Admin/sub-admin permission configuration | Admin | Active |
| `/api/admin/permissions/me` | Current admin effective permissions | Admin | Active |
| `/api/admin/test-integrations` | Integration diagnostics or checks | Admin | Active |
| `/api/admin/user-actions` | Admin user actions such as suspend/ban/update | Admin | Active |
| `/api/admin/user-profile` | Admin user profile inspection/update | Admin | Active |
| `/api/admin/wallet` | Admin wallet management tools | Admin | Active |

## Coordinator APIs

| API URL | Purpose | Access Level | Status |
| --- | --- | --- | --- |
| `/api/coordinator/access` | Validate coordinator access state | Coordinator | Active |
| `/api/coordinator/meetings` | Assigned coordinator meeting list | Coordinator | Active |
| `/api/coordinator/mfa/recovery-code` | Coordinator 2FA recovery code management | Coordinator | Active |
| `/api/coordinator/mfa/recovery-code/verify` | Coordinator recovery-code sign-in verification | Coordinator | Active |
| `/api/coordinator/permissions` | Current coordinator effective permissions | Coordinator | Active |

## Cron / Integrations / Internal Operations

| API URL | Purpose | Access Level | Status |
| --- | --- | --- | --- |
| `/api/cron/credits-reset` | Scheduled credit reset job | Internal | Active |
| `/api/cron/meeting-notifications` | Scheduled meeting reminders and alerts | Internal | Active |
| `/api/cron/reactivation-auto-approve` | Automated reactivation workflow | Internal | Active |
| `/api/integrations/onesignal` | OneSignal integration endpoint | Internal | Active |
| `/api/test-email` | Email delivery test endpoint | Internal | Active |

## Summary by Access Level

| Access Level | Count |
| --- | ---: |
| Public | 10 |
| User | 34 |
| Admin | 16 |
| Coordinator | 5 |
| Internal | 8 |
| Webhook | 1 |
| **Total** | **74** |
