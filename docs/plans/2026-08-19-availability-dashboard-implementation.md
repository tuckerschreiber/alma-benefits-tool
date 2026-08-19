# Availability Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A password-gated web dashboard where the Alma care ops team can see the availability agent working (status + reply roster), fix Needs Review replies, pause/resume members, and trigger a send — without touching Airtable or GitHub.

**Architecture:** Standalone Next.js (App Router, plain JavaScript) app in a NEW repo at `/Users/tucker.schreiber/Documents/alma-availability-dashboard`, deployed to Vercel via CLI. All Airtable and GitHub calls happen in API route handlers; secrets never reach the browser. Reads/writes only the agent's two tables (Care Team, Sync Log) in the test base `app9aTJ18nu0QQYSt`. Design doc: `docs/plans/2026-08-19-availability-dashboard-design.md` (alma repo).

**Tech Stack:** Next.js 15 (App Router, JS, no Tailwind — plain CSS), `node:test` for unit tests, Airtable REST API, GitHub REST API (`workflow_dispatch`), Vercel.

---

## Verified facts (do not re-derive)

- Agent repo local clone: `/Users/tucker.schreiber/Documents/alma-availability-agent`. GitHub: `tuckerschreiber/alma-availability-agent`. Workflows `send.yml` (name `sunday-send`, has `workflow_dispatch` with boolean input `force`, default true) and `poll.yml` both exist — **no agent-repo changes are needed**.
- Sync Log (`tblmWSpkapuDaLORS`) fields: `Email`, `Type` (Send | Reply Applied | Exception), `Status` (OK | Needs Review), `Gmail Message ID`, `Gmail Thread ID`, `Raw Body`, `Parsed JSON`, `Detail`, `Created` (createdTime). The agent already stores `Raw Body` on every Needs Review row and `Parsed JSON` when a parse ran (unknown-sender and quoted-only rows have no `Parsed JSON` — the review form just starts empty).
- `Status` needs two new options, `Resolved` and `Dismissed` — created automatically by writing with `typecast: true` (Task 15 verifies).
- Care Team (`tbl7guco5f3gguiJA`): `Status` choices are Active | Inactive | Pause | Terminated | Ready for Review. **The agent sends to Active AND Ready for Review** (`src/airtable.js:36` in the agent repo). `Full Name` is a formula field.
- The 8 fields the agent writes (exact names, from agent `src/fields.js`):
  `Shift Preference` (select: Daytime | Overnight | Both), `Current Bandwidth` (select: Actively open to families | Limited availability but taking on families | Not taking on families — note lowercase "a" in "availability"), `Unavailable Until When` (date), `Typical Days Available` (multi: Sun–Sat), `Any Planned Big Holidays Coming Up`, `Any Upcoming Exams`, `Willingness to Travel To (Areas/Radius)`, `Other Scheduling Notes` (all text).
- `Availability Last Updated` is **lastModifiedTime in the test base — writing it errors**. In the real base it's a plain date. Controlled by env `WRITE_LAST_UPDATED` (unset/false now; revisit at cutover).
- Parser JSON keys → field names: `shift_preference`→Shift Preference, `current_bandwidth`→Current Bandwidth, `unavailable_until`→Unavailable Until When, `typical_days`→Typical Days Available, `holidays`→Any Planned Big Holidays Coming Up, `exams`→Any Upcoming Exams, `travel`→Willingness to Travel To (Areas/Radius), `notes`→Other Scheduling Notes.
- `hasRecentSend` suppression: a member is skipped if a `Type=Send, Status=OK` Sync Log row for their email is < 6 days old at send time.
- Send schedule: Sundays, crons at 16:05 and 17:05 UTC with a Sunday-in-Toronto gate; display "Sunday ~noon Toronto (16:05 UTC)".
- Test-base PAT + base ID live in the agent repo's gitignored `.env` (`AIRTABLE_API_KEY`, base `app9aTJ18nu0QQYSt`). Copy from there — never print the PAT into a transcript.
- **Design deviation (accepted):** select options are hardcoded constants mirroring the agent's `fields.js` (the agent itself hardcodes them) instead of live schema reads — the PAT is losing its `schema.*` scopes.
- No new paid services. Vercel free tier, existing Airtable, one new GitHub fine-grained token (Tucker creates it manually in Task 16).

---

### Task 1: Scaffold the repo

**Files:** Create the project at `/Users/tucker.schreiber/Documents/alma-availability-dashboard`.

**Step 1: Scaffold**

```bash
cd /Users/tucker.schreiber/Documents
npx create-next-app@latest alma-availability-dashboard --js --app --no-tailwind --no-eslint --no-src-dir --no-turbopack --import-alias "@/*" --use-npm
cd alma-availability-dashboard
```

**Step 2: Make lib files runnable by `node --test`**

In `package.json`: add `"type": "module"` at top level and `"test": "node --test \"test/**/*.test.js\""` under `scripts`. (A bare directory arg — `node --test test/` — does NOT work on Node 22.20.0 with `"type": "module"`: it runs one phantom test, fails, and exits 0. Verified. The glob form is required.)

**Step 3: Add `.env.example`** (real values go in `.env.local`, already gitignored by create-next-app)

```bash
# Shared team password for the dashboard
DASH_PASSWORD=
# Test-base PAT — copy from alma-availability-agent/.env. NEVER the real-base PAT during dev.
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=app9aTJ18nu0QQYSt
# Must equal AIRTABLE_BASE_ID or the server refuses to start (two-var cutover confirmation)
AIRTABLE_ALLOWED_BASE_ID=app9aTJ18nu0QQYSt
AIRTABLE_CARE_TEAM_TABLE=tbl7guco5f3gguiJA
AIRTABLE_SYNC_LOG_TABLE=tblmWSpkapuDaLORS
# Fine-grained PAT, alma-availability-agent repo only, Actions read+write
GITHUB_TOKEN=
GITHUB_REPO=tuckerschreiber/alma-availability-agent
# Leave unset on the test base ("Availability Last Updated" is lastModifiedTime there — unwritable).
# WRITE_LAST_UPDATED=true
```

