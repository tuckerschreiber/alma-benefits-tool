# Alma Care Twilio Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Next.js web app where Alma staff can create and manage Twilio Conversations SMS group chats for client care teams.

**Architecture:** Next.js App Router with API routes for the backend, PostgreSQL for staff accounts + conversation metadata, Twilio Conversations API for all messaging. Auth via JWT stored in an HttpOnly cookie.

**Tech Stack:** Next.js 14, PostgreSQL (Neon), `pg` (raw SQL, no ORM), `jose` (JWT), `bcryptjs` (password hashing), Twilio Node SDK, Tailwind CSS

---

### Task 1: Scaffold the Next.js project

**Files:**
- Create: `.worktrees/main-app/` (working directory for all tasks)

**Step 1: Create the Next.js app**

Run from `/Users/tucker.schreiber/Documents/alma/.worktrees/main-app/`:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```
When prompted, accept all defaults.

**Step 2: Install dependencies**

```bash
npm install pg bcryptjs jose twilio
npm install --save-dev @types/pg @types/bcryptjs
```

**Step 3: Verify it runs**

```bash
npm run dev
```
Expected: server starts on http://localhost:3000, default Next.js page loads.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with dependencies"
```

---

### Task 2: Database setup

**Files:**
- Create: `lib/db.ts`
- Create: `lib/schema.sql`
- Create: `scripts/migrate.ts`

**Step 1: Create schema file**

`lib/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  twilio_conversation_sid TEXT NOT NULL UNIQUE,
  friendly_name TEXT NOT NULL,
  created_by INTEGER REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
```

**Step 2: Create DB client**

`lib/db.ts`:
```typescript
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

export default pool
```

**Step 3: Create migration script**

`scripts/migrate.ts`:
```typescript
import pool from '../lib/db'
import fs from 'fs'
import path from 'path'

async function migrate() {
  const sql = fs.readFileSync(path.join(process.cwd(), 'lib/schema.sql'), 'utf8')
  await pool.query(sql)
  console.log('Migration complete')
  process.exit(0)
}

migrate().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

**Step 4: Add script to package.json**

In `package.json`, add to `scripts`:
```json
"migrate": "tsx scripts/migrate.ts"
```

Install tsx:
```bash
npm install --save-dev tsx
```

**Step 5: Set up Neon database**

1. Go to neon.tech, create a free account and new project called "alma"
2. Copy the connection string
3. Create `.env.local`:
```
DATABASE_URL=<your-neon-connection-string>
TWILIO_ACCOUNT_SID=<from-twilio-console>
TWILIO_AUTH_TOKEN=<from-twilio-console>
TWILIO_MESSAGING_SERVICE_SID=<from-twilio-console>
JWT_SECRET=<generate with: openssl rand -base64 32>
```

**Step 6: Run migration**

```bash
npm run migrate
```
Expected: "Migration complete"

**Step 7: Commit**

```bash
git add lib/db.ts lib/schema.sql scripts/migrate.ts package.json
git commit -m "feat: add database schema and migration script"
```

---

### Task 3: Auth utilities

**Files:**
- Create: `lib/auth.ts`

**Step 1: Write the test**

Create `lib/auth.test.ts`:
```typescript
import { hashPassword, verifyPassword, createToken, verifyToken } from './auth'

describe('auth utilities', () => {
  test('hashPassword and verifyPassword round-trip', async () => {
    const hash = await hashPassword('mypassword')
    expect(await verifyPassword('mypassword', hash)).toBe(true)
    expect(await verifyPassword('wrongpassword', hash)).toBe(false)
  })

  test('createToken and verifyToken round-trip', async () => {
    const token = await createToken({ id: 1, email: 'test@test.com', isAdmin: false })
    const payload = await verifyToken(token)
    expect(payload.id).toBe(1)
    expect(payload.email).toBe('test@test.com')
  })

  test('verifyToken returns null for invalid token', async () => {
    const result = await verifyToken('invalid')
    expect(result).toBeNull()
  })
})
```

**Step 2: Run the test to verify it fails**

```bash
npx jest lib/auth.test.ts
```
Expected: FAIL — module not found

**Step 3: Install jest**

```bash
npm install --save-dev jest @types/jest ts-jest
```

Add to `package.json`:
```json
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node",
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/$1"
  }
},
"scripts": {
  "test": "jest"
}
```

**Step 4: Implement auth utilities**

`lib/auth.ts`:
```typescript
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-in-prod')

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export interface TokenPayload {
  id: number
  email: string
  isAdmin: boolean
}

