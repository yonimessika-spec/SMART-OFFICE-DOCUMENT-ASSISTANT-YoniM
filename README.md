# Smart Office Document Assistant — Part 2: Application Layer

A React + Vite client and a thin Express proxy server sitting in front of an n8n backend that ingests office documents (PDF/DOCX/TXT), extracts structured data with AI, logs them to Google Sheets, and routes urgent items to email/Telegram/Calendar.

Part 1 (the original n8n automation) is documented separately; this README covers the Part 2 application layer built on top of it.

## Architecture

```
┌────────────┐      ┌──────────────────┐      ┌───────────────────────────┐
│  Client     │      │  Server           │      │  n8n (webhooks)           │
│  React+Vite │ ───▶ │  Express proxy    │ ───▶ │  Upload / Get / Review    │
│  (browser)  │ ◀─── │  (keeps N8N_SECRET│ ◀─── │  Endpoints + Process      │
│             │      │   out of browser) │      │  Document sub-workflow   │
└────────────┘      └──────────────────┘      └──────────┬────────────────┘
                                                            │
                                                            ▼
                                          Google Sheets · Drive · Gmail
                                          Telegram · Calendar (Part 1)
```

The client never talks to n8n directly. Every request goes through the Express proxy, which attaches the shared `x-api-key` secret server-side.

**Endpoints (client → server → n8n):**

| Route | Purpose |
|---|---|
| `GET /documents` | List processed documents (Dashboard + Archive) |
| `POST /process-document` | Upload a new document for AI processing |
| `POST /review` | Mark a document Reviewed / Needs Review, or reopen it |

## Setup

Requires Node.js (tested with v24.18.0; Node 18+ should work).

### 1. Server

```powershell
cd "C:\Users\yonim\dev\SMART OFFICE - Part 2\server"
npm install
copy .env.example .env
```

Open the new `server/.env` and fill in the real values — in particular `N8N_BASE_URL` (your n8n instance's webhook base URL, no trailing slash) and `N8N_SECRET` (the shared webhook secret). Leave `PORT` at `5055` unless you also change it in the client's `.env`.

### 2. Client

```powershell
cd "C:\Users\yonim\dev\SMART OFFICE - Part 2\client"
npm install
copy .env.example .env
```

By default all three endpoints run in **mock mode** (`VITE_USE_MOCK_DOCUMENTS/_PROCESS/_REVIEW=true`) so the UI works standalone with no backend. To use the real n8n-backed endpoints, set the relevant flag(s) to exactly `false` in `client/.env`.

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

The client opens on Vite's default local URL; it talks to the proxy at `http://localhost:5055` (or whatever `VITE_SERVER_BASE_URL` is set to).

## n8n workflows

Exported workflow JSON (credentials removed — see `/workflows`):

- `Document Assistant.json` — Part 1: Drive-trigger main automation
- `Document Assistant - Daily Email Summary.json` — Part 1: scheduled summary
- `Document Assistant - Upload Endpoint.json` — Workflow A (`POST /process-document`)
- `Document Assistant - Get Documents.json` — Workflow B (`GET /documents`)
- `Document Assistant - Review Endpoint.json` — Workflow C (`POST /review`)
- `Document Assistant - Process Document.json` — shared sub-workflow called by Workflow A and Part 1

## Known limitations

- **`received_at` is not an ISO datetime.** CONTRACT.md's example shows ISO format, but this implementation stores Google Sheets' own locale-formatted string instead and treats it as an opaque display value on the client — it is never parsed with `new Date()`. This is a deliberate, documented deviation from the example, not a bug.
- No authentication/roles layer — anyone with access to the client can process and review documents. Acceptable for a single-office internal tool at this scale, not for a multi-tenant or public deployment.
- Single shared Header Auth secret across all three n8n webhooks, rather than per-endpoint credentials.
- No background polling — the client reflects n8n's state only on page load/refresh, not live.
- Optional extensions from the brief (login/roles, background job polling, analytics view, multi-file upload, CSV export, RTL/Hebrew support, public deployment, daily-summary screen) are out of scope for this submission.
