# Smart Office Document Assistant — Part 2: Application Layer

A React + Vite client and a thin Express proxy server sitting in front of an n8n backend that ingests office documents (PDF/DOCX/TXT), extracts structured data with AI, logs them to Google Sheets, and routes urgent items to email/Telegram/Calendar.

Part 1 (the original n8n automation) is documented separately; this README covers the Part 2 application layer built on top of it.

## Features

| # | Feature | Notes |
|---|---|---|
| F1 | **Upload** | File picker + drag-and-drop, one file or several at once (up to 10); only PDF/DOCX/TXT; oversized/wrong-type files rejected in the browser before any request |
| F2 | **Processing state** | Unmistakable in-progress state; a batch processes one file at a time, each safe up to ~90 s |
| F3 | **Result view** | All seven extracted fields + file link + coloured urgency badge (label always shown, never colour-only); `"Not found"` / `"No action found"` rendered as literal text. For a batch, each finished file is an expandable row showing the same detail |
| F4 | **Dashboard** | Every document from the backend, newest first |
| F5 | **Search & filters** | Free-text over file name / sender / summary; combinable filters for urgency, type, department, status; clear "no results" state |
| F6 | **Detail view + review** | Every field; mark Reviewed / flag Needs Review with an optional note (≤200 chars); flagging can also email review requests (see [Review requests](#review-requests)); local state updates on success |
| F7 | **Error & empty states** | Every failure becomes a plain-language sentence; handles timeout, 4xx/5xx, unreachable server, empty list |
| F8 | **Config / secrets** | All URLs and secrets in `server/.env` (git-ignored); `server/.env.example` committed with placeholders; `client/.env` never holds a secret |

On top of the F1–F8 baseline this build also adds **login + role-based access control** (users in Neon Postgres, invited and reset by email), **review requests** (ask people to review a flagged document by email), **Hebrew / RTL support**, **CSV export**, **multi-file upload**, and a **Daily Summary** screen, each described below.

## Architecture

```
┌────────────┐      ┌───────────────────┐      ┌───────────────────────────┐
│  Client    │      │  Server           │      │  n8n (webhooks)           │
│  React+Vite│ ───▶ │  Express proxy    │ ───▶ │  Upload / Get / Review    │
│  (Netlify) │ ◀─── │  session + role   │ ◀─── │  Endpoints, Process       │
│            │      │  check, then adds │      │  Document, Send Email     │
└────────────┘      │  N8N_SECRET       │      └──────────┬────────────────┘
                    │  (Render)         │                 │
                    └─────────┬─────────┘                 ▼
                              │               Google Sheets · Drive · Gmail
                              ▼               Telegram · Calendar (Part 1)
                     Neon Postgres
              users · password tokens ·
                    review requests
```

The client never talks to n8n directly. Every request goes through the Express proxy, which **checks the caller's session cookie and role first**, then attaches the shared `x-api-key` secret server-side and forwards to n8n. The n8n secret never reaches the browser.

Two stores, deliberately separate:

- **Documents** live in a Google Sheet, owned by n8n. The proxy has no Google credentials.
- **Users, one-time password tokens and review requests** live in **Neon Postgres**, owned by the proxy. A document's own status ("Processed", "Needs Review", "Reviewed") stays in the Sheet; the database only records who asked whom to review it.

Email (invites, password resets, review requests) is sent by the proxy calling one generic n8n webhook, **Send Email**, which holds the Gmail credential. The proxy never talks to Gmail itself.

**Proxy routes:**

| Route | Purpose | Who can call it |
|---|---|---|
| `GET /api/documents` | List processed documents (Dashboard + Archive) | Any signed-in user |
| `POST /api/process` | Upload a new document for AI processing | Admin, Submitter |
| `POST /api/review` | Mark a document Reviewed / Needs Review, or reopen it | Admin, Submitter |
| `POST /api/review-requests` | Email a review request about a document to chosen users | Admin, Submitter |
| `GET /api/review-requests?document_id=` | The requests made for one document (no email addresses) | Any signed-in user |
| `POST /api/review-requests/:id/resend` | Resend the emails that failed | Admin, Submitter |
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` | Session | anyone (login), signed-in (logout / me) |
| `POST /auth/change-password` | Change your own password | Any signed-in user |
| `GET /auth/set-password/validate` · `POST /auth/set-password` | Set a password from an emailed link | Public (the link's token is the credential) |
| `GET /auth/users/directory` | Names and roles for the review-request picker (no emails) | Admin, Submitter |
| `GET/POST /auth/users` · `PATCH/DELETE /auth/users/:id` | User management | Admin only |
| `POST /auth/users/:id/resend-invite` · `POST /auth/users/:id/reset-password` | Email a new invite or reset link | Admin only |
| `GET /health` | Liveness check (no login, does not touch the database) | anyone |

A signed-in user who calls a route their role doesn't allow gets a clear `403`, not a silent failure.

## Setup

Requires Node.js (tested with v24.18.0; the scripts use node's `--env-file-if-exists` flag, so use a recent release). You also need a free Neon database (step 1) and, for real emails, the Send Email workflow imported into n8n (step 3).

### 1. Create a free Neon database

1. Sign up at [neon.tech](https://neon.tech) (the free tier is enough) and create a project.
2. Copy the **pooled** connection string (the host contains `-pooler`). It looks like `postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require`. Treat it like a password: it goes in `.env` / Render, never in a committed file.
3. Recommended: use one Neon *branch* for local development and another for production, so test users never mix with real ones (branches are free).

You do not create any tables by hand. The server creates and updates its tables (`users`, `password_tokens`, `review_requests`, `review_request_recipients`) on every boot with idempotent migrations.

### 2. Server

```powershell
cd "C:\Users\yonim\dev\SMART OFFICE - Part 2\server"
npm install
copy .env.example .env
```

`npm install` pulls in the proxy deps, the auth deps (`bcryptjs`, `jsonwebtoken`, `cookie-parser`) and the Postgres driver (`pg`). Open the new `server/.env` and fill in the following (placeholders only here; real values stay in `.env`, which is git-ignored):

| Variable | Needed | What it is |
|---|---|---|
| `N8N_BASE_URL`, `N8N_DOCUMENTS_PATH`, `N8N_PROCESS_PATH`, `N8N_REVIEW_PATH` | required | your n8n webhook base URL (no trailing slash) and the three document webhook paths |
| `N8N_SECRET` | required | the shared webhook secret (sent as `x-api-key`) |
| `JWT_SECRET` | required | any long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Changing it signs everyone out |
| `CLIENT_ORIGIN` | required | exact browser origin of the client (`http://localhost:5173` locally). Used for CORS and as the default base of emailed links |
| `DATABASE_URL` | required | the Neon pooled connection string from step 1. If it is missing the server exits with a clear message; if it is set but unreachable the server retries several times (about 20 seconds in total), then logs an error and exits (there is no file or in-memory fallback) |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` | required on an empty database | the first Admin account (see [Seeding](#seeding)) |
| `SEED_ADMIN_EMAIL` | recommended | the Admin's real email. If missing, a placeholder is used and the server logs a repeated warning |
| `SEED_SUBMITTER_USERNAME`, `_PASSWORD`, `_EMAIL` and `SEED_VIEWER_USERNAME`, `_PASSWORD`, `_EMAIL` | optional | a Submitter and a Viewer created together with the Admin. Leave a pair blank to skip it |
| `N8N_EMAIL_PATH` | for real emails | path of the Send Email webhook, normally `/send-email`. Without it (or when `NODE_ENV` is not `production`) emails are not sent: the invite or reset link is printed in the server console instead |
| `EMAIL_MODE` | optional | `n8n` forces real sending (handy for testing from your own machine), `console` forces console-only. Not needed in production |
| `APP_BASE_URL` | optional | base URL used in emailed links; defaults to `CLIENT_ORIGIN` |
| `TRUST_PROXY_HOPS` | optional | how many proxies sit in front of the server, used to find the client IP for rate limiting. Default `2` in production (Netlify then Render), `0` otherwise |
| `PORT`, `NODE_ENV`, `REQUEST_TIMEOUT_MS` | optional | leave `PORT` at `5055` unless you also change it in the client's `.env`. `NODE_ENV=development` locally; set `production` only when the app is served over HTTPS (it marks the session cookie `Secure`) |

### 3. Import the Send Email workflow into n8n

Invites, password resets and review requests all send through one generic n8n workflow. It is a reference export in `workflows/`, with credential references only.

1. In n8n choose **Import from file** and select `workflows/Project Part 2 - Document Assistant - Send Email.json`.
2. Open the **Webhook** node and select the same Header Auth credential the other webhooks use (header `x-api-key`).
3. Open the **Send Email** (Gmail) node and select your Gmail OAuth2 credential.
4. Check the webhook path is `send-email`, then **publish** the workflow (the file imports inactive).
5. Test it from PowerShell, using an inbox you own (placeholders only):

```powershell
$h = @{ 'x-api-key' = '<N8N_SECRET>'; 'Content-Type' = 'application/json' }
$b = '{"to":"you@example.com","subject":"Send Email test","html":"<p>Hello from n8n</p>","replyTo":"someone@example.com"}'
Invoke-RestMethod -Method Post -Uri 'https://<your-n8n-host>/webhook/send-email' -Headers $h -Body $b
```

It should answer `{"status":"sent"}` and the email should arrive, from "Smart Office Document Assistant", with Reply-To set to the `replyTo` address. A bad `to` returns HTTP 400, a Gmail failure HTTP 502, a wrong key HTTP 403. Then set `N8N_EMAIL_PATH=/send-email` in the server's environment.

### 4. Client

```powershell
cd "C:\Users\yonim\dev\SMART OFFICE - Part 2\client"
npm install
copy .env.example .env
```

Each of the three document endpoints has its own mock switch in `client/.env`: `VITE_USE_MOCK_DOCUMENTS`, `VITE_USE_MOCK_PROCESS`, `VITE_USE_MOCK_REVIEW`. They default to `true`, so the UI runs standalone with canned data and no backend. Set a flag to exactly `false` to point that one endpoint at the real n8n-backed proxy. Auth, user management and review requests always talk to the real proxy; there is no mock for them (and review requests need real documents, so use `VITE_USE_MOCK_DOCUMENTS=false` to try them).

## Running

Two terminals, both using `npm run dev`:

```powershell
# Terminal 1: server
cd "C:\Users\yonim\dev\SMART OFFICE - Part 2\server"
npm run dev

# Terminal 2: client
cd "C:\Users\yonim\dev\SMART OFFICE - Part 2\client"
npm run dev
```

The client opens on Vite's default local URL and shows a **login screen**: sign in as the seeded Admin. It talks to the proxy at `http://localhost:5055` (or whatever `VITE_SERVER_BASE_URL` is set to). When you invite a user locally and `N8N_EMAIL_PATH` is not set, the "set your password" link appears in the **server terminal**, never in the browser or an API response.

## Authentication & roles

The whole app is behind a login, with one exception: the set-password page that an emailed link opens. No other screen is anonymous.

### Roles

| Role | Read documents (Dashboard, Archive, detail, search, filters, CSV export) | Upload · review · flag · notes | Ask others to review (email) | Manage users |
|---|:---:|:---:|:---:|:---:|
| **Admin** | ✓ | ✓ | ✓ | ✓ |
| **Submitter** | ✓ | ✓ | ✓ | - |
| **Viewer** | ✓ | - | - | - |

- Viewers get a fully read-only app (no Upload nav, no review controls, no Reopen button); disallowed routes redirect to the Dashboard. They can still be *asked* to look at a document (see [Review requests](#review-requests)), but they answer by email and can never mark anything Reviewed.
- CSV export is available to **every** role; it only exports data the user can already see.
- Role names are internal values; their display labels are translated like the rest of the UI.
- Enforcement is **server-side** in the proxy. Hiding a button in the client is convenience only; the proxy independently checks session + role on every request.

### How login works

- `POST /auth/login` checks the username/password (passwords are bcrypt-hashed; plaintext is never stored, logged, or returned) and issues a JWT. Unknown users, users who have not set a password yet, and wrong passwords all get the same `401` and cost the same time.
- The JWT is set in an httpOnly cookie, `SameSite=Lax` in development, `SameSite=None; Secure` in production (required for the cross-origin Netlify↔Render setup; the client also proxies API calls through Netlify redirects to keep this same-site in practice). It is never in the response body and never in `localStorage`.
- Sessions last **8 hours**. An expired or invalid token returns `401`, clears the cookie, and the client drops back to the login screen.
- `POST /auth/logout` clears the cookie.
- On every request the proxy verifies the token, then re-reads the user from the database, so when an Admin changes someone's role it takes effect on that user's **next request**, with no forced logout, and a deleted user's token stops working at once.
- **Sessions end when a password changes.** Setting a password through an invite or reset link, or changing it with *Change password*, stamps `users.password_changed_at`; any session issued earlier is rejected with the same `401` as an expired one. The person changing their password gets a fresh cookie so the tab they are using stays signed in. The cut-off is one second wide: a session issued in the very same second as the change is not rejected.
- **Rate limiting** (in memory, per server instance): sign-in is limited to 8 attempts per 10 minutes for the same IP and username, and 100 per 10 minutes per IP; the set-password endpoints to 60 per 10 minutes per IP; change-password to 8 per 10 minutes per user. A limited request gets `429` with a `Retry-After` header.

### Seeding

Environment variables create the first accounts; after that the database is the source of truth.

- **Only when the `users` table is empty**, the server creates the Admin, then the Submitter and Viewer (if configured), from the `SEED_*` variables. The passwords are bcrypt-hashed; the seeded users are Active immediately and no email is sent.
- Once any user exists the seed does not run again, so a user an Admin deletes **stays deleted** across restarts and redeploys.
- **Admin recovery:** if the table ever has no Admin at all, the env Admin is restored (or, if that username exists with another role, promoted and its password reset to the env value).
- If the table is empty **and** the Admin seed variables are missing, the server refuses to start (there would be no way in).
- A missing `SEED_*_EMAIL` never stops the boot: the account gets a placeholder address ending in `.invalid`. The server logs a warning at boot and every 15 minutes, and the Users screen shows a red banner and a flag on that row until an Admin sets a real address. Invites and resets are refused for a placeholder address. Seed passwords have no minimum length (so existing sign-ins keep working); a bad optional Submitter or Viewer seed is logged and skipped, and only the Admin seed can stop the boot.

### Managing users

Admins get a **Users** screen:

- **Add a user** with a username, an email and a role (Submitter or Viewer). There is no password field. The user is created **Pending** and receives an email with a "Set your password" link: single use, valid for **48 hours**. The email never contains a password.
- **Status:** a user is *Pending* until they set a password, then *Active*.
- **Per-user actions:** edit email (changing a pending user's email sends a fresh invite to the new address), switch between Submitter and Viewer, **Resend invite** (pending users), **Reset password** (active users; emails a reset link, and the current password keeps working until the link is used), and Remove. Issuing a new link invalidates the older unused one.
- If the email cannot be sent, the user (or the reset) still exists; the screen shows a warning with a Resend action. After a real send it also reminds you the recipient may need to check their spam folder.
- Guard rails, all explicit: you can't change your own role or delete your own account, you can't remove the last Admin, and Admin membership can't be granted or changed from the UI (it comes from the seed).

### Setting and changing passwords

- The emailed link opens `/set-password?token=...`, a public page where the person enters a new password (at least 8 characters) twice. Tokens are 32 random bytes; only a SHA-256 hash is stored, they work once, expire after 48 hours, and an unknown, expired or used link always shows the same generic message.
- There is **no public "forgot password"**: resets are started by an Admin, so there is no way to probe which usernames exist.
- Any signed-in user can use **Change password** in the header (current password, new password, confirmation).

### Storage

Users and tokens live in **Neon Postgres** (`users`, `password_tokens`), written by the proxy with the `pg` driver, so they survive Render redeploys and idle spin-downs. It is deliberately separate from n8n's Google Sheets document store (the proxy has no Google credentials; n8n owns that integration). Because state is in the database, more than one proxy instance would share users correctly; only the in-memory rate limiter is per instance.

## Documents: Dashboard, Archive & Reopen

A document's `status` decides where it lives:

- **Processed** — ingested, not yet looked at → Dashboard.
- **Needs Review** — looked at, still needs action → Dashboard, sorted to the top with an amber treatment.
- **Reviewed** — handled → Archive only.

From the detail view you mark a document **Reviewed** or flag it **Needs Review** (with an optional note). From the Archive, **Reopen** (type-to-confirm) clears the review and sends the document back to the Dashboard as unreviewed. The Dashboard's status filter defaults to the active-work set (Needs Review + Processed) and can widen to all or narrow to one.

## Review requests

"Flag as needs review" in the document detail view opens a dialog. The person flagging can ask other people to look at the document, by email, and everything is recorded on the document.

**The dialog** (opens only from the *Flag as needs review* button; Admin and Submitter only):

- A searchable multi-select **recipient picker**. Anyone with a real email address can be picked, **any role, including Viewers** (for example a manager with a Viewer account, picked only to get their attention). Each person shows a role badge; users who have not set a password yet are listed with a **Pending** badge and selecting one shows a warning that they cannot open the document yet. You cannot pick yourself, and users with a placeholder email are not offered.
- An editable **message** (up to 1000 characters, with a counter), pre-filled with a short default.
- Three actions: **Flag and send request**, **Flag without sending** (exactly the old behavior: the status changes and nothing is emailed), and **Cancel**. Buttons are guarded against double clicks.

**What happens on send:**

1. The client flags the document through the existing `POST /api/review` (status "Needs Review", stored in the Sheet as before).
2. Only after that succeeds, it calls `POST /api/review-requests`. The server fetches the document from the Sheet by id and builds the email from that, never from fields sent by the browser. The Drive file link is not included (it is private to the account that owns the file).
3. **One email per recipient**, so nobody sees anyone else's address. Wording depends on the recipient's role:
   - Admin and Submitter: subject `Review requested: <file name>`, button **Open and review**.
   - Viewer: subject `For your attention: <file name>`, button **Open document (read-only)**, plus the line "Reply to this email to send your feedback to <requester>."
   - Every email shows the requester's message, the extracted fields (type, sender, summary, requested action, deadline, urgency), a link to `<app base>/document/<id>`, and a reminder to check the spam folder. A Pending recipient's email starts with "You need to set your password first. Check your invitation email, or ask the administrator to resend it." (no invite is re-sent automatically).
   - **Reply-To is the requester's email**, so a Viewer's answer lands in the requester's inbox.
4. Every user-supplied value (message, file name, summary and the other fields, usernames) is HTML-escaped when the email is built, so no markup from a message or a document reaches the email.

**If emails fail** the document is still flagged and the request is still saved. The dialog lists who the email went to and who it failed for, with a **Resend** button that retries only the failed recipients (the same button appears in the card below). A recipient whose account has since been deleted is marked as not sent.

**The Review requests card** on the document detail view lists each request: who asked, when, the message, and every recipient with their role and a sent / failed / not sent status; deleted accounts show as "(removed)". **Every role can see this card**, including Viewers, read-only and without any email addresses.

**Viewers** cannot flag or mark Reviewed and get no new permission: their answer comes back by email reply, and the person who asked decides what to do in the app.

**Limits and guards:** at most 20 recipients and 1000 characters per request; 10 requests per 10 minutes per user; the same requester sending the same recipients for the same document twice within 10 seconds is refused. A requester whose own account has no real email address cannot send a request (replies could not reach them) until an Admin sets it.

In local development (no `N8N_EMAIL_PATH`) the emails are not sent: the server prints each recipient, subject, Reply-To and link in its console. More detail and the test results are in `review-requests.md`.

## Hebrew & RTL support

The user is in Israel and real input documents are often written in Hebrew, so both the UI and the extraction pipeline handle Hebrew.

- **Language toggle** in the header — English ⇄ Hebrew, no reload, choice persisted in `localStorage`. Built on `react-i18next`; every user-facing string lives in `client/src/locales/{en,he}.json`.
- **RTL** — when Hebrew is active the document direction flips to `rtl`. Layout uses logical properties (start/end, not left/right) so it mirrors cleanly; user-generated content (summaries, file names, senders) is `dir="auto"` so each value orients by its own script, while numbers, dates, and IDs stay LTR even inside RTL text. Radix primitives (Select, Dialog) get the direction via a provider. Hanken Grotesk (Latin) is paired with Heebo as the Hebrew fallback face.
- **Document extraction**, not just the UI — the n8n Information Extractor is prompted to read Hebrew documents and return `summary` / `requested_action` in Hebrew, keep `deadline` and the sender verbatim in the original script, and apply the same urgency rules. (Extraction runs in n8n; the testing notes and exact prompt text are in `n8n-hebrew-fixes.md`, `n8n-hebrew-retest.md`, and `n8n-followup-fixes.md`.)

Values that come straight from n8n — `document_type`, `urgency`, `department` — are shown exactly as returned and are never translated (SPEC §5).

## CSV export

The Dashboard and the Archive each have an **Export CSV** button (labelled "Export CSV" and "Export CSV — Archive" so it's clear which dataset it pulls).

- Exports exactly the rows **currently visible** — all active filters, the search term, and the current sort order — not the full dataset. Disabled when nothing is visible.
- Columns, in this order: Document ID, File Name, Document Type, Department, Urgency, Deadline, Status, Reviewed By, Review Note, Submitted By, Received At, Summary. Internal fields (`row_number`, `deadline_iso`, file link) are omitted.
- RFC 4180 escaping (quote-wrap on comma / quote / newline, double internal quotes) and a **UTF-8 BOM** prefix, without which Excel renders Hebrew fields as mojibake when the file is opened directly.
- Client-only — no server or n8n involvement. Filenames `documents-export-YYYY-MM-DD.csv` / `archive-export-YYYY-MM-DD.csv`.

`sample-documents-export.csv` at the repo root is an example of the output.

## Multi-file upload

The Upload screen takes one file or a whole batch — multi-select in the picker, or
drop several files onto the drop zone at once.

- **Up to 10 files per batch.** Selecting or dropping more rejects the whole
  selection with a message (nothing is silently kept or dropped).
- **Sequential, not parallel.** Files upload one at a time through the same
  `POST /process-document` pipeline a single file uses — the proxy and n8n are
  unchanged. The next file starts only after the current one finishes.
- **A per-file list.** Every file is a row with its own state — Queued →
  Processing → Done / Failed / Invalid. An invalid file (wrong type / too large)
  is flagged in the list immediately, never sent, and doesn't hold up the rest.
- **Per-file retry.** A failed file gets its own Retry button that re-runs only
  that file; already-succeeded rows are untouched, and one failure never cancels
  the rest of the batch.
- **Result detail is kept.** A finished row expands to the full F3 result (seven
  fields, urgency badge, file link) plus a link to the document's detail view.

A single upload is just a batch of one, so there is one code path for both. Same
role gating as before — Admin and Submitter only.

## Daily Summary

A **Daily Summary** screen, visible to every role (Admin, Submitter, Viewer —
same access as Dashboard/Archive, no new permission), mirroring what the Part 1
`Document Assistant - Daily Email Summary` n8n workflow would send if it ran
right now.

- Built to match that workflow's **actual** content, read directly from the
  exported workflow JSON rather than assumed: every document whose `Received
  At` date is today (a string comparison on the date portion, the same way the
  email's own filter node does it — never a `Date` parse), grouped only by
  **Urgency** — High → Medium → Low, in that order. An urgency section with
  zero documents today is hidden rather than shown empty.
- Each row shows the same four fields the email's table shows — **Type,
  Sender, Deadline, Department** — plus the file name as a link to the
  document's detail view (the one thing beyond the email; every other list in
  this app already links its rows the same way).
- **Deliberately does not include** a "needs review" count, a department
  breakdown, or a past-deadline flag — the real Part 1 email doesn't compute
  any of those either (it only ever groups by urgency and prints the four
  columns above), so none of them were invented here just because they sounded
  plausible.
- Entirely client-side over the existing `GET /api/documents` response — no new
  proxy route, no new n8n webhook, no `CONTRACT.md` change. Every field it
  needs was already being returned to every role.

## n8n workflows

Exported workflow JSON, credentials removed (see `/workflows`):

- `Project Part 1 - Document Assistant.json` — Part 1: Drive-trigger main automation
- `Project Part 1 - Document Assistant - Daily Email Summary.json` — Part 1: scheduled summary
- `Project Part 2 - Document Assistant - Upload Endpoint.json` — Workflow A (`POST /process-document`)
- `Project Part 2 - Document Assistant - Get Documents.json` — Workflow B (`GET /documents`)
- `Project Part 2 - Document Assistant - Review Endpoint.json` — Workflow C (`POST /review`)
- `Project Part 2 - Document Assistant - Process Document.json` — shared sub-workflow called by Workflow A and Part 1
- `Project Part 2 - Document Assistant - Send Email.json`: Workflow D (`POST /send-email`): one generic Gmail sender, called by the proxy for invites, password resets and review requests. Header-auth protected like the other webhooks; accepts `{to, subject, html, replyTo?}`, sends as "Smart Office Document Assistant" with the Reply-To you pass, and answers `200` / `400` / `502`. Set up in [Setup, step 3](#3-import-the-send-email-workflow-into-n8n)

Editing these files does **not** change the live n8n instance; they are reference exports. The Hebrew-extraction findings and the exact n8n changes applied are in `n8n-hebrew-fixes.md`, `n8n-hebrew-retest.md`, and `n8n-followup-fixes.md`.

### Workflow robustness

Real multi-file and empty-Sheet testing surfaced two node-level edge cases that
single-item happy-path testing never hits. Both were fixed directly in the n8n UI
and are live; the class of problem is an n8n node that fails (or emits nothing)
silently taking the rest of the execution chain down with it.

- **`Process Document` — Telegram error-cascade.** `Urgent Telegram Notification`
  occasionally threw "Bad request"; with no error handling it failed the whole
  execution *after* the Sheet row was already written, so a client retry produced
  a duplicate row. Fixed with **On Error → Continue** (same pattern as the
  earlier Calendar-node fix).
- **`Get Documents` — zero-row halt.** With an empty Sheet, `Get row(s) in sheet`
  emitted zero items and n8n skipped everything downstream, including
  `Respond to Webhook` — the execution still showed "Succeeded" but the client
  got an empty body and the Dashboard reported "not valid JSON". Fixed with
  **Always Output Data** (same setting already used on Workflow C's row lookup).

## Known limitations

- **`received_at` is not an ISO datetime.** CONTRACT.md's example shows ISO format, but this implementation stores Google Sheets' own locale-formatted string instead and treats it as an opaque display value on the client; it is never parsed with `new Date()`. This is a deliberate, documented deviation from the example, not a bug.
- **Auth is intentionally small.** No self-registration (accounts exist only by Admin action or the seed). No public "forgot password": an Admin starts every reset. Fixed 8-hour session, no "remember me", no refresh tokens. Admin membership can only come from the seed, not from the UI.
- **Render free-tier cold start.** After about 15 minutes idle the API spins down, and the first request can take up to about a minute. The client shows a "waking up the server" message after a few seconds. **This repository contains no keep-alive ping.** `GET /health` (no login, does not touch the database) exists so that an external pinger, for example a free uptime monitor, can call it every few minutes. If none is configured, the cold start still happens. A ping like that keeps the Render instance awake but does not keep Neon awake, so the first database query after a long quiet period can still be slightly slower.
- **Neon wake-up delay.** The free Neon database suspends when idle, so the first query after a quiet period can take a few extra seconds. Connections are pooled and retried once on a dead socket, and the server retries at boot, but a very cold start (Render and Neon both asleep) is noticeably slow.
- **The rate limiter is in memory.** It resets on restart and is per server instance. It is a speed bump against guessing, not a security boundary on its own (passwords are bcrypt-hashed, tokens are 256-bit random).
- **The client IP behind Netlify and Render is not verified.** Rate limiting assumes two proxy hops (`TRUST_PROXY_HOPS`, default 2 in production). If that is wrong, visitors may share one IP bucket (the IP-level limits are generous for that reason, and the tight limit is keyed on IP plus username), or a caller could vary a forged forwarded header to dodge the per-username limit.
- **Documents still live in a Google Sheet,** owned by n8n. The database only holds users, tokens and review requests; a document's status is the Sheet's.
- **Emails are sent from one Gmail account through n8n,** so they depend on that account's sending limits and on the Send Email workflow being published. Invites, resets and review requests can land in a recipient's **spam folder**; the emails and the Users screen remind people to check it. If sending fails, the user or request still exists and can be resent.
- **Session cut-off is one second wide.** A session issued in the same second as a password change is not rejected.
- **A deep link needs a login.** A review-request email opens `/document/<id>`; a recipient who is not signed in sees the sign-in screen first, and a Pending recipient has to set a password before they can open it.
- Review-request emails show the document as the Sheet holds it at send time; a resend uses the Sheet's current values.
- Single shared Header Auth secret across all the n8n webhooks, rather than per-endpoint credentials.
- No background polling: the client reflects n8n's state only on page load / refresh, not live.

## Live Deployment
   - App: https://document-assistant-ym.netlify.app/ (Netlify)
   - API: https://smart-office-document-assistant-yonim.onrender.com (Render; cold start up to about a minute if idle)
   - Database: Neon Postgres (free tier). Render holds its production connection string as `DATABASE_URL`.
   - Auto-deploys from `master` on every push (Netlify + Render both connected to this repo)

How the pieces connect in production:

- **Netlify** serves the client and, through `client/netlify.toml`, forwards `/api/*` and `/auth/*` to the Render URL (status 200 rewrites with `force = true`). To the browser the API is same-origin, which is what keeps the session cookie working. A final `/* -> /index.html` rule makes deep links such as `/set-password?token=...` and `/document/<id>` load the app; it is last on purpose, because Netlify applies the first matching rule.
- **Render** needs the server variables from [Setup](#2-server): the n8n settings, `JWT_SECRET`, `CLIENT_ORIGIN` (the Netlify URL), `NODE_ENV=production`, the production `DATABASE_URL`, the `SEED_*` variables (including the three `_EMAIL` ones) and `N8N_EMAIL_PATH=/send-email`. `EMAIL_MODE` is not needed: in production, emails go through n8n automatically as soon as `N8N_EMAIL_PATH` is set. Netlify needs no environment variables.
- **n8n** must have the Send Email workflow published, otherwise invites, resets and review requests are saved but not delivered.
- If `DATABASE_URL` is missing or the database is unreachable, the server exits at boot with a readable error rather than starting without users.

Two deployment problems shaped the current design (details in `PROMPTS.md`):

- **Cross-site cookies.** With the client and API on different domains, browsers blocked the session cookie. Fixed by `SameSite=None; Secure` in production, then by calling relative `/api` and `/auth` paths through the Netlify redirects so the browser sees one origin.
- **No persistent disk on the free tier.** The original `users.json` store was wiped on every redeploy and idle spin-down, which is why users now live in Neon.