**Step 4: Populate `.env.local`** by copying `AIRTABLE_API_KEY` from `/Users/tucker.schreiber/Documents/alma-availability-agent/.env` (read the file directly; don't echo the key), the base/table IDs above, and a dev password like `alma-dev`. Leave `GITHUB_TOKEN` blank until Task 16.

**Step 5: Verify dev server boots**

Run: `npm run dev` — expect `Ready` on localhost:3000, then stop it.

**Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js dashboard"
```

---

### Task 2: Config loader with base guard

**Files:**
- Create: `lib/env.js`
- Test: `test/env.test.js`

**Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../lib/env.js";

const GOOD = {
  DASH_PASSWORD: "pw", AIRTABLE_API_KEY: "key", AIRTABLE_BASE_ID: "appTest",
  AIRTABLE_ALLOWED_BASE_ID: "appTest", AIRTABLE_CARE_TEAM_TABLE: "tblA",
  AIRTABLE_SYNC_LOG_TABLE: "tblB", GITHUB_TOKEN: "gh", GITHUB_REPO: "o/r",
};

test("loads a complete config", () => {
  const cfg = loadConfig(GOOD);
  assert.equal(cfg.airtable.baseId, "appTest");
  assert.equal(cfg.github.repo, "o/r");
  assert.equal(cfg.writeLastUpdated, false);
});

test("throws listing missing vars", () => {
  assert.throws(() => loadConfig({ ...GOOD, DASH_PASSWORD: "" }), /DASH_PASSWORD/);
});

test("refuses a base that is not the allowed one", () => {
  assert.throws(() => loadConfig({ ...GOOD, AIRTABLE_BASE_ID: "appReal" }), /Refusing/);
});

test("WRITE_LAST_UPDATED=true flips the flag", () => {
  assert.equal(loadConfig({ ...GOOD, WRITE_LAST_UPDATED: "true" }).writeLastUpdated, true);
});
```

**Step 2: Run** `npm test` — expect FAIL (module not found).

**Step 3: Implement `lib/env.js`**

```js
const REQUIRED = [
  "DASH_PASSWORD", "AIRTABLE_API_KEY", "AIRTABLE_BASE_ID", "AIRTABLE_ALLOWED_BASE_ID",
  "AIRTABLE_CARE_TEAM_TABLE", "AIRTABLE_SYNC_LOG_TABLE",
];

// GITHUB_TOKEN/GITHUB_REPO are deliberately NOT required: they're only needed to
// dispatch a send, and Task 16 fills the token in late. Requiring them here would
// take down the status page and review queue too. /api/send calls requireGithub().

export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  // Two-var confirmation: pointing at a different base requires changing BOTH vars.
  // This is the hard-refuse guard from the agent repo — it prevents a copy-pasted
  // real-base ID from ever receiving writes during dev.
  if (env.AIRTABLE_BASE_ID !== env.AIRTABLE_ALLOWED_BASE_ID) {
    throw new Error(
      `Refusing to start: AIRTABLE_BASE_ID (${env.AIRTABLE_BASE_ID}) != AIRTABLE_ALLOWED_BASE_ID (${env.AIRTABLE_ALLOWED_BASE_ID})`,
    );
  }
  return {
    password: env.DASH_PASSWORD,
    airtable: {
      apiKey: env.AIRTABLE_API_KEY,
      baseId: env.AIRTABLE_BASE_ID,
      careTeamTable: env.AIRTABLE_CARE_TEAM_TABLE,
      syncLogTable: env.AIRTABLE_SYNC_LOG_TABLE,
    },
    github: { token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO },
    writeLastUpdated: env.WRITE_LAST_UPDATED === "true",
  };
}

// Call from any route that actually dispatches a workflow. Throws a 503-tagged
// error naming what's missing, so the UI can say "sending isn't configured"
// instead of failing with an opaque GitHub 401.
export function requireGithub(github) {
  const missing = ["token", "repo"].filter((k) => !github[k]);
  if (missing.length) {
    throw Object.assign(
      new Error(`Sending is not configured on the server: missing ${missing.map((k) => `GITHUB_${k.toUpperCase()}`).join(", ")}`),
      { status: 503 },
    );
  }
}
```

**Step 4: Run** `npm test` — expect 4 pass.

**Step 5: Commit** `git add -A && git commit -m "feat: config loader with base-isolation guard"`

---

### Task 3: Auth helpers

**Files:**
- Create: `lib/auth.js`
- Test: `test/auth.test.js`

**Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordMatches, rateLimited } from "../lib/auth.js";

test("matches only the exact password", () => {
  assert.equal(passwordMatches("secret", "secret"), true);
  assert.equal(passwordMatches("secre", "secret"), false);
  assert.equal(passwordMatches("", "secret"), false);
  assert.equal(passwordMatches("anything", ""), false);  // unset server pw never matches
  assert.equal(passwordMatches(undefined, "secret"), false);
});

test("rate limiter allows 10/minute per key then blocks, and forgets old attempts", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 10; i++) assert.equal(rateLimited("1.2.3.4", t0 + i), false);
  assert.equal(rateLimited("1.2.3.4", t0 + 20), true);
  assert.equal(rateLimited("5.6.7.8", t0 + 20), false);        // other key unaffected
  assert.equal(rateLimited("1.2.3.4", t0 + 61_000), false);     // window expired
});
```

**Step 2: Run** `npm test` — expect FAIL.

**Step 3: Implement `lib/auth.js`**

```js
import crypto from "node:crypto";

