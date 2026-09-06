# Smart Office Document Assistant — Application Layer (Part 2) — Specification

## 1. Purpose
This application is the front end for the n8n automation built in Part 1. It has
no business logic of its own. It never calls an AI model, never writes to Google
Sheets, never sends email, and never decides what counts as "urgent." Its only
job: collect input from a person, call one of three n8n webhooks, and honestly
display whatever comes back.

## 2. Architecture
- **client/** — React + Vite front end. Three screens: Upload, Dashboard, DocumentDetail.
- **server/** — a thin Express proxy. Holds the n8n shared secret and the webhook
  URLs. Exposes three routes to the browser (`/api/documents`, `/api/process`,
  `/api/review`) and forwards each to the matching n8n webhook, attaching the
  `x-api-key` header server-side. The secret never reaches the browser, and this
  removes any CORS configuration on the n8n side.
- **n8n** — unchanged responsibility split from Part 1. All AI extraction, urgency
  decisions, Sheet writes, email, and file storage stay there.

## 3. The Three Endpoints (source of truth: CONTRACT.md)
| Client calls     | Server forwards to              | Method |
|-------------------|----------------------------------|--------|
| `/api/documents`  | `{N8N_BASE_URL}/documents`        | GET    |
| `/api/process`    | `{N8N_BASE_URL}/process-document` | POST   |
| `/api/review`     | `{N8N_BASE_URL}/review`           | POST   |

Full request/response JSON for each is defined in CONTRACT.md — that file is
authoritative; this table only maps client-facing routes to n8n routes.

## 4. Required Features (build in this order — M3 → M6)
1. **F4 Dashboard** — list every document from `/api/documents`, newest first.
2. **F5 Search & filters** — free-text over file_name/sender_or_company/summary;
   filters for urgency, document_type, department, status; combinable; clear
   "no results" state.
3. **F1 Upload screen** — file picker + drag-drop; only PDF/DOCX/TXT accepted;
   oversized files rejected client-side before any request is sent.
4. **F2 Processing state** — unmistakable in-progress state, Send button disabled
   for the duration of the request, safe up to ~90 seconds.
5. **F3 Result view** — all seven extracted fields + file_link + coloured urgency
   badge (label text always present, never colour-only). "Not found" /
   "No action found" shown as literal text, never hidden or replaced with a guess.
6. **F6 Detail view + review** — every field, "Mark as reviewed" with an optional
   note (≤200 chars), posts to `/api/review`, updates local state on success.
7. **F7 Error/empty states** — every failure becomes a plain-language sentence
   (see error_code mapping in CONTRACT.md §3); handles timeout, 4xx/5xx,
   unreachable server, empty document list.
8. **F8 Config/secrets** — all URLs and the secret live in `server/.env`
   (git-ignored); `server/.env.example` is committed with placeholders.
   `client/.env` never contains the secret.

## 5. Non-negotiable rules
- No AI calls, no Google API calls, no urgency logic anywhere in `client/` or
  `server/` — the server only forwards and attaches the header.
- `document_type`, `urgency`, `department` values are displayed exactly as n8n
  returns them — never translated, renamed, or invented. (Observed values so far:
  document_type ∈ {invoice, quote, request, report, contract}; urgency ∈
  {High, Medium, Low}; department ∈ {Finance, Sales, Support, General} — confirm
  against the Information Extractor node in the n8n workflow if a new value
  ever appears.)
- Missing data arrives as the literal strings `"Not found"` / `"No action found"`
  and must render as visible text, not blank space.
- `N8N_SECRET` lives only in `server/.env`, is attached only inside `server/`,
  and must never appear in any file under `client/`.

## 6. Development approach
- Build against `client/src/api/mock.js` first (returns the example JSON from
  CONTRACT.md). No network calls to the server or to n8n until the mock version
  is fully working.
- Connect real endpoints one at a time, in this order: `/api/documents`
  (read-only, safest) → `/api/process` → `/api/review`. Confirm each one against
  the actual Google Sheet before moving to the next.
- A single flag (`VITE_USE_MOCK` in `client/.env`) switches between mock and real.

## 7. Stack & run command
- Client: React + Vite (Node 18+)
- Server: Node + Express
- Run: `npm install` in both `client/` and `server/`, copy each `.env.example` to
  `.env`, then `npm run dev` in `server/` and `npm run dev` in `client/`
  (exact commands finalized in README.md once scaffolded).