export async function createToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as TokenPayload
  } catch {
    return null
  }
}
```

**Step 5: Run tests to verify they pass**

```bash
npx jest lib/auth.test.ts
```
Expected: 3 tests passing

**Step 6: Commit**

```bash
git add lib/auth.ts lib/auth.test.ts package.json
git commit -m "feat: add auth utilities with tests"
```

---

### Task 4: Middleware (route protection)

**Files:**
- Create: `middleware.ts`

**Step 1: Implement middleware**

`middleware.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

const PUBLIC_PATHS = ['/login', '/api/auth/login']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = req.cookies.get('token')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

**Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat: add auth middleware for route protection"
```

---

### Task 5: Login API + page

**Files:**
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `app/login/page.tsx`

**Step 1: Create login API route**

`app/api/auth/login/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { verifyPassword, createToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  const result = await pool.query('SELECT * FROM staff WHERE email = $1', [email])
  const staff = result.rows[0]

  if (!staff || !(await verifyPassword(password, staff.hashed_password))) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = await createToken({ id: staff.id, email: staff.email, isAdmin: staff.is_admin })

  const response = NextResponse.json({ ok: true })
  response.cookies.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return response
}
```

**Step 2: Create logout API route**

`app/api/auth/logout/route.ts`:
```typescript
import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.redirect('/login')
  response.cookies.delete('token')
  return response
}
```

**Step 3: Create login page**

`app/login/page.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (res.ok) {
      router.push('/conversations')
    } else {
      setError('Invalid email or password')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded shadow w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6">Alma Care</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
```

**Step 4: Create a seed script to add the first admin user**

`scripts/seed.ts`:
```typescript
import pool from '../lib/db'
import { hashPassword } from '../lib/auth'

async function seed() {
  const hash = await hashPassword('changeme123')
  await pool.query(
    `INSERT INTO staff (name, email, hashed_password, is_admin)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (email) DO NOTHING`,
    ['Admin', 'admin@almacare.com', hash]
  )
  console.log('Seeded admin user: admin@almacare.com / changeme123')
  process.exit(0)
}

seed().catch((err) => { console.error(err); process.exit(1) })
```

Add to `package.json` scripts: `"seed": "tsx scripts/seed.ts"`

**Step 5: Run seed**

```bash
npm run seed
```

**Step 6: Test login manually**

```bash
npm run dev
```
Navigate to http://localhost:3000/login, log in with admin@almacare.com / changeme123. Should redirect to /conversations.

**Step 7: Commit**

```bash
git add app/api/auth/ app/login/ scripts/seed.ts package.json
git commit -m "feat: add login/logout and seed script"
```

---

### Task 6: Twilio client setup

**Files:**
- Create: `lib/twilio.ts`

**Step 1: Create Twilio client**

`lib/twilio.ts`:
```typescript
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

export default client
```

**Step 2: Commit**

```bash
git add lib/twilio.ts
git commit -m "feat: add Twilio client"
```

---

### Task 7: Conversations list

**Files:**
- Create: `app/api/conversations/route.ts`
- Create: `app/conversations/page.tsx`
- Create: `app/layout.tsx` (update)

**Step 1: Create conversations API (GET)**

`app/api/conversations/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  const result = await pool.query(`
    SELECT c.*, s.name as created_by_name
    FROM conversations c
    LEFT JOIN staff s ON c.created_by = s.id
    WHERE c.archived_at IS NULL
    ORDER BY c.created_at DESC
  `)
  return NextResponse.json(result.rows)
}
```

**Step 2: Create conversations list page**

`app/conversations/page.tsx`:
```typescript
import Link from 'next/link'
import pool from '@/lib/db'

async function getConversations() {
  const result = await pool.query(`
    SELECT c.*, s.name as created_by_name
    FROM conversations c
    LEFT JOIN staff s ON c.created_by = s.id
    WHERE c.archived_at IS NULL
    ORDER BY c.created_at DESC
  `)
  return result.rows
}