export function passwordMatches(submitted, expected) {
  const a = Buffer.from(String(submitted ?? ""));
  const b = Buffer.from(String(expected ?? ""));
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Best-effort per-instance limiter (serverless instances don't share memory —
// fine for a shared-password gate; the matcher has none at all).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const attempts = new Map();

export function rateLimited(key, now = Date.now()) {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > MAX_PER_WINDOW;
}

// For route handlers: throws a 401-tagged error unless the request carries the password.
export function requireAuth(req) {
  if (!passwordMatches(req.headers.get("x-dash-password"), process.env.DASH_PASSWORD)) {
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  }
}
```

**Step 4: Run** `npm test` — expect all pass.

**Step 5: Commit** `git add -A && git commit -m "feat: timing-safe password check + rate limiter"`

---

### Task 4: Send-schedule math

**Files:**
- Create: `lib/schedule.js`
- Test: `test/schedule.test.js`

**Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSundaySend, suppressedAtNextSend } from "../lib/schedule.js";

test("mid-week rolls to the coming Sunday 16:05 UTC", () => {
  // 2026-08-19 is a Wednesday
  const next = nextSundaySend(new Date("2026-08-19T12:00:00Z"));
  assert.equal(next.toISOString(), "2026-08-23T16:05:00.000Z");
});

test("Sunday before 16:05 UTC is today; after is next week", () => {
  assert.equal(nextSundaySend(new Date("2026-08-23T15:00:00Z")).toISOString(), "2026-08-23T16:05:00.000Z");
  assert.equal(nextSundaySend(new Date("2026-08-23T17:00:00Z")).toISOString(), "2026-08-30T16:05:00.000Z");
});

test("members sent to <6 days before next send are suppressed; dedup by email", () => {
  const next = new Date("2026-08-23T16:05:00Z");
  const rows = [
    { email: "Fresh@almacare.ca", created: "2026-08-20T10:00:00.000Z" }, // 3d before → suppressed
    { email: "fresh@almacare.ca", created: "2026-08-19T10:00:00.000Z" }, // dup, still one entry
    { email: "stale@almacare.ca", created: "2026-08-16T16:10:00.000Z" }, // ~7d before → clear
  ];
  assert.deepEqual(suppressedAtNextSend(rows, next), ["fresh@almacare.ca"]);
});
```

**Step 2: Run** `npm test` — expect FAIL.

**Step 3: Implement `lib/schedule.js`**

```js
// The agent's cron fires Sundays 16:05 and 17:05 UTC with a Sunday-in-Toronto
// gate; 16:05 is the honest "from" time to display (~noon Toronto in summer).
export function nextSundaySend(now = new Date()) {
  const c = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 5));
  c.setUTCDate(c.getUTCDate() + ((7 - c.getUTCDay()) % 7));
  if (c <= now) c.setUTCDate(c.getUTCDate() + 7);
  return c;
}

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

// rows: [{ email, created }] from Type=Send, Status=OK Sync Log rows.
// A member whose last successful send is <6 days old at send time gets skipped
// by the agent's hasRecentSend check — surface that instead of hiding it.
export function suppressedAtNextSend(rows, nextSend) {
  const cutoff = nextSend.getTime() - SIX_DAYS_MS;
  const out = new Set();
  for (const r of rows) {
    if (Date.parse(r.created) > cutoff) out.add(r.email.toLowerCase());
  }
  return [...out];
}
```

**Step 4: Run** `npm test` — expect all pass.

**Step 5: Commit** `git add -A && git commit -m "feat: next-send and suppression-window math"`

---

### Task 5: Field constants + apply-diff builder

**Files:**
- Create: `lib/options.js`, `lib/apply.js`
- Test: `test/apply.test.js`

**Step 1: Create `lib/options.js`** (mirrors agent `src/fields.js` — exact casing matters, see the `e79de4f` bandwidth bug)

```js
export const SHIFT_OPTIONS = ["Daytime", "Overnight", "Both"];
export const BANDWIDTH_OPTIONS = [
  "Actively open to families",
  "Limited availability but taking on families",
  "Not taking on families",
];
export const DAY_OPTIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const FIELD_TYPES = {
  "Shift Preference": { type: "select", options: SHIFT_OPTIONS },
  "Current Bandwidth": { type: "select", options: BANDWIDTH_OPTIONS },
  "Unavailable Until When": { type: "date" },
  "Typical Days Available": { type: "multiselect", options: DAY_OPTIONS },
  "Any Planned Big Holidays Coming Up": { type: "text" },
  "Any Upcoming Exams": { type: "text" },
  "Willingness to Travel To (Areas/Radius)": { type: "text" },
  "Other Scheduling Notes": { type: "text" },
};

// Parser output keys (agent src/parse.js) → Airtable field names, for pre-filling the review form.
export const PARSED_TO_FIELD = {
  shift_preference: "Shift Preference",
  current_bandwidth: "Current Bandwidth",
  unavailable_until: "Unavailable Until When",
  typical_days: "Typical Days Available",
  holidays: "Any Planned Big Holidays Coming Up",
  exams: "Any Upcoming Exams",
  travel: "Willingness to Travel To (Areas/Radius)",
  notes: "Other Scheduling Notes",
};
```

**Step 2: Write the failing test `test/apply.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApplyFields } from "../lib/apply.js";

test("writes only included fields, normalizing empties per type", () => {
  const { fields, errors } = buildApplyFields(
    { "Current Bandwidth": "Not taking on families", "Typical Days Available": [], "Any Upcoming Exams": "" },
    ["Current Bandwidth", "Typical Days Available", "Any Upcoming Exams"],
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(fields, {
    "Current Bandwidth": "Not taking on families",
    "Typical Days Available": [],
    "Any Upcoming Exams": "",
  });
});

test("untouched fields are absent, not blanked", () => {
  const { fields } = buildApplyFields({ "Shift Preference": "Both" }, ["Shift Preference"]);
  assert.equal("Other Scheduling Notes" in fields, false);
});

test("rejects invalid select, bad date, unknown field, and empty include", () => {
  assert.match(buildApplyFields({ "Current Bandwidth": "limited" }, ["Current Bandwidth"]).errors[0], /not a valid option/);
  assert.match(buildApplyFields({ "Unavailable Until When": "next week" }, ["Unavailable Until When"]).errors[0], /YYYY-MM-DD/);
  assert.match(buildApplyFields({ Bogus: "x" }, ["Bogus"]).errors[0], /unknown field/);
  assert.match(buildApplyFields({}, []).errors[0], /no fields/);
});

test("clearing a select writes null; clearing a date writes null", () => {
  const { fields, errors } = buildApplyFields(
    { "Shift Preference": null, "Unavailable Until When": "" },
    ["Shift Preference", "Unavailable Until When"],
  );
  assert.deepEqual(errors, []);
  assert.equal(fields["Shift Preference"], null);
  assert.equal(fields["Unavailable Until When"], null);
});
```

**Step 3: Run** `npm test` — expect FAIL.

**Step 4: Implement `lib/apply.js`** (same clear semantics as agent `fields.js`: select→null, multi→[], text→"")

```js
import { FIELD_TYPES } from "./options.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// values: { [fieldName]: rawValue } from the review form.
// include: field names the reviewer chose to write (touched or parser-filled).
export function buildApplyFields(values, include) {
  const errors = [];
  const fields = {};
  if (!include.length) errors.push("no fields selected to write");

  for (const name of include) {
    const spec = FIELD_TYPES[name];
    if (!spec) { errors.push(`unknown field: ${name}`); continue; }
    const v = values[name];

    if (spec.type === "select") {
      if (v != null && v !== "" && !spec.options.includes(v)) {
        errors.push(`${name} not a valid option: ${v}`);
      } else fields[name] = v || null;
    } else if (spec.type === "multiselect") {
      // Distinguish an explicit clear from a value we can't parse. Coercing a
      // bare string to [] would silently wipe every day the member had.
      if (v == null || v === "") { fields[name] = []; continue; }
      if (!Array.isArray(v)) { errors.push(`${name} must be a list: ${v}`); continue; }
      const bad = v.filter((d) => !spec.options.includes(d));
      if (bad.length) errors.push(`${name} contains invalid values: ${bad.join(", ")}`);
      else fields[name] = v;
    } else if (spec.type === "date") {
      if (v != null && v !== "" && !ISO_DATE.test(v)) errors.push(`${name} is not YYYY-MM-DD: ${v}`);
      else fields[name] = v || null;
    } else {
      fields[name] = v ?? "";
    }
  }
  return { fields, errors };
}
```

**Step 5: Run** `npm test` — expect all pass.

**Step 6: Commit** `git add -A && git commit -m "feat: field constants + apply-diff builder"`

---

### Task 6: Airtable client

**Files:**
- Create: `lib/airtable.js`
- Test: `test/airtable.test.js`

Port `request`/`withRetry` from agent `src/airtable.js` (same retry policy), injectable `fetchImpl` for tests.

**Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { airtableClient } from "../lib/airtable.js";

const CFG = { apiKey: "k", baseId: "appX", careTeamTable: "tblCT", syncLogTable: "tblSL" };
const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

test("listMembers pages and filters to Active/Ready for Review/Pause", async () => {
  const calls = [];
  const fetchImpl = (url) => {
    calls.push(url);
    return calls.length === 1
      ? ok({ records: [{ id: "r1" }], offset: "next" })
      : ok({ records: [{ id: "r2" }] });
  };
  const at = airtableClient(CFG, fetchImpl);
  const members = await at.listMembers();
  assert.deepEqual(members.map((r) => r.id), ["r1", "r2"]);
  assert.match(decodeURIComponent(calls[0]), /'Active'.*'Ready for Review'.*'Pause'/s);
  assert.match(calls[1], /offset=next/);
});

test("listSyncLog sorts by Created desc and passes maxRecords", async () => {
  let seen;
  const at = airtableClient(CFG, (url) => { seen = url; return ok({ records: [] }); });
  await at.listSyncLog({ max: 25 });
  assert.match(decodeURIComponent(seen), /sort\[0]\[field]=Created/);
  assert.match(decodeURIComponent(seen), /sort\[0]\[direction]=desc/);
  assert.match(seen, /maxRecords=25/);
});

test("updateSyncRow PATCHes with typecast", async () => {
  let seen;
  const at = airtableClient(CFG, (url, opts) => { seen = { url, opts }; return ok({ id: "rec1" }); });
  await at.updateSyncRow("rec1", { Status: "Resolved" });
  assert.equal(seen.opts.method, "PATCH");
  assert.equal(JSON.parse(seen.opts.body).typecast, true);
});

test("non-ok response throws with status and body", async () => {
  const at = airtableClient(CFG, () =>
    Promise.resolve({ ok: false, status: 422, text: () => Promise.resolve("bad field") }));
  await assert.rejects(at.getMember("recX"), /422.*bad field/s);
});
```

**Step 2: Run** `npm test` — expect FAIL.

**Step 3: Implement `lib/airtable.js`**

```js
const API = "https://api.airtable.com/v0";

const escapeFormulaValue = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function request(cfg, fetchImpl, method, path, body) {
  const res = await fetchImpl(`${API}/${cfg.baseId}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Airtable ${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// Same retry policy as the agent: 429/5xx/transient network, 429 waits out the penalty window.
async function withRetry(fn, tries = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      const retriable = /→ (429|5\d\d)/.test(e.message) || e.name === "TypeError" || /fetch failed/.test(e.message);
      if (i >= tries - 1 || !retriable) throw e;
      await new Promise((r) => setTimeout(r, /→ 429/.test(e.message) ? 30_000 : 1500 * (i + 1)));
    }
  }
}

export function airtableClient(cfg, fetchImpl = fetch) {
  const enc = encodeURIComponent;
  const req = (method, path, body) => withRetry(() => request(cfg, fetchImpl, method, path, body));
  return {
    // Everyone the agent emails (Active + Ready for Review) plus Paused, so the
    // roster shows paused members greyed out instead of vanishing.
    async listMembers() {
      const formula = enc(`OR({Status}='Active',{Status}='Ready for Review',{Status}='Pause')`);
      const records = [];
      let offset;
      do {
        const page = await req("GET",
          `${enc(cfg.careTeamTable)}?filterByFormula=${formula}${offset ? `&offset=${offset}` : ""}`);
        records.push(...page.records);
        offset = page.offset;
      } while (offset);
      return records;
    },

    getMember: (id) => req("GET", `${enc(cfg.careTeamTable)}/${id}`),

    // No typecast, deliberately: a bad select-option name must fail loudly rather
    // than silently create a new option (the e79de4f bandwidth-casing bug class).
    updateMember: (id, fields) =>
      req("PATCH", `${enc(cfg.careTeamTable)}/${id}`, { fields }),

    async listSyncLog({ formula, max = 100 } = {}) {
      const qs = [
        formula ? `filterByFormula=${enc(formula)}` : null,
        `maxRecords=${max}`,
        `${enc("sort[0][field]")}=Created`,
        `${enc("sort[0][direction]")}=desc`,
      ].filter(Boolean).join("&");
      const page = await req("GET", `${enc(cfg.syncLogTable)}?${qs}`);
      return page.records;
    },

    getSyncRow: (id) => req("GET", `${enc(cfg.syncLogTable)}/${id}`),

    // typecast:true auto-creates the Resolved/Dismissed Status options on first use.
    updateSyncRow: (id, fields) =>
      req("PATCH", `${enc(cfg.syncLogTable)}/${id}`, { fields, typecast: true }),
  };
}

export { escapeFormulaValue };
```

**Step 4: Run** `npm test` — expect all pass.

**Step 5: Commit** `git add -A && git commit -m "feat: Airtable client (ported from agent, injectable fetch)"`

---

### Task 7: GitHub dispatch client

**Files:**
- Create: `lib/github.js`
- Test: `test/github.test.js`

**Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchSendWorkflow } from "../lib/github.js";

test("POSTs workflow_dispatch with force input", async () => {
  let seen;
  await dispatchSendWorkflow({ token: "t", repo: "o/r" },
    (url, opts) => { seen = { url, opts }; return Promise.resolve({ status: 204 }); });
  assert.equal(seen.url, "https://api.github.com/repos/o/r/actions/workflows/send.yml/dispatches");
  assert.deepEqual(JSON.parse(seen.opts.body), { ref: "main", inputs: { force: "true" } });
});

test("non-204 throws with body", async () => {
  await assert.rejects(
    dispatchSendWorkflow({ token: "t", repo: "o/r" },
      () => Promise.resolve({ status: 401, text: () => Promise.resolve("Bad credentials") })),
    /401.*Bad credentials/s);
});
```

**Step 2: Run** `npm test` — expect FAIL.

**Step 3: Implement `lib/github.js`**

```js
// Dispatches the agent repo's sunday-send workflow. force:"true" bypasses the
// Sunday-in-Toronto gate — this IS a real send. Workflow inputs must be strings.
export async function dispatchSendWorkflow({ token, repo }, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/actions/workflows/send.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main", inputs: { force: "true" } }),
  });
  if (res.status !== 204) throw new Error(`GitHub dispatch failed: ${res.status} ${await res.text()}`);
}
```

**Step 4: Run** `npm test` — expect all pass.

**Step 5: Commit** `git add -A && git commit -m "feat: GitHub workflow_dispatch client"`

---

### Task 8: Route-handler plumbing + login route

**Files:**
- Create: `lib/handler.js`, `app/api/auth/route.js`

No unit tests here (thin glue over tested pieces); Task 15's integration pass and the manual walkthrough cover it.

**Step 1: Create `lib/handler.js`** — shared wrapper so every route gets auth + human-readable errors:

```js
import { NextResponse } from "next/server";
import { requireAuth } from "./auth.js";
import { loadConfig } from "./env.js";
import { airtableClient } from "./airtable.js";

// Wraps a route handler: auth check, config + client injection, error → JSON.
export function withAuth(fn) {
  return async (req, ctx) => {
    try {
      requireAuth(req);
      const cfg = loadConfig();
      return await fn(req, { ...ctx, cfg, airtable: airtableClient(cfg.airtable) });
    } catch (e) {
      const status = e.status ?? 500;
      // e.message is already human-readable (Airtable/GitHub errors include status + body)
      return NextResponse.json({ error: e.message }, { status });
    }
  };
}
```

**Step 2: Create `app/api/auth/route.js`**

```js
import { NextResponse } from "next/server";
import { passwordMatches, rateLimited } from "@/lib/auth";

export async function POST(req) {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (rateLimited(ip)) return NextResponse.json({ error: "Too many attempts — wait a minute." }, { status: 429 });
  const { password } = await req.json().catch(() => ({}));
  if (!passwordMatches(password, process.env.DASH_PASSWORD)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
```

**Step 3: Verify** `npm run dev`, then:

```bash
curl -s -X POST localhost:3000/api/auth -H 'content-type: application/json' -d '{"password":"wrong"}'
# → {"error":"Wrong password"}
curl -s -X POST localhost:3000/api/auth -H 'content-type: application/json' -d '{"password":"<your .env.local DASH_PASSWORD>"}'
# → {"ok":true}
```

**Step 4: Commit** `git add -A && git commit -m "feat: auth route + shared handler wrapper"`

---### Task 9: Status API

**Files:**
- Create: `app/api/status/route.js`

**Step 1: Implement**

```js
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/handler";
import { nextSundaySend, suppressedAtNextSend } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { airtable }) => {
  const [members, rows] = await Promise.all([
    airtable.listMembers(),
    airtable.listSyncLog({ max: 100 }),
  ]);

  const sends = rows.filter((r) => r.fields.Type === "Send" && r.fields.Status === "OK")
    .map((r) => ({ email: (r.fields.Email ?? "").toLowerCase(), created: r.fields.Created }));
  const lastSendAt = sends[0]?.created ?? null; // rows are Created-desc
  // "This cycle" = everything since the first send of the latest send batch
  // (sends within 10 minutes of each other are one batch).
  const batch = sends.filter((s) => lastSendAt && Date.parse(lastSendAt) - Date.parse(s.created) < 10 * 60 * 1000);
  const cycleStart = batch.length ? batch[batch.length - 1].created : null;

  const cycleRows = cycleStart ? rows.filter((r) => r.fields.Created >= cycleStart) : [];
  const next = nextSundaySend();

  const roster = members.map((m) => {
    const email = (m.fields.Email ?? "").toLowerCase();
    const sent = batch.some((s) => s.email === email);
    const applied = cycleRows.find((r) => r.fields.Type === "Reply Applied" && (r.fields.Email ?? "").toLowerCase() === email);
    const exception = cycleRows.find((r) => r.fields.Type === "Exception" && r.fields.Status === "Needs Review" && (r.fields.Email ?? "").toLowerCase() === email);
    return {
      id: m.id,
      name: m.fields["Full Name"] ?? email,
      email,
      status: m.fields.Status,
      sent,
      replied: Boolean(applied),
      needsReview: Boolean(exception),
      changes: applied?.fields.Detail ?? null,
    };
  });

  return NextResponse.json({
    lastSend: lastSendAt ? { at: cycleStart, count: batch.length } : null,
    nextSend: { at: next.toISOString(), suppressed: suppressedAtNextSend(sends, next) },
    counts: {
      replies: cycleRows.filter((r) => r.fields.Type === "Reply Applied").length,
      needsReview: rows.filter((r) => r.fields.Status === "Needs Review").length, // all-time open, not just cycle
    },
    roster,
    feed: rows.slice(0, 50).map((r) => ({
      id: r.id, type: r.fields.Type, status: r.fields.Status,
      email: r.fields.Email, detail: r.fields.Detail, created: r.fields.Created,
    })),
  });
});
```

**Step 2: Verify** with dev server running:

```bash
curl -s localhost:3000/api/status -H "x-dash-password: <pw>" | head -c 600
```

Expect JSON with `lastSend` (there are real Send rows from 2026-08-16), a 6-member roster, and a feed. Also confirm a wrong password returns `{"error":"unauthorized"}`.

**Step 3: Commit** `git add -A && git commit -m "feat: status API (last/next send, roster, feed)"`

---

### Task 10: Review APIs (list / apply / dismiss)

**Files:**
- Create: `app/api/review/route.js`, `app/api/review/apply/route.js`, `app/api/review/dismiss/route.js`

**Step 1: `app/api/review/route.js`**

```js
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/handler";
import { PARSED_TO_FIELD, FIELD_TYPES } from "@/lib/options";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { airtable }) => {
  const [rows, members] = await Promise.all([
    airtable.listSyncLog({ formula: `{Status}='Needs Review'`, max: 100 }),
    airtable.listMembers(),
  ]);
  const items = rows.reverse().map((r) => { // oldest first
    let parsed = null;
    try { parsed = r.fields["Parsed JSON"] ? JSON.parse(r.fields["Parsed JSON"]) : null; } catch {}
    const prefill = {};
    if (parsed) for (const [k, f] of Object.entries(PARSED_TO_FIELD)) {
      if (parsed[k] != null) prefill[f] = parsed[k];
    }
    const member = members.find((m) => (m.fields.Email ?? "").toLowerCase() === (r.fields.Email ?? "").toLowerCase());
    return {
      id: r.id, email: r.fields.Email, created: r.fields.Created,
      rawBody: r.fields["Raw Body"] ?? "", detail: r.fields.Detail ?? "",
      prefill,
      member: member ? {
        id: member.id, name: member.fields["Full Name"],
        current: Object.fromEntries(Object.keys(FIELD_TYPES).map((f) => [f, member.fields[f] ?? null])),
        lastUpdated: member.fields["Availability Last Updated"] ?? null,
      } : null,
    };
  });
  return NextResponse.json({
    items,
    members: members.map((m) => ({ id: m.id, name: m.fields["Full Name"], email: m.fields.Email })),
  });
});
```

**Step 2: `app/api/review/apply/route.js`**

```js
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/handler";
import { buildApplyFields } from "@/lib/apply";

