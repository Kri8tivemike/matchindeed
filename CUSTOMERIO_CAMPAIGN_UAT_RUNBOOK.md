# Customer.io Campaign + UAT Runbook

## Scope
This runbook covers:
- Campaign setup for MatchIndeed lifecycle events already emitted by backend.
- Activation checks.
- Real-user UAT timing verification for email/SMS delivery.

## Required Events (must have active campaign)
- `signed_up`
- `profile_completed`
- `preferences_set`
- `wallet_funded`
- `date_request_sent`
- `date_request_accepted`
- `meeting_completed`
- `chat_unlocked`

## Recommended Campaign Matrix
1. `signed_up`
- Campaign type: `event`
- Primary action: email (Welcome)
- Optional action: SMS (Welcome short text)

2. `profile_completed`
- Campaign type: `event`
- Primary action: email (Profile completed → next step)

3. `preferences_set`
- Campaign type: `event`
- Primary action: email (Preferences saved, discover next step)

4. `wallet_funded`
- Campaign type: `event`
- Primary action: email (Wallet funded confirmation)

5. `date_request_sent`
- Campaign type: `event`
- Primary action: email (Request sent confirmation)

6. `date_request_accepted`
- Campaign type: `event`
- Primary action: email (Date confirmed)
- Optional action: SMS reminder(s)

7. `meeting_completed`
- Campaign type: `event`
- Primary action: email (Submit YES/NO)

8. `chat_unlocked`
- Campaign type: `event`
- Primary action: email (Chat unlocked)
- Optional action: SMS (Chat now open)

## Campaign Setup Constraints
- Customer.io campaign creation/activation is UI-driven for Journeys.
- Use App API for auditing/inspection, not full campaign authoring.
- Ensure each campaign is in `active` state (not `draft`).

## Audit Command
Run from project root after setting `CUSTOMERIO_APP_API_KEY`:

```bash
npm run audit:customerio:campaigns
```

If output status is `warn`, at least one required event is missing/inactive.

## UAT Prerequisites
- At least 2 real test users (email + phone).
- Customer.io Twilio workspace configured and enabled (for SMS checks).
- All required campaigns active.
- App deployed with latest lifecycle event emitters.

## UAT Timing Procedure
For each event:
1. Trigger event through real product flow.
2. Record `event_emitted_at` (UTC).
3. Record `customerio_received_at` from Customer.io event log.
4. Record `message_sent_at` from Customer.io delivery log.
5. Record `message_received_at` in recipient inbox/phone.
6. Compute:
- ingest_latency = `customerio_received_at - event_emitted_at`
- send_latency = `message_sent_at - customerio_received_at`
- delivery_latency = `message_received_at - message_sent_at`
- end_to_end_latency = `message_received_at - event_emitted_at`

## UAT Evidence Template
For each tested event, capture:
- Event name
- User email/phone (masked)
- Campaign name + ID
- Message ID (email/SMS provider)
- Four timestamps (UTC)
- Screenshot/log links (Customer.io + mailbox/SMS inbox)

## Pass Criteria
- Every required event has at least one active campaign.
- 100% event ingestion success for test runs.
- 100% email delivery success for tested events.
- SMS only counted when Twilio channel is enabled and message template is active.
