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

---

## Entry 3 — Visual restyle (Tailwind + shadcn/ui)

**Date:** 2026-09-06

### Prompt

> Consult the frontend-design skill for overall aesthetic direction and
> typography, the web-design-guidelines skill for concrete web UI conventions,
> and the shadcn/ui skill to add and use its component library.
>
> Direction: modern and friendly — rounded corners, a warmer accent color,
> generous whitespace — but this is an internal office tool, not a marketing
> site, so keep it calm and uncluttered, not playful or busy.
>
> 1. Set up Tailwind + initialize shadcn/ui. Define a small, warm palette and one
>    accent color for primary actions and links/nav. The urgency badges
>    (red/amber/green for High/Medium/Low) are semantic — restyle their
>    shape/spacing but never change the colour→level mapping, and keep the text
>    label inside every badge.
> 2. Restyle the shared nav in App.jsx using shadcn/ui components.
> 3. Restyle Dashboard: cards, search input, filter selects — warmer neutral
>    background, rounded cards, clearer hierarchy.
> 4. Restyle Upload and DocumentDetail with the same tokens/components.
>
> Styling-only pass — F1–F6 must keep working exactly. Don't touch
> `client/src/api/`, don't change component logic, only markup/styling.

### Decision taken during the task

- **Accent colour** (asked): **muted plum-rose `#8C4257`** for primary actions
  and links/nav. Deliberately clear of the red/amber/green urgency hues so it
  never reads as a status signal; also steers away from the cream +
  terracotta (`#D97757`) combo the frontend-design skill flags as a current
  generated-design tell.

### What changed

- **Tooling**: added `tailwindcss` v4 + `@tailwindcss/vite`, `tw-animate-css`,
  `lucide-react`, `class-variance-authority`; `@/` alias in `vite.config.js` +
  `jsconfig.json`; `components.json` (new-york, `tsx:false`, stone base).
  shadcn CLI added `src/components/ui/*` (button, card, input, select, badge,
  separator, alert, textarea, label, spinner, field, empty, skeleton) — these
  import `cn` from the `cn` package (this CLI version's default, not
  `@/lib/utils`).
- **`src/index.css`** (new, replaces `styles.css`): warm token palette —
  paper-white `#FAF8F5` ground, warm-brown-black text, warm-stone neutrals,
  plum-rose `--primary`/`--ring`, `--radius` 0.75rem. `@theme inline` map +
  base layer. `styles.css` deleted; `main.jsx` imports `index.css`.
- **`index.html`**: Hanken Grotesk via `<link>` + preconnect; `theme-color`.
- **Screens/components** — markup + classes only, all state/handlers/effects
  and `validate`/`toBase64`/`messageFor` untouched:
  - `App.jsx` — sticky header, nav links styled with `buttonVariants` (active =
    plum tint), mock indicator → `Badge`.
  - `Dashboard.jsx` — `Input` (search), `Select` ×4 (an "All …" item maps to
    the existing empty-string clear so `filters` shape is unchanged), `Empty`
    for both empty/no-results states, `Skeleton` rows for loading. Added a
    subtitle count that reflects the filtered view (`N` / `N of M`).
  - `DocumentCard.jsx` — fully-clickable `Link` card; filename / summary
    (line-clamp-2) / metadata (`Badge` chips, no middle-dot string) hierarchy.
  - `Upload.jsx` — restyled dropzone (handlers intact), `Alert`+`Spinner`
    processing state, `Card` result view, `Button`s.
  - `DocumentDetail.jsx` — `Card`s for fields + review, `Field`/`FieldGroup`
    + `Textarea`, submit `Button` composes `Spinner`, `Empty` for "not loaded".
  - `UrgencyBadge.jsx` — rounder pill, roomier padding, a leading dot; colours
    still read straight from `URGENCY_STYLES` / `URGENCY_FALLBACK`, label
    `"Urgency: <value>"` unchanged.
  - `FieldList.jsx` — keeps `<dl>/<dt>/<dd>`, restyled as a bordered divided
    list. `FieldValue.jsx` / `ErrorMessage.jsx` — tokenised; `ErrorMessage`
    now renders a destructive `Alert`; `messageFor` unchanged.

### Verification done

- `client` `npm run build` passes (bundle ~319 kB JS / ~42 kB CSS).
- Browser (client → proxy → fake-n8n, 7-row dataset): Dashboard list + filter +
  no-results + error + skeleton; DocumentCard hierarchy; DocumentDetail fields +
  **F6 review submitted end-to-end** (status → Reviewed, note shown, success
  line); Upload **F1 select + F3 result view** (all 7 fields, badge, link);
  "document not loaded" empty state; mobile (375px) header + filter wrap.
  Urgency colours preserved incl. empty urgency → grey "Not found" pill.