export const POST = withAuth(async (req, { airtable, cfg }) => {
  const { syncRowId, memberId, values, include, expectedLastUpdated, force, initials } = await req.json();
  if (!syncRowId || !memberId) return NextResponse.json({ error: "syncRowId and memberId are required" }, { status: 400 });

  const { fields, errors } = buildApplyFields(values ?? {}, include ?? []);
  if (errors.length) return NextResponse.json({ error: errors.join("; ") }, { status: 400 });

  // Stale check: if a fresher reply landed since the reviewer opened the item,
  // warn instead of silently overwriting (later-reply-wins).
  const member = await airtable.getMember(memberId);
  const current = member.fields["Availability Last Updated"] ?? null;
  if (!force && expectedLastUpdated !== undefined && current !== expectedLastUpdated) {
    return NextResponse.json(
      { error: "This member's availability changed since you opened this item — a newer reply may already be applied.", stale: true, currentLastUpdated: current },
      { status: 409 },
    );
  }

  if (cfg.writeLastUpdated) fields["Availability Last Updated"] = new Date().toISOString().slice(0, 10);
  await airtable.updateMember(memberId, fields);

  const row = await airtable.getSyncRow(syncRowId);
  const changes = Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
  await airtable.updateSyncRow(syncRowId, {
    Status: "Resolved",
    Detail: `${row.fields.Detail ?? ""}\n--- Resolved via dashboard by ${initials || "?"} on ${new Date().toISOString().slice(0, 10)}: applied to ${member.fields["Full Name"] ?? memberId} (${changes})`,
  });
  return NextResponse.json({ ok: true });
});
```

**Step 3: `app/api/review/dismiss/route.js`**

```js
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/handler";