export default async function ConversationsPage() {
  const conversations = await getConversations()

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Conversations</h1>
        <Link
          href="/conversations/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          New conversation
        </Link>
      </div>

      {conversations.length === 0 ? (
        <p className="text-gray-500">No active conversations.</p>
      ) : (
        <ul className="space-y-2">
          {conversations.map((c: Record<string, unknown>) => (
            <li key={String(c.id)}>
              <Link
                href={`/conversations/${c.twilio_conversation_sid}`}
                className="block p-4 border rounded hover:bg-gray-50"
              >
                <div className="font-medium">{String(c.friendly_name)}</div>
                <div className="text-sm text-gray-500">
                  Created by {String(c.created_by_name)} ·{' '}
                  {new Date(String(c.created_at)).toLocaleDateString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**Step 3: Update root layout to redirect / to /conversations**

`app/page.tsx` — replace default content:
```typescript
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/conversations')
}
```

**Step 4: Verify in browser**

```bash
npm run dev
```
Log in and confirm the conversations list page renders with "No active conversations."

**Step 5: Commit**

```bash
git add app/api/conversations/route.ts app/conversations/page.tsx app/page.tsx
git commit -m "feat: add conversations list page"
```

---

### Task 8: Create conversation

**Files:**
- Create: `app/conversations/new/page.tsx`
- Modify: `app/api/conversations/route.ts` (add POST)

**Step 1: Add POST handler to conversations API**

Add to `app/api/conversations/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import client from '@/lib/twilio'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  const staff = token ? await verifyToken(token) : null
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { friendlyName, participants } = await req.json()
  // participants: Array<{ phoneNumber: string, label: string }>

  // Create Twilio conversation
  const conversation = await client.conversations.v1.conversations.create({
    friendlyName,
  })

  // Add each participant
  for (const p of participants) {
    await client.conversations.v1
      .conversations(conversation.sid)
      .participants.create({
        'messagingBinding.address': p.phoneNumber,
        'messagingBinding.proxyAddress': process.env.TWILIO_PHONE_NUMBER,
        identity: p.label,
      })
  }

  // Save to DB
  const result = await pool.query(
    `INSERT INTO conversations (twilio_conversation_sid, friendly_name, created_by)
     VALUES ($1, $2, $3) RETURNING *`,
    [conversation.sid, friendlyName, staff.id]
  )

  return NextResponse.json(result.rows[0], { status: 201 })
}
```

Also add `TWILIO_PHONE_NUMBER=<your-twilio-number>` to `.env.local`.

**Step 2: Create new conversation page**

`app/conversations/new/page.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Participant {
  phoneNumber: string
  label: string
}

export default function NewConversationPage() {
  const router = useRouter()
  const [friendlyName, setFriendlyName] = useState('')
  const [participants, setParticipants] = useState<Participant[]>([
    { phoneNumber: '', label: '' },
  ])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function addParticipant() {
    setParticipants([...participants, { phoneNumber: '', label: '' }])
  }

  function removeParticipant(i: number) {
    setParticipants(participants.filter((_, idx) => idx !== i))
  }

  function updateParticipant(i: number, field: keyof Participant, value: string) {
    const updated = [...participants]
    updated[i][field] = value
    setParticipants(updated)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendlyName, participants }),
    })

    if (res.ok) {
      router.push('/conversations')
    } else {
      const data = await res.json()
      setError(data.error || 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">New conversation</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">Conversation name</label>
          <input
            type="text"
            value={friendlyName}
            onChange={(e) => setFriendlyName(e.target.value)}
            placeholder="e.g. Smith Family"
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Participants</label>
          <div className="space-y-3">
            {participants.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="tel"
                  placeholder="+15551234567"
                  value={p.phoneNumber}
                  onChange={(e) => updateParticipant(i, 'phoneNumber', e.target.value)}
                  className="flex-1 border rounded px-3 py-2"
                  required
                />
                <input
                  type="text"
                  placeholder="Label (e.g. Mom)"
                  value={p.label}
                  onChange={(e) => updateParticipant(i, 'label', e.target.value)}
                  className="flex-1 border rounded px-3 py-2"
                  required
                />
                {participants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeParticipant(i)}
                    className="text-red-500 px-2"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addParticipant}
            className="mt-2 text-blue-600 text-sm hover:underline"
          >
            + Add participant
          </button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create conversation'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-gray-600 px-4 py-2 rounded border hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
```

**Step 3: Test manually**

Create a test conversation with a real phone number. Verify the Twilio conversation appears in the Twilio console.

**Step 4: Commit**

```bash
git add app/conversations/new/page.tsx app/api/conversations/route.ts
git commit -m "feat: add create conversation page and API"
```

---

### Task 9: Conversation detail page

**Files:**
- Create: `app/conversations/[sid]/page.tsx`
- Create: `app/api/conversations/[sid]/route.ts`

**Step 1: Create conversation detail API**

`app/api/conversations/[sid]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/twilio'

export async function GET(
  _req: NextRequest,
  { params }: { params: { sid: string } }
) {
  const { sid } = params

  const [participantsResult, messagesResult] = await Promise.all([
    client.conversations.v1.conversations(sid).participants.list(),
    client.conversations.v1.conversations(sid).messages.list({ limit: 50 }),
  ])

  return NextResponse.json({
    participants: participantsResult,
    messages: messagesResult,
  })
}
```

**Step 2: Create detail page**

`app/conversations/[sid]/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Message {
  sid: string
  author: string
  body: string
  dateCreated: string
}

interface Participant {
  sid: string
  identity: string
  messagingBinding: { address: string } | null
}

export default function ConversationDetailPage() {
  const { sid } = useParams<{ sid: string }>()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [newPhone, setNewPhone] = useState('')
  const [newLabel, setNewLabel] = useState('')

  useEffect(() => {
    fetch(`/api/conversations/${sid}`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data.messages || [])
        setParticipants(data.participants || [])
        setLoading(false)
      })
  }, [sid])

  async function addParticipant(e: React.FormEvent) {
    e.preventDefault()
    await fetch(`/api/conversations/${sid}/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: newPhone, label: newLabel }),
    })
    setNewPhone('')
    setNewLabel('')
    router.refresh()
  }

  async function removeParticipant(participantSid: string) {
    await fetch(`/api/conversations/${sid}/participants/${participantSid}`, {
      method: 'DELETE',
    })
    setParticipants(participants.filter((p) => p.sid !== participantSid))
  }

  async function archiveConversation() {
    if (!confirm('Archive this conversation?')) return
    await fetch(`/api/conversations/${sid}/archive`, { method: 'POST' })
    router.push('/conversations')
  }

  if (loading) return <div className="p-8">Loading...</div>

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div className="flex justify-between items-center">
        <Link href="/conversations" className="text-blue-600 hover:underline text-sm">
          ← Back
        </Link>
        <button
          onClick={archiveConversation}
          className="text-sm text-gray-500 hover:text-red-500"
        >
          Archive conversation
        </button>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Participants</h2>
        <ul className="space-y-2 mb-4">
          {participants.map((p) => (
            <li key={p.sid} className="flex justify-between items-center border rounded px-3 py-2">
              <span>
                <span className="font-medium">{p.identity || 'Unknown'}</span>
                {p.messagingBinding?.address && (
                  <span className="text-sm text-gray-500 ml-2">{p.messagingBinding.address}</span>
                )}
              </span>
              <button
                onClick={() => removeParticipant(p.sid)}
                className="text-red-500 text-sm hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={addParticipant} className="flex gap-2">
          <input
            type="tel"
            placeholder="+15551234567"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="border rounded px-3 py-1 text-sm flex-1"
            required
          />
          <input
            type="text"
            placeholder="Label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="border rounded px-3 py-1 text-sm w-32"
            required
          />
          <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
            Add
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Message history</h2>
        {messages.length === 0 ? (
          <p className="text-gray-500 text-sm">No messages yet.</p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <li key={m.sid} className="border rounded px-3 py-2">
                <div className="text-sm font-medium">{m.author}</div>
                <div className="text-sm">{m.body}</div>
                <div className="text-xs text-gray-400">
                  {new Date(m.dateCreated).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add app/conversations/[sid]/ app/api/conversations/[sid]/
git commit -m "feat: add conversation detail page with message history"
```

---

### Task 10: Participant management API

**Files:**
- Create: `app/api/conversations/[sid]/participants/route.ts`
- Create: `app/api/conversations/[sid]/participants/[participantSid]/route.ts`
- Create: `app/api/conversations/[sid]/archive/route.ts`

**Step 1: Add participant**

`app/api/conversations/[sid]/participants/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/twilio'

export async function POST(
  req: NextRequest,
  { params }: { params: { sid: string } }
) {
  const { phoneNumber, label } = await req.json()

  const participant = await client.conversations.v1
    .conversations(params.sid)
    .participants.create({
      'messagingBinding.address': phoneNumber,
      'messagingBinding.proxyAddress': process.env.TWILIO_PHONE_NUMBER,
      identity: label,
    })

  return NextResponse.json(participant, { status: 201 })
}
```

**Step 2: Remove participant**

`app/api/conversations/[sid]/participants/[participantSid]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/twilio'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { sid: string; participantSid: string } }
) {
  await client.conversations.v1
    .conversations(params.sid)
    .participants(params.participantSid)
    .remove()

  return new NextResponse(null, { status: 204 })
}
```

**Step 3: Archive conversation**

`app/api/conversations/[sid]/archive/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import client from '@/lib/twilio'

export async function POST(
  _req: NextRequest,
  { params }: { params: { sid: string } }
) {
  await client.conversations.v1.conversations(params.sid).update({ state: 'closed' })

  await pool.query(
    `UPDATE conversations SET archived_at = NOW() WHERE twilio_conversation_sid = $1`,
    [params.sid]
  )

  return NextResponse.json({ ok: true })
}
```

**Step 4: Commit**

```bash
git add app/api/conversations/[sid]/
git commit -m "feat: add participant management and archive APIs"
```

---

### Task 11: Admin staff management

**Files:**
- Create: `app/admin/staff/page.tsx`
- Create: `app/api/admin/staff/route.ts`
- Create: `app/api/admin/staff/[id]/route.ts`

**Step 1: Staff API**

`app/api/admin/staff/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword, verifyToken } from '@/lib/auth'
import { cookies } from 'next/headers'

async function requireAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  const staff = token ? await verifyToken(token) : null
  if (!staff?.isAdmin) return null
  return staff
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await pool.query('SELECT id, name, email, is_admin, created_at FROM staff ORDER BY created_at')
  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, email, password, isAdmin } = await req.json()
  const hashed = await hashPassword(password)

  const result = await pool.query(
    `INSERT INTO staff (name, email, hashed_password, is_admin) VALUES ($1, $2, $3, $4) RETURNING id, name, email, is_admin`,
    [name, email, hashed, isAdmin || false]
  )

  return NextResponse.json(result.rows[0], { status: 201 })
}
```

**Step 2: Delete staff member**

`app/api/admin/staff/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  const staff = token ? await verifyToken(token) : null
  if (!staff?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await pool.query('DELETE FROM staff WHERE id = $1', [params.id])
  return new NextResponse(null, { status: 204 })
}
```

**Step 3: Admin staff page**

`app/admin/staff/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'

interface StaffMember {
  id: number
  name: string
  email: string
  is_admin: boolean
}

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/admin/staff').then((r) => r.json()).then(setStaff)
  }, [])

  async function addStaff(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, isAdmin }),
    })
    const newMember = await res.json()
    setStaff([...staff, newMember])
    setName(''); setEmail(''); setPassword(''); setIsAdmin(false)
  }

  async function removeStaff(id: number) {
    if (!confirm('Remove this staff member?')) return
    await fetch(`/api/admin/staff/${id}`, { method: 'DELETE' })
    setStaff(staff.filter((s) => s.id !== id))
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Staff accounts</h1>

      <ul className="space-y-2 mb-8">
        {staff.map((s) => (
          <li key={s.id} className="flex justify-between items-center border rounded px-3 py-2">
            <div>
              <span className="font-medium">{s.name}</span>
              <span className="text-sm text-gray-500 ml-2">{s.email}</span>
              {s.is_admin && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1 rounded">admin</span>}
            </div>
            <button onClick={() => removeStaff(s.id)} className="text-red-500 text-sm hover:underline">
              Remove
            </button>
          </li>
        ))}
      </ul>

      <h2 className="text-lg font-semibold mb-3">Add staff member</h2>
      <form onSubmit={addStaff} className="space-y-3">
        <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-3 py-2" required />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded px-3 py-2" required />
        <input type="password" placeholder="Temporary password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded px-3 py-2" required />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          Admin access
        </label>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Add staff member
        </button>
      </form>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add app/admin/ app/api/admin/
git commit -m "feat: add admin staff management"
```

---

### Task 12: Nav + final wiring

**Files:**
- Create: `app/components/Nav.tsx`
- Modify: `app/layout.tsx`

**Step 1: Create nav component**

`app/components/Nav.tsx`:
```typescript
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Nav() {
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <nav className="border-b bg-white px-4 py-3 flex justify-between items-center">
      <div className="flex gap-6">
        <Link href="/conversations" className="font-semibold">Alma Care</Link>
        <Link href="/conversations" className="text-sm text-gray-600 hover:text-gray-900">Conversations</Link>
        <Link href="/admin/staff" className="text-sm text-gray-600 hover:text-gray-900">Staff</Link>
      </div>
      <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900">Sign out</button>
    </nav>
  )
}
```

**Step 2: Update root layout**

`app/layout.tsx` — wrap children with Nav (but not on the login page):
```typescript
import type { Metadata } from 'next'
import './globals.css'
import Nav from './components/Nav'
import { headers } from 'next/headers'

export const metadata: Metadata = {
  title: 'Alma Care',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || ''
  const showNav = !pathname.startsWith('/login')

  return (
    <html lang="en">
      <body>
        {showNav && <Nav />}
        {children}
      </body>
    </html>
  )
}
```

Note: For the pathname trick to work properly in Next.js App Router, a simpler approach is to create a separate layout for authenticated routes:
- Move conversations + admin pages under `app/(app)/` with a layout that includes Nav
- Keep login at `app/login/`

Restructure:
```
app/
  (app)/
    layout.tsx  ← includes Nav
    conversations/
    admin/
  login/
    page.tsx
```

**Step 3: Test full flow end to end**

1. Log in
2. Create a conversation with 2 real phone numbers
3. Verify SMS messages arrive on both phones
4. Open conversation detail, verify participants and message history show
5. Add a third participant, remove one
6. Archive the conversation

**Step 4: Commit**

```bash
git add app/components/ app/layout.tsx app/\(app\)/
git commit -m "feat: add nav and authenticated layout"
```

---

### Task 13: Refresh button + @alma tagging

#### Part A: Refresh button

**Files:**
- Modify: `app/conversations/[sid]/page.tsx`

Convert the page to track a `refreshedAt` timestamp in state. Add a "Refresh" button that re-fetches `/api/conversations/[sid]` and updates messages. Show "Last refreshed at [time]" next to the button.

**Commit:**
```bash
git add app/conversations/[sid]/page.tsx
git commit -m "feat: add refresh button to conversation detail page"
```

---

#### Part B: @alma tagging — schema

**Files:**
- Modify: `lib/schema.sql`

Add to schema:
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

Run migration:
```bash
npm run migrate
```

**Commit:**
```bash
git add lib/schema.sql
git commit -m "feat: add flagged_messages table and phone_number to staff"
```

---

#### Part C: @alma tagging — webhook handler

**Files:**
- Create: `app/api/webhooks/twilio/route.ts`

Install Resend:
```bash
npm install resend
```

Add to `.env.local`:
```
RESEND_API_KEY=<from resend.com>
```

`app/api/webhooks/twilio/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import twilio from '@/lib/twilio'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const body = await req.formData()
  const conversationSid = body.get('ConversationSid') as string
  const messageSid = body.get('MessageSid') as string
  const author = body.get('Author') as string
  const messageBody = body.get('Body') as string

  if (!messageBody?.toLowerCase().includes('@alma')) {
    return new NextResponse(null, { status: 204 })
  }

  // Store flag
  await pool.query(
    `INSERT INTO flagged_messages (twilio_conversation_sid, message_sid, author, body)
     VALUES ($1, $2, $3, $4) ON CONFLICT (message_sid) DO NOTHING`,
    [conversationSid, messageSid, author, messageBody]
  )

  // Get conversation name and all staff
  const [convResult, staffResult] = await Promise.all([
    pool.query('SELECT friendly_name FROM conversations WHERE twilio_conversation_sid = $1', [conversationSid]),
    pool.query('SELECT email, phone_number FROM staff'),
  ])

  const conversationName = convResult.rows[0]?.friendly_name || conversationSid
  const staff = staffResult.rows
  const snippet = `"${messageBody.slice(0, 100)}"`

  // Email all staff
  const emails = staff.map((s: { email: string }) => s.email)
  await resend.emails.send({
    from: 'Alma Care <notifications@yourdomain.com>',
    to: emails,
    subject: `@alma mention in ${conversationName}`,
    text: `${author} wrote in ${conversationName}:\n\n${snippet}`,
  })

  // SMS all staff with phone numbers
  const phones = staff
    .map((s: { phone_number: string | null }) => s.phone_number)
    .filter(Boolean) as string[]

  await Promise.all(
    phones.map((phone) =>
      twilio.messages.create({
        to: phone,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: `@alma mention in ${conversationName} from ${author}: ${snippet}`,
      })
    )
  )

  return new NextResponse(null, { status: 204 })
}
```

Configure in Twilio console: Conversations → your Service → Webhooks → set Post-Event URL to `https://yourdomain.com/api/webhooks/twilio`, enable `onMessageAdded`.

