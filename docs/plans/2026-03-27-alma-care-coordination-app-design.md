# Alma Care — Coordination App

## Overview

A three-sided platform for coordinating postpartum care between clients, care team members, and the Alma admin team. Clients and care team access the app via a mobile-optimized PWA (installable to home screen). Alma admins use a desktop-optimized web dashboard. Everything runs from a single Next.js application.

This replaces the earlier SMS dashboard concept with a full care coordination tool.

## Stack

- **Framework:** Next.js (App Router), TypeScript
- **Database:** PostgreSQL (Neon) with Prisma ORM
- **Auth:** NextAuth.js — invite-link flow (magic links via email/SMS)
- **Real-time:** Server-Sent Events (SSE) for chat and notifications
- **Email:** Resend (invites + admin alert emails)
- **Hosting:** Vercel (frontend + API) + Neon Postgres
- **External integration:** Airtable API (sync client/care team data)

**Running costs:** ~$20–50/month (Vercel Pro + Neon). Scales with usage.

## Architecture

One Next.js app, three experiences via role-based routing:

- `/app/*` — Client & care team PWA (mobile-optimized, installable)
- `/admin/*` — Alma team dashboard (desktop-optimized)
- `/api/*` — Shared API layer

### Airtable Integration

Airtable remains the source of truth for client intake and care team profiles. When a client is matched and ready to onboard:

1. Alma admin triggers a sync from the dashboard
2. The app pulls client info, care team assignment, and hour requirements from Airtable
3. From that point, the app owns scheduling, chat, notes, and notifications
4. Status updates (schedule confirmed, care started, care ended) are pushed back to Airtable

This avoids re-entering data and keeps Airtable current for any other workflows Alma runs.

## Data Model

### User
- id, email, name, phone, role (`client` | `care_team` | `admin`), invite_status, created_at
- Synced from Airtable for clients and care team; created manually for admins

### CareTeam
- id, client_id (User), coordinator_id (User, admin), status (`onboarding` | `scheduling` | `active` | `ending` | `completed`), weekly_hours_target, care_start_date, care_end_date
- The central hub — scheduling, chat, and notes all hang off this

### CareTeamMember
- id, care_team_id, user_id (care team User), role label (e.g. "Night Nurse", "Doula")

### Schedule
- id, care_team_id, status (`draft` | `pending_confirmation` | `confirmed` | `active`), created_by

### Shift
- id, schedule_id, care_team_member_id, date, start_time, end_time, status (`scheduled` | `change_requested` | `confirmed` | `completed`)

### ShiftChangeRequest
- id, shift_id, requested_by (User), request_type (`reschedule` | `swap_member` | `cancel`), proposed_date, proposed_time, status (`pending` | `approved` | `escalated` | `resolved`), notes

### Conversation
- id, care_team_id
- One conversation per care team (client + care team members + Alma coordinator)

### Message
- id, conversation_id, sender_id (User), content, created_at, read_by (array of user IDs)

### NoteTemplate
- id, name (e.g. "Night Shift Log", "Daytime Visit Log"), fields (JSON array: field name, field type)
- Created by Alma admin

### Note
- id, care_team_id, template_id, created_by (care team User), shift_id (optional), data (JSON matching template fields), created_at

### Notification
- id, recipient_id (User, typically admin), type (`schedule_conflict` | `shift_change` | `extension_request` | `approaching_end`), status (`unread` | `read` | `resolved`), related_entity_type, related_entity_id, created_at

## User Flows

### Client Experience

**Onboarding:**
1. Receives SMS/email invite from Alma
2. Opens link, creates account (name + password)
3. Lands on home screen — care team assigned, draft schedule waiting

**Home screen:**
- Upcoming shifts this week (who, when)
- Unread messages badge
- Quick actions: "Request Change," "Message Team," "Request More Hours"

**Schedule view:**
- Weekly calendar with all shifts and care team member names
- Tap a shift to request a change (new time or different team member)
- Change requests go to care team first → if unresolved, escalate to Alma
- Banner when care end date approaches: "Your care ends [date]. Need more hours?"

**Chat:**
- Single group conversation (client + care team + Alma coordinator)
- Coordination use: "running late," "can we shift Thursday to Friday?"

**Notes:**
- Read-only — clients see structured notes logged by care team after each visit

### Care Team Experience

**Onboarding:**
1. Alma admin adds them, they receive invite link
2. Create account, set general availability
3. See dashboard with all active client assignments

**Home screen:**
- Today's shifts (client, time, address)
- Upcoming shifts this week
- Unread messages across client conversations

**Schedule:**
- View shifts across all assigned clients
- Review and confirm draft schedules; flag shifts they can't do
- Respond to client shift change requests

**Notes:**
- Fill out structured notes from templates after visits
- Notes visible to all care team members on that client + Alma

**Chat:**
- List of all client conversations

### Alma Admin Dashboard

**Action items queue:**
- Everything needing attention, sorted by urgency: schedule conflicts, shift change requests, extension requests, approaching care end dates
- Each item links to the relevant care team/schedule/conversation

**Client management:**
- All clients with status (onboarding, scheduling, active, ending soon)
- Create client → sync from Airtable or manual input
- Assign care team members → triggers client invite
- Mark "schedule finalized" → triggers "ready for agreement" notification

**Schedule builder:**
- Select a care team → see weekly hour target + care team availability
- Drag shifts onto weekly calendar
- Publish draft → care team notified to review
- See conflicts/flags, resolve by reassigning or adjusting

**Note templates:**
- Create/edit structured templates (field name, field type: text, number, time, checkbox)
- Assign templates to care teams

**Conversations:**
- View all client conversations, jump in when flagged

**Notifications:**
- In-app alert center + email for escalations

## Agreement & Invoicing (v1)

Out of scope for the app. When a schedule is finalized, the app surfaces a "Ready for agreement" status. Alma handles DocuSign and invoicing manually, as they do today. Future phases can integrate DocuSign API and Stripe.

## What's Not Included (v1)

- DocuSign integration (manual for now)
- In-app invoicing/payments
- Automated schedule optimization
- Public sign-up (invite-only for now)
- Native mobile apps (PWA first, Expo/React Native later if needed)
- WhatsApp or SMS messaging (in-app chat only)