export const POST = withAuth(async (req, { airtable }) => {
  const { syncRowId, initials } = await req.json();
  if (!syncRowId) return NextResponse.json({ error: "syncRowId is required" }, { status: 400 });
  const row = await airtable.getSyncRow(syncRowId);
  await airtable.updateSyncRow(syncRowId, {
    Status: "Dismissed",
    Detail: `${row.fields.Detail ?? ""}\n--- Dismissed via dashboard by ${initials || "?"} on ${new Date().toISOString().slice(0, 10)}`,
  });
  return NextResponse.json({ ok: true });
});
```

**Step 4: Verify** `curl -s localhost:3000/api/review -H "x-dash-password: <pw>"` — expect `items` (possibly empty) + 6 `members`. Apply/dismiss get exercised end-to-end in Task 15.

**Step 5: Commit** `git add -A && git commit -m "feat: review queue APIs (list, apply with stale check, dismiss)"`

---

### Task 11: Members + send APIs

**Files:**
- Create: `app/api/members/route.js`, `app/api/members/status/route.js`, `app/api/send/route.js`

**Step 1: `app/api/members/route.js`**

```js
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/handler";
import { FIELD_TYPES } from "@/lib/options";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { airtable }) => {
  const members = await airtable.listMembers();
  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      name: m.fields["Full Name"],
      email: m.fields.Email,
      status: m.fields.Status,
      lastUpdated: m.fields["Availability Last Updated"] ?? null,
      availability: Object.fromEntries(Object.keys(FIELD_TYPES).map((f) => [f, m.fields[f] ?? null])),
    })),
  });
});
```

**Step 2: `app/api/members/status/route.js`** — only Active↔Pause; Ready for Review is managed in Airtable so we never destroy that status:

```js
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/handler";

