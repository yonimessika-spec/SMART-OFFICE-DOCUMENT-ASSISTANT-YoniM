# Smart Office Document Assistant — Part 2: Application Layer

A React + Vite client and a thin Express proxy server sitting in front of an n8n backend that ingests office documents (PDF/DOCX/TXT), extracts structured data with AI, logs them to Google Sheets, and routes urgent items to email/Telegram/Calendar.

Part 1 (the original n8n automation) is documented separately; this README covers the Part 2 application layer built on top of it.

## Features

| # | Feature | Notes |
|---|---|---|
| F1 | **Upload** | File picker + drag-and-drop; only PDF/DOCX/TXT; oversized files rejected in the browser before any request |
| F2 | **Processing state** | Unmistakable in-progress state, Send disabled for the duration, safe up to ~90 s |
| F3 | **Result view** | All seven extracted fields + file link + coloured urgency badge (label always shown, never colour-only); `"Not found"` / `"No action found"` rendered as literal text |
| F4 | **Dashboard** | Every document from the backend, newest first |
| F5 | **Search & filters** | Free-text over file name / sender / summary; combinable filters for urgency, type, department, status; clear "no results" state |
| F6 | **Detail view + review** | Every field; mark Reviewed / flag Needs Review with an optional note (≤200 chars); local state updates on success |
| F7 | **Error & empty states** | Every failure becomes a plain-language sentence; handles timeout, 4xx/5xx, unreachable server, empty list |
| F8 | **Config / secrets** | All URLs and secrets in `server/.env` (git-ignored); `server/.env.example` committed with placeholders; `client/.env` never holds a secret |

On top of the F1–F8 baseline this build also adds **login + role-based access control**, **Hebrew / RTL support**, and **CSV export** — each described below.

## Architecture

```
┌────────────┐      ┌───────────────────┐      ┌───────────────────────────┐
│  Client    │      │  Server            │      │  n8n (webhooks)           │
│  React+Vite │ ───▶ │  Express proxy     │ ───▶ │  Upload / Get / Review    │
│  (browser) │ ◀─── │  auth check, then  │ ◀─── │  Endpoints + Process      │
│            │      │  adds N8N_SECRET    │      │  Document sub-workflow    │
└────────────┘      └───────────────────┘      └──────────┬────────────────┘
                                                            │
                                                            ▼
                                          Google Sheets · Drive · Gmail
                                          Telegram · Calendar (Part 1)
```

The client never talks to n8n directly. Every request goes through the Express proxy, which **checks the caller's session cookie and role first**, then attaches the shared `x-api-key` secret server-side and forwards to n8n. The n8n secret never reaches the browser.

**Proxy routes:**

