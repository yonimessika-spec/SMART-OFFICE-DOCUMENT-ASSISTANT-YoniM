# Prompts Log

A running record of the prompts used to build this project, what each one
produced, and any corrections needed after testing.

---

## Entry 1 — Client scaffold (mock-first)

**Date:** 2026-09-06

### Prompt

> Read SPEC.md and CONTRACT.md in this repository. Confirm you understand the
> architecture, then create a `client/` folder: a React + Vite project with three
> screens — Upload, Dashboard, DocumentDetail. Put every HTTP call in
> `client/src/api/client.js`, and add `client/src/api/mock.js` that returns the
> example JSON from CONTRACT.md sections 2, 4, and 6. A `VITE_USE_MOCK` flag in
> `client/.env` (default true) chooses between `mock.js` and the real calls in
> `client.js` — leave the real calls as clearly-marked not-yet-implemented stubs
> for now. Do not create a `server/` folder yet, and do not call n8n or any
> proxy — that comes in a later step. Explain the file structure before writing
> any code.
>
> (follow-up) Create PROMPTS.md in the repo root; add an entry for this scaffold
> with the prompt, a summary of what was built, and an empty "Corrections
> needed:" line.

### What was built

- `client/` — React 18 + Vite 5 project, `react-router-dom` for routing.
  `npm install` + `npm run build` + `npm run dev` all verified working; all
  three screens render against mock data.
- **Screens** (`client/src/screens/`):
  - `Dashboard.jsx` — list newest-first (F4); free-text search over
    file_name / sender_or_company / summary + combinable urgency / type /
    department / status filters (F5); distinct empty-list vs no-results states.
  - `Upload.jsx` — file picker + drag-drop, client-side PDF/DOCX/TXT + 10 MB
    validation before any request (F1); disabled Send + explicit "up to 90s"
    processing state (F2); result view with all 7 fields, file_link, coloured
    urgency badge with always-present label text, literal "Not found" (F3).
  - `DocumentDetail.jsx` — every field; "Mark as reviewed" with optional
    note (≤200 chars) posting to the review endpoint; updates local state on
    `{ status: "updated" }`; 404 handled as a plain sentence (F6, F7).
- **API layer** (`client/src/api/`):
  - `index.js` — single import point; reads `VITE_USE_MOCK` and re-exports
    `getDocuments` / `processDocument` / `reviewDocument` from mock or real.
    Screens import only from here.
  - `mock.js` — returns CONTRACT.md §2 (process success), §4 (documents list,
    contract row + 2 extra rows in the same shape), §6 (review response, with
    the §6 404 path). Simulated latency; no network.
  - `client.js` — real HTTP calls as loud not-yet-implemented stubs (each
    `throw`s); commented with the intended proxy wiring and the SPEC.md §6
    connect-one-at-a-time order. No secret present.
- **Support**: `constants.js` (accepted MIME types, size cap, urgency badge
  styles, field labels, error_code → sentence map from CONTRACT.md §3),
  `store.jsx` (in-memory documents context: load, refresh, upsert processed,
  apply review), shared components (`UrgencyBadge`, `FieldValue`, `FieldList`,
  `DocumentCard`, `ErrorMessage`), `styles.css`.
- **Config**: `client/.env` (`VITE_USE_MOCK=true`) and `client/.env.example`,
  both committed; `.gitignore` excludes `.env`. No `N8N_SECRET` anywhere under
  `client/`. No `server/` folder created. No calls to n8n or any proxy.
- `client/README.md` with run instructions and the route/spec mapping.

### Corrections needed:

(to be filled in by hand after testing)

---

## Entry 2 — Per-endpoint mock flags + Express proxy (GET /documents)

**Date:** 2026-09-06

### Prompt