export const POST = withAuth(async (req, { airtable }) => {
  const { memberId, status } = await req.json();
  if (!memberId || !["Active", "Pause"].includes(status)) {
    return NextResponse.json({ error: "status must be Active or Pause" }, { status: 400 });
  }
  const member = await airtable.getMember(memberId);
  if (!["Active", "Pause"].includes(member.fields.Status)) {
    return NextResponse.json({ error: `${member.fields["Full Name"]} is '${member.fields.Status}' — manage that status in Airtable.` }, { status: 400 });
  }
  await airtable.updateMember(memberId, { Status: status });
  return NextResponse.json({ ok: true });
});
```

**Step 3: `app/api/send/route.js`** — GET = preflight (who gets it, who's suppressed), POST = dispatch:

```js
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/handler";
import { dispatchSendWorkflow } from "@/lib/github";
import { suppressedAtNextSend, nextSundaySend } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

async function preflight(airtable) {
  const [members, rows] = await Promise.all([airtable.listMembers(), airtable.listSyncLog({ max: 100 })]);
  const sends = rows.filter((r) => r.fields.Type === "Send" && r.fields.Status === "OK")
    .map((r) => ({ email: (r.fields.Email ?? "").toLowerCase(), created: r.fields.Created }));
  const now = new Date();
  const suppressedNow = suppressedAtNextSend(sends, now); // <6d old right now → agent will skip them
  const recipients = members.filter((m) => ["Active", "Ready for Review"].includes(m.fields.Status));
  const nextAuto = nextSundaySend(now);
  return {
    willSend: recipients.filter((m) => !suppressedNow.includes((m.fields.Email ?? "").toLowerCase()))
      .map((m) => m.fields["Full Name"]),
    willSkip: recipients.filter((m) => suppressedNow.includes((m.fields.Email ?? "").toLowerCase()))
      .map((m) => m.fields["Full Name"]),
    // A send now re-arms the 6-day window; warn if that eats the next Sunday send.
    sundayImpact: nextAuto.getTime() - now.getTime() < SIX_DAYS_MS ? nextAuto.toISOString() : null,
    lastSendAt: sends[0]?.created ?? null,
  };
}

export const GET = withAuth(async (req, { airtable }) => NextResponse.json(await preflight(airtable)));

export const POST = withAuth(async (req, { airtable, cfg }) => {
  const pre = await preflight(airtable);
  await dispatchSendWorkflow(cfg.github);
  return NextResponse.json({ ok: true, dispatchedAt: new Date().toISOString(), ...pre });
});
```

**Step 4: Verify** `curl -s localhost:3000/api/send -H "x-dash-password: <pw>"` — expect `willSend` listing the 6 members (or `willSkip` if a send happened <6d ago) and a `sundayImpact` date. **Do not POST yet** — that fires real emails; Task 17 covers it deliberately.

**Step 5: Commit** `git add -A && git commit -m "feat: members + send APIs with suppression preflight"`

---

### Task 12: Frontend shell — gate, layout, API helper, styles

**Files:**
- Create: `lib/client.js`, `components/Gate.js`, `components/Nav.js`
- Modify: `app/layout.js`, `app/globals.css` (replace scaffold contents)

**Step 1: `lib/client.js`**

```js
export async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "content-type": "application/json",
      "x-dash-password": sessionStorage.getItem("dashpw") ?? "",
      ...opts.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? res.statusText), { status: res.status, data });
  return data;
}
```

**Step 2: `components/Gate.js`**

```jsx
"use client";
import { useEffect, useState } from "react";

