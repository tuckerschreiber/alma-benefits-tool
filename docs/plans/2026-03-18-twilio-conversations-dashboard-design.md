# Alma Care — Twilio Conversations Dashboard

## Overview

A web app that lets Alma staff manage SMS group conversations for client care teams. Staff use a browser-based dashboard to create and manage conversations. All actual messaging happens over SMS — no app installs required for clients or care team members.

## How It Works

Twilio provisions one Alma phone number as the hub. Everyone on a care team texts that number. When someone sends a message, Twilio forwards it to all other participants with the sender's name prepended:

> Sarah: Hey, appointment is confirmed for Thursday at 2pm

Participants do not see each other's phone numbers. They receive messages from the Alma number. Clients need a brief heads-up that texting that number reaches their whole care team.

## Stack

- **Next.js** — frontend + backend API routes in one codebase
- **PostgreSQL** (Neon or Supabase free tier) — staff accounts and conversation metadata
- **JWT + email/password** — auth, no OAuth
- **Twilio Conversations API** — all messaging infrastructure
- **Vercel or Railway** — hosting

## Data Model

**`staff`**
- id, name, email, hashed_password, is_admin, created_at

**`conversations`**
- id, twilio_conversation_sid, friendly_name, created_by (staff id), created_at, archived_at

Participants, messages, and message history live in Twilio. We store only the SID to look up the right conversation.

## Pages

| Route | Purpose |
|---|---|
| `/login` | Email + password login |
| `/conversations` | List all active conversations, New Conversation button |
| `/conversations/new` | Form to name conversation and add participants (phone + label) |
| `/conversations/[id]` | View participants, add/remove participants, read-only message history, archive button |
| `/admin/staff` | Admin-only: add/remove staff accounts |

## Number Porting

Porting from Grasshopper is a standard Twilio LOA (Letter of Authorization) process. Takes 5–10 business days. Needs to be kicked off early — runs in parallel with development, not a billable task.

## Scope Estimate

| Area | Hours |
|---|---|
| Setup & infrastructure | 3–4 |
| Auth | 2–3 |
| Dashboard core | 6–8 |
| Conversation detail | 3–4 |
| Polish & testing | 3–4 |
| **Total** | **17–23 hrs** |

Quote as 20–25 hrs to account for Twilio API quirks and UI feedback rounds.

## Out of Scope

- WhatsApp channel (SMS only to start)
- Automated workflows or auto-responses
- CRM or scheduling system integration
- Staff sending messages from the dashboard (all messaging via personal phones over SMS)