> Read SPEC.md and CONTRACT.md. Consult the vercel-react-best-practices skill
> for the client-side changes below.
>
> 1. Refactor `client/src/api/index.js` to use three independent flags instead
>    of one: `VITE_USE_MOCK_DOCUMENTS`, `VITE_USE_MOCK_PROCESS`,
>    `VITE_USE_MOCK_REVIEW` (each defaulting to true). Each of
>    getDocuments/processDocument/reviewDocument is chosen independently from
>    mock.js or client.js based on its own flag. Update `client/.env.example`
>    to list all three.
> 2. Create a `server/` folder: a minimal Express app (`server/index.js`) with
>    one route so far: `GET /api/documents`. It reads `N8N_BASE_URL`,
>    `N8N_DOCUMENTS_PATH`, and `N8N_SECRET` from `server/.env`, calls the real
>    n8n webhook with the `x-api-key` header attached server-side, and forwards
>    the JSON response (or a clean error) back to the caller. Enable permissive
>    CORS for local dev only, noted as a comment. Add `server/.env.example`
>    with placeholders for all four Appendix-A variables plus `PORT=3001`, and
>    `server/.gitignore` covering `.env` and `node_modules`.
> 3. In `client.js`, implement `getDocuments()` to call
>    `http://localhost:3001/api/documents` (read the base URL from a
>    `VITE_SERVER_BASE_URL` env var, don't hardcode it). Leave `processDocument`
>    and `reviewDocument` as the existing throwing stubs — don't touch them.
> 4. In `client/.env`, set `VITE_USE_MOCK_DOCUMENTS=false`, leave the other two
>    flags true, and add `VITE_SERVER_BASE_URL=http://localhost:3001`.
>
> Explain the file structure before writing any code.

### Clarifications given during the task

- **"Appendix A" does not exist** in SPEC.md or CONTRACT.md. Yoni specified
  `server/.env.example` should list the full set now (even though only
  `/documents` is wired): `N8N_BASE_URL`, `N8N_DOCUMENTS_PATH`,
  `N8N_PROCESS_PATH`, `N8N_REVIEW_PATH`, `N8N_SECRET`, `REQUEST_TIMEOUT_MS`,
  `PORT=3001`. `MAX_FILE_MB` stays out of the server; it belongs in
  `client/.env.example` as `VITE_MAX_FILE_MB` (F1's check is client-side).
- **`received_at`**: the real GET /documents response is a flat array matching
  CONTRACT.md §4 (no unwrapping), but `received_at` is an **opaque display
  string** (Google Sheets' own format) — never parse it with `new Date()`.
  "Newest first" = reverse the array as received (n8n returns sheet insertion
  order, oldest first), never a date sort.

### What was built / changed

- **`client/src/api/index.js`** — three independent flags
  (`VITE_USE_MOCK_DOCUMENTS` / `_PROCESS` / `_REVIEW`), each defaulting to mock;
  only the exact string `"false"` picks the real call. Exports the three
  booleans for the header badge.
- **`client/src/api/client.js`** — `getDocuments()` implemented: `fetch`
  `${VITE_SERVER_BASE_URL}/api/documents`, throws a clean Error on missing env /
  network failure / non-2xx (captures `error_code` when present), returns the
  array **reversed** for newest-first. `processDocument` / `reviewDocument`
  untouched — still throwing stubs.
- **`client/src/api/mock.js`** — seed reordered oldest-first; `getDocuments()`
  now reverses instead of sorting by `new Date()`, matching the real path.
- **`client/.env`** — `VITE_USE_MOCK_DOCUMENTS=false`, other two `true`,
  `VITE_SERVER_BASE_URL=http://localhost:3001`, `VITE_MAX_FILE_MB=10`.
  **`client/.env.example`** — all three flags `true` + the two new keys.
- **`client/src/constants.js`** — `MAX_FILE_BYTES` derived from
  `VITE_MAX_FILE_MB` (fallback 10).
- **`client/src/App.jsx`** — badge shows which calls are mocked
  (e.g. "MOCK: process, review") instead of a single "MOCK DATA".
- **`client/src/screens/Dashboard.jsx`**, **`components/DocumentCard.jsx`**,
  **`screens/DocumentDetail.jsx`** — removed every `new Date(received_at)`;
  `received_at` rendered verbatim; Dashboard no longer re-sorts (order comes
  from the API layer).
- **`server/`** — `index.js` (Express + `cors()` marked LOCAL DEV ONLY;
  `GET /api/documents` → `{N8N_BASE_URL}{N8N_DOCUMENTS_PATH}` with `x-api-key`
  attached server-side; 90s `AbortController` timeout; forwards n8n JSON + status
  on success, `{error}` with 502/504 on failure, upstream error status passed
  through; `GET /health`). `package.json` (express, cors; `node --watch
  --env-file-if-exists=.env`). `.env.example` (7 vars above). `.gitignore`
  (`node_modules`, `.env`). `README.md`.
- **`client/README.md`** updated for the three flags and the `received_at` rule.

### Verification done

- `client` `npm run build` passes.
- Proxy tested against a throwaway fake-n8n stub: happy path forwards JSON
  verbatim (200) with `x-api-key` attached; n8n 401 → status + body passed
  through; n8n unreachable → 502 `{error}`; slow n8n vs `REQUEST_TIMEOUT_MS` →
  504 `{error}`; missing env vars → exit 1 with a readable message.
- End-to-end in the browser (client → proxy → fake-n8n): dashboard renders real
  rows newest-first via reversal, `received_at` shown verbatim, badge reads
  "MOCK: process, review", proxy-down shows the plain error state + retry.

### Known follow-ups (not in scope for this step)

- The Dashboard error state shows the generic sentence, not the proxy's
  specific `{error}` message or an `error_code`→sentence mapping. Full F7
  wiring for the documents path is a later step.
- `Evidence/smoke-tests/workflow-b-get-documents.txt` still shows the old
  nested `[{ "data": [...] }]` shape with empty `document_id`; per Yoni the
  live contract is now §4-flat. Reconcile CONTRACT.md / the evidence file if
  that resurfaces.

### Corrections needed:

Corrections needed: CONTRACT.md's received_at example was wrong (invented
ISO format instead of Sheets' real locale string) — fixed post-hoc. Briefly
suspected a data-wrapping bug in Workflow B; turned out to be n8n's
execution-log display format, not the real HTTP response — no code change
needed. Port 3001 conflicted with another local project — moved server to
5055 in both .env and .env.example (client + server). Needed to learn that
the server has no browser page of its own (only the client's port is ever
opened directly).