export default function Gate({ children }) {
  const [state, setState] = useState("checking"); // checking | locked | open
  const [pw, setPw] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => { setState(sessionStorage.getItem("dashpw") ? "open" : "locked"); }, []);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) { sessionStorage.setItem("dashpw", pw); setState("open"); }
    else setError((await res.json().catch(() => ({}))).error ?? "Login failed");
  }

  if (state === "checking") return null;
  if (state === "open") return children;
  return (
    <form className="gate" onSubmit={submit}>
      <h1>Alma availability dashboard</h1>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Team password" autoFocus />
      <button type="submit">Enter</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
```

**Step 3: `components/Nav.js`** — links to `/`, `/review` (with open-count badge fetched from `/api/status`), `/members`. Use `usePathname()` to mark the active link.

**Step 4: `app/layout.js`** — wrap `{children}` in `<Gate><Nav />{children}</Gate>`, metadata title "Alma availability". Replace `app/globals.css` with a small stylesheet: system font stack, max-width 960px centered, simple table styles, `.error { color: #b42318 }`, `.badge` pill, `.paused { opacity: .5 }`, buttons with the Alma green `#3e5941` as the primary color.

**Step 5: Verify** `npm run dev` → localhost:3000 shows the password form; wrong password shows the error; right password reveals the nav. (Status page itself is Task 13 — a placeholder is fine this instant.)

**Step 6: Commit** `git add -A && git commit -m "feat: password gate, nav, API client helper"`

---

### Task 13: Status page

**Files:**
- Modify: `app/page.js` (replace scaffold)

**Step 1: Implement** — `"use client"` page that loads `/api/status` on mount into `data`, with a Refresh button and `loading`/`error` states, rendering:

**Every timestamp on this page must be formatted with `timeZone: "America/Toronto"` explicitly** (e.g. `new Date(x).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" })`). The send schedule is defined in Toronto time; a reviewer in another timezone would otherwise see the wrong day.

- **Cards row:** Last send (`new Date(lastSend.at).toLocaleString()` + `count` recipients; red "No send recorded in the last 100 log rows — check with Tucker" if `lastSend` is null and the feed is non-empty). Next send (`nextSend.at` formatted, "Sunday ~noon Toronto"; if `nextSend.suppressed.length`, an amber note "N member(s) will be skipped — emailed within the last 6 days"). Replies this cycle (`counts.replies`) and open Needs Review (`counts.needsReview`, links to `/review`).
- **Send button** with the two-step confirm, wired per Task 11's API: click → `api("/api/send")` GET → confirm dialog listing `willSend`, `willSkip`, and (if `sundayImpact`) "This also pushes the next automatic Sunday send past {date}." → on confirm `api("/api/send", { method: "POST" })` → button becomes "Send queued…" and the page polls `/api/status` every 20s for up to 5 minutes, until `lastSend.at` is newer than `dispatchedAt`; on timeout show "Dispatch sent, but no send has appeared in the log after 5 minutes — check with Tucker."
- **Roster table:** name, sent ✓/–, replied ✓/–, "needs review" badge, changes (the Detail old→new text, in a `<details>` element since it's multiline). Paused members get `className="paused"`.
- **Activity feed:** list of feed rows, each as a sentence: `Reply Applied` → "{email}'s reply applied", `Send` → "Availability email sent to {email}", `Exception` + Needs Review → "{email} → Needs Review ({detail first line})", `Exception` + OK → "Filtered: {detail}", Resolved/Dismissed shown with their status. Timestamp right-aligned.

**Step 2: Verify in browser** against the test base: the 2026-08-16 send shows as last send, roster shows 6 members with reply states, feed reads as sentences.

**Step 3: Commit** `git add -A && git commit -m "feat: status page (cards, send button, roster, feed)"`

---

### Task 14: Review + members pages

**Files:**
- Create: `app/review/page.js`, `app/members/page.js`

**Step 1: `app/review/page.js`** — `"use client"`; loads `/api/review`. Empty state: "No replies waiting for review 🎉". Item list (email, age, first line of detail) → clicking expands the two-pane view:

- Left pane: `rawBody` in a `<pre style={{whiteSpace:"pre-wrap"}}>`, plus email + timestamp + detail line.
- Right pane form: member picker (`<select>` of `members`, preselected to `item.member?.id`; required when null). One row per field in `FIELD_TYPES` (import from `@/lib/options` — it's shared plain JS): a checkbox (include in write — pre-checked iff the field is in `prefill`), the input (select / multi-checkbox row / date / textarea per type), and the member's current value beside it in muted text ("now: …"). Initials text input (3 chars, remembered in localStorage).
- Buttons: **Apply** → `api("/api/review/apply", {method:"POST", body: JSON.stringify({ syncRowId: item.id, memberId, values, include, expectedLastUpdated: item.member?.lastUpdated, initials })})`; on 409 (`err.status === 409`) show the stale warning with an "Apply anyway" button that retries with `force: true`. **Dismiss** → `/api/review/dismiss` with a confirm. Both reload the list on success; errors render inline under the buttons.

**Step 2: `app/members/page.js`** — `"use client"`; loads `/api/members`. Table: name, email, status pill, availability summary (bandwidth + typical days), last updated (+ red "expired" tag later when `Availability Valid Until` exists — leave a TODO), and a Pause/Resume button for Active/Pause members only (Ready for Review rows show "manage in Airtable" text instead). Pause confirms with: "{name} will be skipped in every send until resumed. Continue?" Button calls `/api/members/status` then reloads.

**Step 3: Verify in browser.** Members page: pause a member (use the schreibertuc@gmail.com row), confirm the pill flips and the row greys; resume. If the review queue is empty, full Apply verification happens in Task 15.

**Step 4: Commit** `git add -A && git commit -m "feat: review queue + members pages"`

---

### Task 15: Integration test against the test base

**Files:**
- Create: `scripts/integration.mjs`

A manually-run script (not in `npm test`) that exercises the full apply path against the real test base. It targets **only Tucker's own record** (`schreibertuc@gmail.com`) and creates/deletes its own Sync Log row (`Type=Exception` — never `Send`, so `hasRecentSend` is unaffected).

**Step 1: Implement `scripts/integration.mjs`**

```js
// Run: node --env-file=.env.local scripts/integration.mjs
// Exercises: needs-review row create → apply via HTTP API → member write,
// Resolved status (typecast creates the option), Detail append → cleanup.
import { loadConfig } from "../lib/env.js";
import { airtableClient } from "../lib/airtable.js";

const BASE = process.env.DASH_URL ?? "http://localhost:3000";
const cfg = loadConfig();
const at = airtableClient(cfg.airtable);
const headers = { "content-type": "application/json", "x-dash-password": cfg.password };

const members = await at.listMembers();
const me = members.find((m) => m.fields.Email === "schreibertuc@gmail.com");
if (!me) throw new Error("test member schreibertuc@gmail.com not found");
const originalNotes = me.fields["Other Scheduling Notes"] ?? "";
const originalUntil = me.fields["Unavailable Until When"] ?? null;

// 1. Seed a fake Needs Review row
const stamp = `integration-${Date.now()}`;
const seeded = await fetch(`https://api.airtable.com/v0/${cfg.airtable.baseId}/${encodeURIComponent(cfg.airtable.syncLogTable)}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${cfg.airtable.apiKey}`, "content-type": "application/json" },
  body: JSON.stringify({ records: [{ fields: {
    Type: "Exception", Status: "Needs Review", Email: "schreibertuc@gmail.com",
    "Raw Body": `Fake reply for ${stamp}`, "Parsed JSON": JSON.stringify({ notes: stamp }),
    Detail: "integration test row",
  } }] }),
}).then((r) => r.json());
const rowId = seeded.records[0].id;
console.log("seeded", rowId);

try {
  // 2. It shows up in the queue
  const queue = await fetch(`${BASE}/api/review`, { headers }).then((r) => r.json());
  const item = queue.items.find((i) => i.id === rowId);
  if (!item) throw new Error("seeded row not in review queue");
  if (item.prefill["Other Scheduling Notes"] !== stamp) throw new Error("prefill mapping broken");

  // 3. Apply writes the member + resolves the row (typecast creates 'Resolved')
  const applied = await fetch(`${BASE}/api/review/apply`, { method: "POST", headers, body: JSON.stringify({
    syncRowId: rowId, memberId: me.id,
    // Include a DATE field deliberately: updateMember no longer sends typecast,
    // so an ISO string only lands if the field's dateFormat accepts it. A faked-fetch
    // unit test cannot catch a 422 here — this is the only place it gets exercised.
    values: { "Other Scheduling Notes": stamp, "Unavailable Until When": "2026-09-30" },
    include: ["Other Scheduling Notes", "Unavailable Until When"],
    expectedLastUpdated: item.member.lastUpdated, initials: "IT",
  }) });
  if (!applied.ok) throw new Error(`apply failed: ${await applied.text()}`);

  const after = await at.getMember(me.id);
  if (after.fields["Other Scheduling Notes"] !== stamp) throw new Error("member write missing");
  if (!String(after.fields["Unavailable Until When"] ?? "").startsWith("2026-09-30")) {
    throw new Error(`date write failed: ${after.fields["Unavailable Until When"]}`);
  }
  const row = await at.getSyncRow(rowId);
  if (row.fields.Status !== "Resolved") throw new Error(`row status: ${row.fields.Status}`);
  if (!/Resolved via dashboard by IT/.test(row.fields.Detail)) throw new Error("detail append missing");

  // 4. Stale check fires on a second apply with the old timestamp
  const stale = await fetch(`${BASE}/api/review/apply`, { method: "POST", headers, body: JSON.stringify({
    syncRowId: rowId, memberId: me.id,
    values: { "Other Scheduling Notes": "x" }, include: ["Other Scheduling Notes"],
    expectedLastUpdated: item.member.lastUpdated, initials: "IT",
  }) });
  if (stale.status !== 409) throw new Error(`expected 409 stale, got ${stale.status}`);

  console.log("PASS");
} finally {
  // 5. Cleanup: restore the note, delete the seeded row
  await at.updateMember(me.id, { "Other Scheduling Notes": originalNotes, "Unavailable Until When": originalUntil });
  await fetch(`https://api.airtable.com/v0/${cfg.airtable.baseId}/${encodeURIComponent(cfg.airtable.syncLogTable)}/${rowId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${cfg.airtable.apiKey}` },
  });
  console.log("cleaned up");
}
```

A blank `GITHUB_TOKEN` is fine — `loadConfig` doesn't require GitHub credentials and this script never touches GitHub.

**Step 2: Run** with the dev server up: `node --env-file=.env.local scripts/integration.mjs` — expect `seeded recXXX`, `PASS`, `cleaned up`. The stale-check leg only passes if the test base's `Availability Last Updated` (lastModifiedTime) moved on write — it will, since Other Scheduling Notes is one of its watched fields.

**Step 3:** While it exists, also eyeball the seeded row in the browser review queue (re-run the script with a `debugger`/pause if needed — optional).

**Step 4: Commit** `git add -A && git commit -m "test: end-to-end apply/resolve integration script"`

---

### Task 16: GitHub token, repo, Vercel deploy

**Step 1: Create the GitHub repo** (agent account, not schreibertuc):

```bash
gh auth switch --user tuckerschreiber
gh repo create tuckerschreiber/alma-availability-dashboard --private --source . --push
```

**Step 2: Fine-grained token — Tucker does this in the browser** (github.com → Settings → Developer settings → Fine-grained tokens): resource owner `tuckerschreiber`, repository access **only `alma-availability-agent`**, permissions **Actions: Read and write** (accept the auto-added Metadata: read), 1-year expiry, name `alma-availability-dashboard-dispatch`. Paste it into `.env.local` as `GITHUB_TOKEN` — do not echo it into the transcript.

**Step 3: Sanity-check the token** (dry: list workflows, no dispatch):

```bash
node --env-file=.env.local -e "fetch('https://api.github.com/repos/'+process.env.GITHUB_REPO+'/actions/workflows',{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN}}).then(r=>r.json()).then(d=>console.log(d.workflows?.map(w=>w.path)))"
# expect: [ '.github/workflows/poll.yml', '.github/workflows/send.yml' ]
```

**Step 4: Vercel project + env.** From the project dir: `vercel link` (create project `alma-availability-dashboard`). Then add each var from `.env.local` to production — **use printf, not echo** (trailing-newline gotcha):

```bash
for KEY in DASH_PASSWORD AIRTABLE_API_KEY AIRTABLE_BASE_ID AIRTABLE_ALLOWED_BASE_ID AIRTABLE_CARE_TEAM_TABLE AIRTABLE_SYNC_LOG_TABLE GITHUB_TOKEN GITHUB_REPO; do
  VALUE=$(grep "^${KEY}=" .env.local | cut -d= -f2-)
  printf '%s' "$VALUE" | vercel env add "$KEY" production