- `git status` confirms `client/src/api/`, `store.jsx`, `constants.js`, and
  `server/` untouched.

### Known follow-ups (not in scope)

- `clsx` + `tailwind-merge` are now unused (the `cn` package supersedes them);
  left installed to avoid churn.
- No dark-mode toggle wired — `color-scheme: light`; `.dark` tokens exist but
  are dormant.
- F2 processing state (≈600 ms with the mock) was built to match (`Alert` +
  `Spinner`) but not caught on camera.

### Corrections needed:

(to be filled in by hand after testing)

---

## Entry 4 — Temporary file_name identifier bridge (pre-Workflow A)

**Date:** 2026-09-06

---

## Entry 5 — Workflow A: Doc Assistant - Upload Endpoint (Phase 3)

**Date:** 2026-09-08

### What was built (n8n workflow, not client/server code)

New n8n workflow "Doc Assistant - Upload Endpoint" implementing `POST /process-document`:

- **Webhook** (Header Auth, `x-api-key`) → **Validate mimeType** (IF, Boolean
  expression checking `body.mime_type` against the PDF/DOCX/TXT allow-list,
  hard reject) → **false branch**: Respond to Webhook - Error (400,
  `UNSUPPORTED_FILE_TYPE`, CONTRACT §3 shape).
- **True branch**: Convert to File (Move Base64 String to File,
  `body.file_base64` → binary `data`) → Google Drive Upload (**Processed
  Documents** folder directly, not Incoming — avoids double-triggering Part
  1's Drive watcher) → Merge (combine by position — Google Drive's node
  drops the incoming binary and returns only its own JSON, so Merge
  recombines the binary from Convert to File with the Drive upload's
  metadata) → Execute Workflow, calling the existing sub-workflow "Doc
  Assistant - Process Document" (added this new caller to its "can be
  called by" list).
- **Call node outputs**: Success branch → Check Empty Extraction (IF,
  `fields.summary` trimmed length === 0) → true: Respond to Webhook - Empty
  Document (422, `EMPTY_DOCUMENT`); false: Respond to Webhook - Success

### Prompt

> Two related bugs, same root cause: `document_id` is empty for every real
> document right now (nothing writes that column until Workflow A, a later
> milestone). Until then, fall back to `file_name` as the identifier
> everywhere a document needs a stable unique reference:
> 1. Dashboard.jsx list key → `key={document.document_id || document.file_name}`
> 2. The route/link from a Dashboard card into DocumentDetail, and
>    DocumentDetail's lookup — both currently rely on `document_id`. Use
>    `document_id` when present, `file_name` when empty, consistently on both
>    the linking and lookup sides so they always agree.
>
> Temporary bridge, not a redesign — the fallback stops being reached once
> Workflow A populates `document_id`.

### What changed (all in `client/src/`)

- `screens/Dashboard.jsx` — list key already `key={d.document_id || d.file_name}`.
- `components/DocumentCard.jsx` — `const ref = doc.document_id || doc.file_name`;
  link is `` `/document/${encodeURIComponent(ref)}` ``.
- `screens/DocumentDetail.jsx` — lookup is
  `documents.find((d) => (d.document_id || d.file_name) === id)`
  (`id` from `useParams` is already URL-decoded).
- `screens/Upload.jsx` — the "Open detail view" button uses the same
  `encodeURIComponent(result.document_id || result.file_name)` convention.

### Verified

- `npm run build` passes.
- Browser, proxy serving 7 rows with `document_id: ""`: dashboard renders with
  no duplicate-key warning; clicking `cohen-urgent.txt` navigates to
  `/document/cohen-urgent.txt` and DocumentDetail loads the correct row.

### Not touched (out of scope for this bridge)

- The `/api/review` payload and `store.applyReview` still key on the raw
  `doc.document_id`. Review already can't succeed with an empty `document_id`
  (CONTRACT §5 needs a real Sheet ID; mock + real both 404), so no state
  corruption — but it's the next thing to revisit when Workflow A lands or if
  review is wired against Workflow B sooner.

### Corrections needed:

(to be filled in by hand after testing)

---

## Entry 6 — Wire POST /api/process to Workflow A (mock → real)

**Date:** 2026-09-08

