# Alma Care — Monitoring View & @-Tagging

## Overview

Two features added on top of the existing Twilio Conversations dashboard:

1. **Refresh button** — staff can manually refresh the conversation detail page to see new messages
2. **@alma tagging** — SMS participants can type `@alma` in a message to flag it for staff attention; flagged messages are highlighted in the dashboard and trigger email + SMS notifications to all staff

---

## Feature 1: Refresh button

No new infrastructure. On `/conversations/[sid]`, add a "Refresh" button that re-calls `/api/conversations/[sid]` and re-renders the message list. Show a "last refreshed at [time]" label so staff know how fresh the data is.

**Changes:**
- `app/conversations/[sid]/page.tsx` — add refresh button and last-refreshed timestamp

---

## Feature 2: @alma tagging

### Schema

Add to `lib/schema.sql`:

```sql
ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone_number TEXT;

CREATE TABLE IF NOT EXISTS flagged_messages (
  id SERIAL PRIMARY KEY,
  twilio_conversation_sid TEXT NOT NULL,
  message_sid TEXT NOT NULL UNIQUE,
  author TEXT,
  body TEXT,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Webhook endpoint

Twilio calls `POST /api/webhooks/twilio` on every new message in any conversation (configured in Twilio console under the Conversations Service webhook settings, event: `onMessageAdded`).

Handler logic:
1. Parse `ConversationSid`, `MessageSid`, `Author`, `Body` from the Twilio webhook payload
2. If `Body` contains `@alma` (case-insensitive):
   - Insert row into `flagged_messages`
   - Fetch all staff emails and phone numbers from DB
   - Fetch the conversation's `friendly_name` from `conversations` table
   - Fire email + SMS notifications in parallel

**New file:** `app/api/webhooks/twilio/route.ts`

### Email notification (Resend)

- Install: `npm install resend`
- New env var: `RESEND_API_KEY`
- Sends to all staff emails
- Subject: `@alma mention in [conversation name]`
- Body: sender name + message text

### SMS notification (Twilio)

- Uses existing Twilio client
- Sends to all staff `phone_number`s (skip nulls)
- Message: `@alma mention in [conversation name]: "[message body]"`
- Sent from `TWILIO_PHONE_NUMBER`

### Dashboard highlight

Extend `GET /api/conversations/[sid]` to also return `flaggedSids` — an array of message SIDs pulled from `flagged_messages` for that conversation SID.

In the message list UI, messages whose SID is in `flaggedSids` get:
- Yellow background
- Small "@alma" badge

**Changes:**
- `app/api/conversations/[sid]/route.ts` — add flaggedSids to response
- `app/conversations/[sid]/page.tsx` — highlight flagged messages

---

## New env vars

```
RESEND_API_KEY=   # from resend.com
```

---

## Files changed / created

| File | Change |
|---|---|
| `lib/schema.sql` | Add `phone_number` to staff, add `flagged_messages` table |
| `app/api/webhooks/twilio/route.ts` | New — webhook handler |
| `app/api/conversations/[sid]/route.ts` | Add `flaggedSids` to response |
| `app/conversations/[sid]/page.tsx` | Refresh button + flagged message highlights |
| `app/admin/staff/page.tsx` | Add phone number field to staff form |
| `app/api/admin/staff/route.ts` | Include `phone_number` in insert |