done
```

Use a real team password for prod `DASH_PASSWORD` (Tucker picks it), not `alma-dev`.

**Step 5: Deploy** `vercel --prod` — expect a production URL. Open it: gate → password → status page shows live test-base data.

**Step 6: Commit** any stray changes: `git add -A && git commit -m "chore: deploy config" && git push`

---

### Task 17: Manual walkthrough (production URL, test base)

No code — a verification checklist. Do these in order against the deployed URL:

1. Wrong password → error; right password → in. New tab keeps you in (sessionStorage); new browser asks again.
2. Status page shows the latest real send cycle and 6-member roster.
3. Members: pause `schreibertuc@gmail.com` (confirm dialog states the consequence) → row greys; resume.
4. Seed a review item: run the Task 15 script with cleanup commented out (or re-add a fake row), work it in the UI: raw reply left, prefilled form right, edit a value, Apply with initials → disappears from queue, appears in the feed as Resolved. Then clean up (restore note, delete row).
   **Also click Dismiss once on a seeded row.** Task 15 exercises `Resolved` but not `Dismissed`, and that option likewise gets auto-created by `typecast` on first use — this is the only place it's verified.
5. **Live send test:** pause everyone except `schreibertuc@gmail.com` and `tucker@simpleventures.ca` (Tucker's own two addresses — no colleagues get test email). Click Send → preflight lists exactly those 2 (or shows them in `willSkip` if <6 days since 08-16 — wait it out or accept the skip note as correct behavior). Confirm → "Send queued…" → within ~5 min the button resolves and the roster shows the new cycle. Reply from one address; after the next poll (~15 min, or `gh workflow run reply-poll`) the roster shows it replied. Restore everyone to Active afterward and remember: **this re-arms the 6-day window for those 2 members** — fine, they're Tucker's addresses.
6. Confirm the browser back/refresh flows don't wedge anything, and errors (e.g. temporarily set a wrong PAT locally) render as readable messages, not blank screens.

Fix anything that fails (superpowers:systematic-debugging), then:

```bash
git tag dashboard-v1 && git push --tags
```

**Hand-off:** share the URL + password with the team. Not done in this plan (deliberate): cutover to the real base (flip `AIRTABLE_BASE_ID` + `AIRTABLE_ALLOWED_BASE_ID` + PAT in Vercel, decide `WRITE_LAST_UPDATED` per the prod field type, re-check the `Update on Availability` prod automation), and the round-2 agent features (`Availability Valid Until`, `no_changes` flag) which this UI will surface later.