### Prompt

> Read SPEC.md and CONTRACT.md, and PROMPTS.md Entry 5 for the exact
> request/response shape Workflow A now returns.
> 1. In `client/src/api/client.js`, implement `processDocument(file, submittedBy)`
>    for real: read the file → base64 (no data-URL prefix, §1); POST to
>    `${VITE_SERVER_BASE_URL}/api/process` with
>    `{ file_name, mime_type, file_base64, submitted_by }` (snake_case, §1);
>    on 200 return the parsed JSON as-is (§2); on error capture
>    `error_code` + `message` (§3) and throw an Error the existing
>    `messageFor` map can handle — don't invent new text; reuse the mapping.
>    Respect the ~90 s timeout convention from `getDocuments()`.
> 2. In `server/index.js`, add `POST /api/process`: forward the body to
>    `${N8N_BASE_URL}${N8N_PROCESS_PATH}` with `x-api-key` server-side, pass
>    n8n's response/status through as-is on success and error, same
>    timeout/error-handling as `/api/documents`.
> 3. `client/.env`: `VITE_USE_MOCK_PROCESS=false`.
> Don't touch `getDocuments`, `reviewDocument`, or anything under
> `client/src/screens/` or `client/src/components/` — Upload.jsx already
> calls `processDocument()` and handles §2/§3. Pure mock-to-real swap, same
> pattern as Entry 2.

### Clarification given during the task

- **Signature stays `processDocument(payload)`** (asked, Yoni confirmed
  "keep"). Item 1's `(file, submittedBy)` / "convert to base64 in client.js"
  wording predates the fact that **`Upload.jsx` already does the base64
  conversion** (`toBase64` helper) and builds the
  `{ file_name, mime_type, file_base64, submitted_by }` object before calling
  `processDocument(payload)` — `mock.js` takes that same object. Refactoring to
  `(file, submittedBy)` would have meant editing `Upload.jsx` + `mock.js`,
  which "don't touch screens/components / no UI changes" forbids. So this was a
  true one-file swap: `client.js` POSTs the object Upload already passes in.
- **`getDocuments()` has no client-side timeout** — the ~90 s budget lives in
  the server's `REQUEST_TIMEOUT_MS` (returns 504 if n8n runs long).
  `processDocument()` matches: no client `AbortController`.

### What changed

