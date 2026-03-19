# Alma Care SMS Dashboard — Proposal

## What We're Building

A web dashboard for Alma staff to manage SMS group conversations for client care teams. Staff create conversations, add participants (clients, family members, care providers), and monitor message history. Participants communicate over regular SMS — no app installs required.

Includes two monitoring features: a refresh button for checking new messages, and @alma tagging so participants can flag messages for staff attention (triggering email and SMS notifications to all staff).

---

## Development Time

### Core dashboard (original scope)

| Area | Hours |
|---|---|
| Project setup, hosting, database | 3–4 |
| Authentication (login, staff accounts) | 2–3 |
| Conversations list + create flow | 4–5 |
| Conversation detail (participants, message history, archive) | 3–4 |
| Admin staff management | 2–3 |
| Navigation, layout, polish | 2–3 |
| **Subtotal** | **16–22 hrs** |

### Monitoring + @alma tagging (new scope)

| Area | Hours |
|---|---|
| Refresh button with last-refreshed timestamp | 1 |
| Schema update (flagged messages, staff phone numbers) | 1 |
| Twilio webhook handler + @alma detection | 2–3 |
| Email notifications (Resend) | 1–2 |
| SMS notifications to staff | 1 |
| Dashboard highlight for flagged messages | 1–2 |
| **Subtotal** | **7–10 hrs** |

### Total

| | Hours |
|---|---|
| Development | 23–32 |
| Buffer (Twilio API quirks, testing, feedback rounds) | 4–6 |
| **Total** | **27–38 hrs** |

Quote as **30–40 hrs** at $75/hr = **$2,250–$3,000**.

---

## Ongoing Costs

### Twilio

All messaging runs through Twilio. Costs scale with usage.

| Item | Cost |
|---|---|
| Phone number | ~$1.15/month |
| Per SMS message (inbound or outbound, US) | ~$0.0079/message |
| Per active Conversation | $0.05/conversation/month |

**Estimated monthly at moderate usage** (50 active conversations, ~1,000 messages/month):
- Conversations: ~$2.50
- Messages: ~$8.00
- Phone number: ~$1.15
- **~$12/month**

At higher volume (200 conversations, 5,000 messages/month): ~$50/month.

Note: if the existing Grasshopper number is ported to Twilio, there's no additional number cost during the port period.

### Resend (email notifications)

Used to send @alma tag alerts to staff.

| Tier | Cost | Limit |
|---|---|---|
| Free | $0 | 3,000 emails/month, 100/day |
| Pro | $20/month | 50,000 emails/month |

For internal staff notifications the free tier should be sufficient indefinitely.

### Database (Neon PostgreSQL)

Stores staff accounts and conversation metadata only. Messages stay in Twilio.

| Tier | Cost |
|---|---|
| Free | $0 (0.5 GB, plenty for this use case) |
| Pro | $19/month |

Free tier is sufficient unless the organization grows significantly.

### Hosting (Railway or Vercel)

| Provider | Estimated Cost |
|---|---|
| Vercel (recommended for Next.js) | $0–20/month (free tier likely sufficient) |
| Railway | $5–15/month |

### Summary

| Service | Monthly Cost |
|---|---|
| Twilio (moderate usage) | ~$12 |
| Resend | $0 |
| Neon | $0 |
| Vercel / Railway | $0–20 |
| **Total** | **~$12–32/month** |

This scales up with message volume but stays low at typical care team usage.

---

## Out of Scope

- WhatsApp channel (SMS only)
- Automated responses or workflows
- CRM or scheduling integration
- Staff sending messages from the dashboard (messaging via personal phones over SMS)
- Number porting logistics (standard Twilio LOA process, runs in parallel, not a billable task)