**Commit:**
```bash
git add app/api/webhooks/twilio/route.ts package.json
git commit -m "feat: add Twilio webhook handler for @alma tagging"
```

---

#### Part D: @alma tagging — dashboard highlight

**Files:**
- Modify: `app/api/conversations/[sid]/route.ts`
- Modify: `app/conversations/[sid]/page.tsx`

Add to the GET handler in `app/api/conversations/[sid]/route.ts`:
```typescript
import pool from '@/lib/db'

// inside GET, after fetching participants and messages:
const flaggedResult = await pool.query(
  'SELECT message_sid FROM flagged_messages WHERE twilio_conversation_sid = $1',
  [sid]
)
const flaggedSids = new Set(flaggedResult.rows.map((r: { message_sid: string }) => r.message_sid))

return NextResponse.json({
  participants: participantsResult,
  messages: messagesResult,
  flaggedSids: [...flaggedSids],
})
```

In the message list UI, check if `flaggedSids` includes the message SID and apply a yellow background + "@alma" badge.

Also add `phone_number` field to the staff form in `app/admin/staff/page.tsx` and include it in the staff insert in `app/api/admin/staff/route.ts`.

**Commit:**
```bash
git add app/api/conversations/[sid]/route.ts app/conversations/[sid]/page.tsx app/admin/staff/page.tsx app/api/admin/staff/route.ts
git commit -m "feat: highlight @alma-tagged messages in dashboard"
```

---

### Task 14: Deploy to Railway

**Step 1: Create Railway project**

1. Go to railway.app, create new project
2. Connect GitHub repo (or use Railway CLI: `npm install -g @railway/cli && railway login && railway init`)

**Step 2: Add environment variables in Railway**

In Railway dashboard, add all variables from `.env.local`:
- `DATABASE_URL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_PHONE_NUMBER`
- `JWT_SECRET`
- `RESEND_API_KEY`

**Step 3: Deploy**

```bash
railway up
```

Or push to main branch if auto-deploy is configured.

**Step 4: Run migration on production**

```bash
railway run npm run migrate
railway run npm run seed
```

**Step 5: Verify**

Open the Railway-provided URL, log in, create a test conversation.

---

## Environment Variables Reference

```
DATABASE_URL=             # Neon PostgreSQL connection string
TWILIO_ACCOUNT_SID=       # From Twilio console
TWILIO_AUTH_TOKEN=        # From Twilio console
RESEND_API_KEY=           # From resend.com
TWILIO_PHONE_NUMBER=      # Your Twilio number in E.164 format e.g. +15551234567
JWT_SECRET=               # Random 32-byte base64 string
```