| Route | Purpose | Who can call it |
|---|---|---|
| `GET /api/documents` | List processed documents (Dashboard + Archive) | Any signed-in user |
| `POST /api/process` | Upload a new document for AI processing | Admin, Submitter |
| `POST /api/review` | Mark a document Reviewed / Needs Review, or reopen it | Admin, Submitter |
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` | Session | anyone (login), signed-in (logout / me) |
| `GET/POST /auth/users` · `PATCH/DELETE /auth/users/:id` | User management | Admin only |

A signed-in user who calls a route their role doesn't allow gets a clear `403`, not a silent failure.

## Setup

Requires Node.js (tested with v24.18.0; Node 18+ should work).

### 1. Server

```powershell
cd "C:\Users\yonim\dev\SMART OFFICE - Part 2\server"
npm install
copy .env.example .env
```

`npm install` pulls in the n8n-proxy deps plus the auth deps (`bcryptjs`, `jsonwebtoken`, `cookie-parser`). Open the new `server/.env` and fill in:

- **n8n:** `N8N_BASE_URL` (your n8n instance's webhook base URL, no trailing slash) and `N8N_SECRET` (the shared webhook secret).
- **auth:** `JWT_SECRET` (any long random string — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`), `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` (the first Admin account — see [Authentication & roles](#authentication--roles)), and `CLIENT_ORIGIN` (`http://localhost:5173` for local dev).
- Leave `PORT` at `5055` unless you also change it in the client's `.env`. `NODE_ENV=development` is fine locally; set `production` only when the app is served over HTTPS (it marks the session cookie `Secure`).

`server/users.json` (the user store) is created automatically on first run and is git-ignored.

### 2. Client

```powershell
cd "C:\Users\yonim\dev\SMART OFFICE - Part 2\client"
npm install
copy .env.example .env
```

Each of the three backend endpoints has its own mock switch in `client/.env` — `VITE_USE_MOCK_DOCUMENTS`, `VITE_USE_MOCK_PROCESS`, `VITE_USE_MOCK_REVIEW`. They default to `true`, so the UI runs standalone with canned data and no backend. Set a flag to exactly `false` to point that one endpoint at the real n8n-backed proxy. (Auth always talks to the real proxy — there is no mock for it.)

## Running

Two terminals, both using `npm run dev`:

```powershell
# Terminal 1 — server
cd "C:\Users\yonim\dev\SMART OFFICE - Part 2\server"
npm run dev

# Terminal 2 — client
cd "C:\Users\yonim\dev\SMART OFFICE - Part 2\client"
npm run dev
```

The client opens on Vite's default local URL and shows a **login screen** — sign in as the seeded Admin. It talks to the proxy at `http://localhost:5055` (or whatever `VITE_SERVER_BASE_URL` is set to).

## Authentication & roles

The whole app is behind a login — no anonymous access to any screen.

### Roles

| Role | Read documents (Dashboard, Archive, detail, search, filters, CSV export) | Upload · review · flag · notes | Manage users |
|---|:---:|:---:|:---:|
| **Admin** | ✓ | ✓ | ✓ |
| **Submitter** | ✓ | ✓ | — |
| **Viewer** | ✓ | — | — |

- Viewers get a fully read-only app: no Upload nav, no review controls, no Reopen button; disallowed routes redirect to the Dashboard.
- CSV export is available to **every** role — it only exports data the user can already see.
- Role names are internal values; their display labels are translated like the rest of the UI.
- Enforcement is **server-side** in the proxy. Hiding a button in the client is convenience only — the proxy independently checks session + role on every request.

### How login works

- `POST /auth/login` checks the username/password (passwords are bcrypt-hashed; plaintext is never stored, logged, or returned) and issues a JWT.
- The JWT is set in an **httpOnly, SameSite=Lax cookie** (`Secure` when `NODE_ENV=production`). It is never in the response body and never in `localStorage`.
- Sessions last **8 hours**. An expired or invalid token returns `401`, clears the cookie, and the client drops back to the login screen.
- `POST /auth/logout` clears the cookie.
- On every request the proxy verifies the token, then re-reads the user's role from the store — so when an Admin changes someone's role it takes effect on that user's **next request**, with no forced logout.

### The initial Admin

On first run, if the user store is empty, exactly one Admin is created from `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` (hashed on creation). Once any user exists these env vars are ignored. If the store is empty **and** the seed vars are missing, the server refuses to start (there would be no way in).

To reset the Admin password from env, delete `server/users.json` and restart.

### Managing users

Admins get a **Users** screen: list all users, add a user (username + temporary password + role), remove a user, and switch a user between Submitter and Viewer. New passwords are hashed on the way in. Guard rails, all explicit: you can't change or delete your own account, you can't remove the last Admin, and Admin membership can't be granted or changed from the UI (only via the seed or a direct `server/users.json` edit).

### Storage

The proxy keeps its own small user store — `server/users.json`, a git-ignored file of usernames + bcrypt hashes, written atomically. It is deliberately separate from n8n's Google Sheets document store (the proxy has no Google credentials — n8n owns that integration). This assumes a single proxy instance; the JSON store is not safe for multiple concurrent writers.

## Documents: Dashboard, Archive & Reopen

A document's `status` decides where it lives:

- **Processed** — ingested, not yet looked at → Dashboard.
- **Needs Review** — looked at, still needs action → Dashboard, sorted to the top with an amber treatment.
- **Reviewed** — handled → Archive only.

From the detail view you mark a document **Reviewed** or flag it **Needs Review** (with an optional note). From the Archive, **Reopen** (type-to-confirm) clears the review and sends the document back to the Dashboard as unreviewed. The Dashboard's status filter defaults to the active-work set (Needs Review + Processed) and can widen to all or narrow to one.

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

## n8n workflows

Exported workflow JSON, credentials removed (see `/workflows`):

- `Project Part 1 - Document Assistant.json` — Part 1: Drive-trigger main automation
- `Project Part 1 - Document Assistant - Daily Email Summary.json` — Part 1: scheduled summary
- `Project Part 2 - Document Assistant - Upload Endpoint.json` — Workflow A (`POST /process-document`)
- `Project Part 2 - Document Assistant - Get Documents.json` — Workflow B (`GET /documents`)
- `Project Part 2 - Document Assistant - Review Endpoint.json` — Workflow C (`POST /review`)
- `Project Part 2 - Document Assistant - Process Document.json` — shared sub-workflow called by Workflow A and Part 1

Editing these files does **not** change the live n8n instance — they are reference exports. The Hebrew-extraction findings and the exact n8n changes applied are in `n8n-hebrew-fixes.md`, `n8n-hebrew-retest.md`, and `n8n-followup-fixes.md`.

## Known limitations

- **`received_at` is not an ISO datetime.** CONTRACT.md's example shows ISO format, but this implementation stores Google Sheets' own locale-formatted string instead and treats it as an opaque display value on the client — it is never parsed with `new Date()`. This is a deliberate, documented deviation from the example, not a bug.
- **Auth is intentionally minimal.** No password-reset or "forgot password" flow — an Admin sets a new user's temporary password. No self-registration; accounts exist only by Admin action or the seed. Fixed 8-hour session, no "remember me". No rate-limiting or lockout on repeated failed logins.
- **Single proxy instance assumed.** The user store is a local JSON file, not safe for multiple proxy processes writing at once.
- Single shared Header Auth secret across all three n8n webhooks, rather than per-endpoint credentials.
- No background polling — the client reflects n8n's state only on page load / refresh, not live.
- Still out of scope for this submission: background job polling, an analytics view, multi-file upload, public deployment, and a daily-summary *screen* (the daily email summary runs as a Part 1 n8n workflow, not in the app).