- **`server/index.js`** — added `N8N_PROCESS_PATH` to the env destructure and
  the required-vars check (fail-fast, like `N8N_DOCUMENTS_PATH`). New route
  `POST /api/process` with `express.json({ limit: '20mb' })` (base64 of a 10 MB
  file ≈ 13.4 MB, over Express's 100 KB default) → forwards `req.body` to
  `{N8N_BASE_URL}{N8N_PROCESS_PATH}` with `x-api-key`, passes n8n's status +
  JSON body through verbatim (success and error), same `AbortController` →
  504 / 502 handling as `/api/documents`. Updated the header comment + the
  startup log lines.
- **`client/src/api/client.js`** — `processDocument(payload)` implemented:
  `fetch` POST `${VITE_SERVER_BASE_URL}/api/process`, `Content-Type:
  application/json`, `body: JSON.stringify(payload)`. On `!res.ok` **or**
  `body.status === 'error'` → throw `Error(body.message || …)` with
  `err.status` and `err.code = body.error_code` (feeds `messageFor`'s
  `ERROR_MESSAGES` map — no invented text). On success → return the §2 body
  untouched (guards against an empty/unreadable body). Structure mirrors
  `getDocuments()`.
- **`client/.env`** — `VITE_USE_MOCK_PROCESS=false` (documents already false;
  review still true).

### Not touched

- `getDocuments`, `reviewDocument`, `client/src/api/index.js`,
  `client/src/api/mock.js`, everything under `client/src/screens/` and
  `client/src/components/`, and **`server/.env`** (Yoni's real file).

### Verification done

- `client` `npm run build` passes.
- Server (`node --env-file=.env.test index.js`, fake n8n stub on :4999):
  - valid txt → n8n 200 → proxy 200, CONTRACT §2 body verbatim;
  - `empty-*` filename → n8n 422 `EMPTY_DOCUMENT` → proxy 422, §3 body;
  - bad mime → n8n 400 `UNSUPPORTED_FILE_TYPE` → proxy 400, §3 body;
  - `x-api-key` attached server-side (seen in the stub's log).
- Browser, `VITE_USE_MOCK_PROCESS=false`, Upload.jsx unchanged:
  - valid `.txt` → F2 processing → **F3 result view**, all 7 fields, badge,
    `notification_sent` message, `submitted_by=app-user` echoed in the summary;
  - `empty-scan-doc.pdf` → **F7 error**: "No readable text — try a different
    file." (the exact `ERROR_MESSAGES['EMPTY_DOCUMENT']` string, reused — not
    invented), "Try again" shown, file kept in the form;
  - Dashboard (`getDocuments`) still renders — no regression.

### Action required on Yoni's side

- `server/.env` must contain **`N8N_PROCESS_PATH`** (it's in `.env.example` as
  `/process-document`). The server now lists it as a required var, so it will
  `exit(1)` on start until it's set. I did not open `server/.env`.
- Restart the `server/` process to pick up the new route; restart the
  `client/` dev server to pick up `VITE_USE_MOCK_PROCESS=false`.

### Corrections needed:

(to be filled in by hand after testing)

---

## Entry 7 — Real /api/review + Archive page + Reopen modal

**Date:** 2026-09-08

### Prompt

> Read SPEC.md, CONTRACT.md, PROMPTS.md (Entries 5/6). Workflow C
> "Doc Assistant - Review Endpoint" is live at POST /review — 200
> `{ status:"updated", document_id }`, 404 `{ status:"error",
> error_code:"DOCUMENT_NOT_FOUND", message }`. `status` in the request now also
> accepts "Processed" (reopens a document; the backend clears
> reviewed_by/review_note itself). Follow existing conventions (shadcn/ui, the
> plum-rose token palette, the Field/FieldGroup/FieldList patterns, the
> store.jsx pattern).
>
> 1. Real `/api/review` wiring: implement `reviewDocument(payload)` in
>    `client.js` (POST payload as-is, return JSON on 200, throw with
>    `err.status` + `err.code` on non-2xx / `body.status === 'error'`, same
>    pattern as `processDocument`); add `POST /api/review` to `server/index.js`
>    (forward to `${N8N_BASE_URL}${N8N_REVIEW_PATH}` with `x-api-key`, add
>    `N8N_REVIEW_PATH` to the env destructure + required check, don't touch
>    `server/.env`); `client/.env` → `VITE_USE_MOCK_REVIEW=false`.
> 2. Dashboard: default the status filter to "Processed" (dropdown still lets a
>    user pick other statuses — only the default changes).
> 3. New Archive page (`/archive`): documents with status "Reviewed" or
>    "Needs Review"; same F5 free-text search as Dashboard, reusing shared
>    logic/components; "Archive" nav link; each row has a "Reopen" button.
> 4. Reopen confirmation modal (shadcn Dialog): text input, confirm button
>    disabled until the user types exactly "Reopen"; on confirm call
>    `reviewDocument({ document_id, status:"Processed", reviewed_by:"",
>    review_note:"" })`; on success remove the doc from Archive's view via
>    store.jsx state (consistent with `applyReview`) so Dashboard picks it back
>    up; on error show a plain-language message in the modal (reuse
>    `messageFor`) rather than closing silently.
>
> Additive: one new page, one nav link, one default-filter change, one
> mock-to-real swap. Don't touch `getDocuments`, `processDocument`, `mock.js`'s
> review shape, or the Upload/DocumentDetail review-submission logic.

### Clarification given during the task

- Prompt step 4 says "update store.jsx state consistently with `applyReview`".
  `applyReview(id, { status:'Processed', review_note:'', reviewed_by:'' })`
  already does exactly the reopen state change, so store.jsx gets a thin
  **`reopenDocument(documentId)`** wrapper that delegates to it — no new state
  logic.

### What changed

- **`server/index.js`** — `N8N_REVIEW_PATH` added to the env destructure and the
  required-vars check. New `POST /api/review` route: `express.json()` (small
  body), forwards to `{N8N_BASE_URL}{N8N_REVIEW_PATH}` with `x-api-key`
  server-side, passes n8n's status + JSON body through verbatim (incl. the 404
  `DOCUMENT_NOT_FOUND`), same `AbortController` → 504 / 502 handling. Header
  comment + startup logs updated.
- **`client/src/api/client.js`** — `reviewDocument(payload)` implemented,
  structurally identical to `processDocument`: POST `/api/review`, return the
  §6 body on 200, throw `Error(body.message || …)` with `err.status` +
  `err.code = body.error_code` on `!res.ok` / `body.status === 'error'`.
- **`client/src/constants.js`** — one entry added to `ERROR_MESSAGES`:
  `DOCUMENT_NOT_FOUND` (same "error_code → sentence" pattern as the §3 codes).
- **`client/.env`** — `VITE_USE_MOCK_REVIEW=false` (all three flags now real).
- **`client/src/store.jsx`** — `reopenDocument(documentId)` added and exposed on
  the context; delegates to `applyReview`.
- **`client/src/screens/Dashboard.jsx`** — `filters` initial state is
  `{ status: 'Processed' }`; `hasActiveControls` ignores that default so
  "Clear" isn't always showing; `clearAll` → `{}` (show everything). Search box
  and haystack match now come from the shared `SearchField` / `matchesQuery`.
- **`client/src/search.js`** (new) — `matchesQuery(doc, query)`, extracted from
  Dashboard's F5.
- **`client/src/components/SearchField.jsx`** (new) — the search `Input` + icon,
  extracted from Dashboard.
- **`client/src/screens/Archive.jsx`** (new) — `/archive`; filters to status
  `Reviewed` / `Needs Review`; shared search; loading/error states like
  Dashboard; rows via `ArchiveCard`.
- **`client/src/components/ArchiveCard.jsx`** (new) — a non-link card (contains
  the Reopen button); file name links to `/document/:id`; reuses `UrgencyBadge`
  / `FieldValue` / `Badge`; shows the review note + reviewer.
- **`client/src/components/ReopenDialog.jsx`** (new) — "Reopen" button +
  controlled shadcn `Dialog`. Confirm disabled until the input `=== "Reopen"`.
  Confirm → `reviewDocument({ …, status:'Processed', reviewed_by:'',
  review_note:'' })` → on `{status:'updated'}` call `reopenDocument()` and
  close; on error render `<ErrorMessage>` inside the dialog and stay open;
  resets state on close; can't be dismissed mid-request.
- **`client/src/components/ui/dialog.jsx`** (new via `shadcn add dialog`) — one
  local patch: `DialogOverlay` wrapped in `React.forwardRef`. On React 18,
  radix-ui's Portal/Presence clones that child with a ref and the plain
  function version logged a "Function components cannot be given refs" warning.
  Trigger uses a plain `<Button onClick>` (not `<DialogTrigger asChild>`) for
  the same reason.
- **`client/src/App.jsx`** — `Archive` import, `/archive` route, "Archive"
  `NavLink` between Dashboard and Upload.
- **`server/README.md`** — route table + run note updated.

### Not touched

- `getDocuments`, `processDocument`, `client/src/api/index.js`,
  `client/src/api/mock.js` (review mock still CONTRACT §6), the
  Upload/DocumentDetail review-submission code, and **`server/.env`**.

### Verification done

- `client` `npm run build` passes.
- Server (`node --env-file=.env.test index.js`, fake n8n stub with a mutable
  5-row sheet): `POST /api/review` match → 200 `{status:"updated"}`; no match →
  404 `{error_code:"DOCUMENT_NOT_FOUND"}`; `x-api-key` attached.
- Browser (all three flags real, fake n8n):
  - **Dashboard** defaults to the 2 `Processed` rows ("2 of 5 documents", no
    Clear button); picking "Reviewed" from the Status dropdown shows the
    reviewed rows + a Clear button.
  - **Archive** lists the 3 `Reviewed` / `Needs Review` rows with notes,
    reviewer, and a Reopen button each; shared search box present.
  - **Reopen modal**: confirm disabled until "Reopen" typed exactly →
    `reviewDocument(status:"Processed")` → row disappears from Archive and
    appears on the Dashboard as `Processed` (via `reopenDocument`→`applyReview`).
  - **Reopen error**: with the proxy unreachable, the modal stays open and
    shows the plain sentence; the row is not removed. 404
    `DOCUMENT_NOT_FOUND` → proxy body verified to carry `error_code`, which
    `messageFor` maps to the new sentence.
  - No React console warnings after the `forwardRef` patch.
  - DocumentDetail F6 review is the same `reviewDocument` code path as the
    verified reopen flow (status "Reviewed" instead of "Processed"); unchanged.

### Action required on Yoni's side

- `server/.env` must contain **`N8N_REVIEW_PATH`** (it's in `.env.example` as
  `/review`). The server now requires it and will `exit(1)` until it's set.
  I did not open `server/.env`.
- Restart `server/` (new route + required var) and the `client/` dev server
  (`VITE_USE_MOCK_REVIEW=false`).

### Corrections needed:

(to be filled in by hand after testing)
