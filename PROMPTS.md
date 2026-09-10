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

---

## Entry 8 — DocumentDetail: "Flag as needs review" + double-submit guard

**Date:** 2026-09-08

### Prompt

> In DocumentDetail.jsx's Review section:
> 1. Add a second action button, "Flag as needs review", next to
>    "Mark as reviewed". Same payload shape as the existing button except
>    `status: "Needs Review"`. Reuse the existing submit handler — parameterize
>    the status, don't duplicate the code path. Success message for this
>    action: "Saved. This document is now flagged as Needs Review. This
>    document is now available to view on Archive." Keep the existing
>    "Mark as reviewed" button and its message exactly as they are now. Both
>    buttons share the same optional Note field.
> 2. Fix: both buttons disable + show a pending/saving state for the duration
>    of the request, re-enabling only on error — preventing a double-submit
>    from repeated clicks while the request is in flight. Same pattern as
>    Upload.jsx's F2 processing state.
>
> Don't touch the review endpoint, client.js, or the Archive/Reopen flow —
> DocumentDetail-only: one new button + a shared disable-while-pending guard.
>
> (follow-up) Add an Entry 8 to PROMPTS.md.

### What changed — `client/src/screens/DocumentDetail.jsx` only

- `onSubmit(e)` split into `submitReview(status)` (the shared path) + a thin
  `onSubmit` that calls `submitReview('Reviewed')` (keeps the `<form onSubmit>`
  / the "Mark as reviewed" `type="submit"` button working exactly as before).
  `submitReview` opens with `if (phase === 'saving') return` — the in-flight
  guard.
- New state `savedAs` ('Reviewed' | 'Needs Review'), set on success, chooses
  which success sentence renders. The "Reviewed" sentence is byte-for-byte the
  existing one; the "Needs Review" sentence is the new copy from the prompt.
- New button **"Flag as needs review"** in the same `<Field orientation=
  "horizontal">`: `type="button"`, `variant="outline"` (secondary to the plum
  "Mark as reviewed"), `onClick={() => submitReview('Needs Review')}`. Payload
  is identical to the reviewed path except `status`.
- Both buttons now carry `disabled={phase === 'saving'}` and the
  `{phase === 'saving' ? 'Saving…' : <label>}` + `<Spinner/>` treatment (the
  "Mark as reviewed" button already had this; the pattern is now on both).
  `phase === 'error'` leaves `phase !== 'saving'`, so both re-enable on error.
- File header comment updated to mention both actions.

### Not touched

- `client/src/api/*` (incl. `client.js` / `reviewDocument`), `store.jsx`,
  the Archive / Reopen flow, the `/api/review` route, the existing
  "already marked as Reviewed" `CardDescription`, and **`server/.env`**.
  `git status` shows exactly one modified file: `DocumentDetail.jsx`.

### Verification done

- `client` `npm run build` passes.
- Browser (isolated stub on a spare port via `client/.env.local` +
  `server/.env.test` PORT=5056, so the real backend on :5055 was never hit):
  - Processed doc → **"Flag as needs review"** → status becomes "Needs Review",
    message reads "Saved. This document is now flagged as Needs Review. This
    document is now available to view on Archive."
  - **"Mark as reviewed"** → status "Reviewed", message unchanged
    ("…marked as Reviewed. This document is now available to view on Archive.").
  - Mid-request (1.5 s stub latency): **both buttons `disabled`, both show
    "Saving…"**.
  - Stub down → request fails → **both buttons re-enabled**, `<ErrorMessage>` +
    "Try again" shown (existing F7 component).
  - Button attrs confirmed: "Mark as reviewed" = `type="submit"` /
    `variant="default"`; "Flag as needs review" = `type="button"` /
    `variant="outline"`.

### Corrections needed:

(to be filled in by hand after testing)

---

## Entry 9 — Archive: "Needs Review" visual treatment + sort

**Date:** 2026-09-08

Follow-on to Entry 8 (kept separate — Entry 8 is the DocumentDetail button;
this is Archive-display-only, different files).

### Prompt

> On the Archive page, give "Needs Review" documents a treatment distinct from
> "Reviewed" so they stand out as needing action:
> - Add a status badge/pill per Archive card ("Needs Review" / "Reviewed"),
>   reusing the UrgencyBadge pattern rather than inventing a new one.
> - "Needs Review" visually distinguished (amber/warning-toned border or badge
>   colour) within the existing warm palette — no new colour; "Reviewed" stays
>   neutral/muted.
> - Sort Archive so "Needs Review" appears before "Reviewed" by default, within
>   the existing search/filter behaviour.
>
> Archive-display-only. Don't touch review submission, the endpoint, or
> Dashboard.

### What changed

- **`client/src/constants.js`** — added `REVIEW_STATUS_STYLES` (+ a fallback),
  same `{ bg, fg, border }` shape as `URGENCY_STYLES`. `'Needs Review'` is set
  to `URGENCY_STYLES.Medium` (a direct reference — provably the same warm amber
  already in the palette, no new colour); `'Reviewed'` uses the neutral
  warm-stone token values (`#f3efe9` / `#6b625a` / `#e7e1d9` = `--muted` /
  `--muted-foreground` / `--border` from index.css).
- **`client/src/components/StatusBadge.jsx`** (new) — a structural clone of
  `UrgencyBadge`: same pill classes, leading dot, inline colour from the map,
  label always shown (the raw status string, no prefix).
- **`client/src/components/ArchiveCard.jsx`** —
  - `StatusBadge` stacked above `UrgencyBadge` in a right-aligned column in the
    card's top row; the now-redundant plain `<span>{doc.status}</span>` removed
    from the meta row.
  - `"Needs Review"` cards: `borderColor` + `backgroundColor` set inline from
    `REVIEW_STATUS_STYLES` (amber border `#e0a13c`, pale amber fill `#fff4e5`).
    `"Reviewed"` (and anything else): unchanged `border-border bg-card`.
- **`client/src/screens/Archive.jsx`** — after the existing `matchesQuery`
  filter, `visible` is stable-sorted by `STATUS_RANK` (`Needs Review` 0,
  `Reviewed` 1, else 9). Stable sort keeps the newest-first order within each
  group; the search still filters first.

### Not touched

- Review submission / `submitReview` / DocumentDetail, `client.js`,
  `/api/review`, `store.jsx`, Dashboard, `UrgencyBadge`, and **`server/.env`**.
  `URGENCY_STYLES` itself is unchanged (only referenced).

### Verification done

- `client` `npm run build` passes.
- Browser (isolated stub, GET-only — no writes to the real backend): Archive
  with 2 `Needs Review` + 1 `Reviewed` row →
  - the two `Needs Review` rows render first, then the `Reviewed` row (sort);
  - `Needs Review` cards: computed `border-color rgb(224,161,60)` /
    `background rgb(255,244,229)`; `Reviewed` card: `rgb(231,225,217)` border /
    white — confirmed via `getComputedStyle`;
  - `StatusBadge` shows "Needs Review" (amber) / "Reviewed" (muted);
  - search ("report") still filters to 1 row and the count reads "1 of 3";
  - no React console warnings.

### Corrections needed:

(to be filled in by hand after testing)

---

## Entry 10 — Design correction: "Needs Review" belongs on Dashboard, not Archive

**Date:** 2026-09-08

### Why (the design fix)

Entry 8 added a "Flag as needs review" action; Entry 9 gave "Needs Review"
rows an amber treatment **on the Archive page**. That was the wrong home for
them. "Needs Review" means *a person looked at the document and it still needs
action* — that's live work, arguably more urgent than "Processed" (which just
hasn't been looked at yet). Burying it in the Archive (handled/done items) hides
it. So "Needs Review" moves to the Dashboard, and the amber treatment moves with
it. Archive becomes "Reviewed" only.

### Prompt

> Routing fix, no new endpoint:
> 1. Dashboard.jsx — default/active status filter shows "Processed" OR
>    "Needs Review" (not "Processed" alone); the dropdown still lets a user
>    narrow to one of the two.
> 2. Archive.jsx — filter to ONLY `status === "Reviewed"` (drop "Needs Review").
> 3. On Dashboard, give "Needs Review" docs the same visual distinction Entry 9
>    built — reuse `StatusBadge` + `REVIEW_STATUS_STYLES` (don't duplicate the
>    styling logic). Sort "Needs Review" before "Processed", same stable sort.
> 4. Remove the now-dead Needs-Review amber styling from `ArchiveCard.jsx`
>    (StatusBadge / REVIEW_STATUS_STYLES themselves stay — Dashboard uses them).
> 5. DocumentDetail.jsx — the "Flag as needs review" success message from
>    Entry 8 still says "…available to view on Archive," which is no longer
>    true. Change it to: "Saved. This document is now flagged as Needs Review."
>    The "Mark as reviewed" message is unaffected (that document really does go
>    to Archive) — keep it exactly.
>
> Don't touch review submission logic, the /api/review route, Reopen, or
> store.jsx.
>
> (follow-up) Add Entry 10 documenting this correction and why.

### What changed

- **`client/src/screens/Dashboard.jsx`** —
  - Status filter now uses two sentinels (never real values):
    `ACTIVE = '__active'` (the default: `['Needs Review', 'Processed']`) and
    `ALL = '__all'`. `filters.status` init is `ACTIVE`. Filter logic:
    `ACTIVE` → must be one of the two active statuses; `ALL` → no constraint;
    any real value → exact match.
  - Status pulled out of the generic `FILTER_KEYS` map into its own `<Select>`
    (`w-56`): items are "Needs Review + Processed" (`ACTIVE`), the data-derived
    statuses, then "All statuses" (`ALL`). The other three filters unchanged.
  - `hasActiveControls` treats `status === ACTIVE` as "not active";
    `clearAll` resets to `{ status: ACTIVE }` (the default view) rather than
    `{}`.
  - `visible` gets a stable `.sort()` by `STATUS_RANK` (`Needs Review` 0,
    `Processed` 1, else 9) — Needs Review first, newest-first preserved within
    each group.
- **`client/src/components/DocumentCard.jsx`** — `StatusBadge` stacked above
  `UrgencyBadge` top-right (replacing the plain `<span>{doc.status}</span>` in
  the meta row); `"Needs Review"` rows get the amber border + fill inline from
  `REVIEW_STATUS_STYLES` (same code shape as Entry 9's ArchiveCard), and drop
  the plum `hover:` classes for that case; everything else keeps the current
  `border-border bg-card hover:…`.
- **`client/src/screens/Archive.jsx`** — `archived` now filters
  `d.status === 'Reviewed'` only; the `ARCHIVED` set and the `STATUS_RANK`
  sort are gone (one status left, nothing to sort). Header comment updated.
- **`client/src/components/ArchiveCard.jsx`** — removed the `needsReview` /
  `accent` locals, the conditional `cn()` className, the inline `style`, and
  the now-unused `cn` / `REVIEW_STATUS_STYLES` imports. The card is a plain
  `border-border bg-card` again. `StatusBadge` render kept (always "Reviewed").
- **`client/src/constants.js`** — `REVIEW_STATUS_STYLES` unchanged; comment
  updated to say it now serves Dashboard + Archive and that "Processed" (and
  anything else) falls back to the neutral stone values.
- **`client/src/screens/DocumentDetail.jsx`** — the `savedAs === 'Needs Review'`
  branch of the success message is now just
  `'Saved. This document is now flagged as Needs Review.'`. The "Reviewed"
  branch is byte-for-byte unchanged.

### Not touched

`submitReview` / the review flow, `/api/review` (server), `ReopenDialog`,
`store.jsx`, `StatusBadge.jsx`, `UrgencyBadge`, and **`server/.env`**.

### Verification done

- `client` `npm run build` passes.
- Browser (isolated stub, mixed dataset — 1 Processed, 2 Needs Review, 2
  Reviewed):
  - **Dashboard** default: 3 rows (2 Needs Review, then 1 Processed — sort
    confirmed), count "3 of 5", Status trigger reads "Needs Review + Processed",
    no Clear button. Needs Review cards: computed `bg rgb(255,244,229)` /
    `border rgb(224,161,60)`; Processed card white / `rgb(231,225,217)`.
  - Status dropdown: "Needs Review" → 2 rows; "Processed" → 1; "Reviewed" → 2
    (reachable from Dashboard if explicitly picked); "All statuses" → all 5,
    Needs Review first then Reviewed; each narrowing shows the Clear button;
    Clear → back to the default view.
  - **Archive**: only the 2 `Reviewed` rows, both white/neutral (no amber),
    "Reviewed" StatusBadge, Reopen button present.
  - **DocumentDetail**: "Flag as needs review" → "Saved. This document is now
    flagged as Needs Review." (no Archive sentence); "Mark as reviewed" →
    "Saved. This document is now marked as Reviewed. This document is now
    available to view on Archive." (unchanged).
  - No React console warnings.

### Corrections needed:

(to be filled in by hand after testing)

---

## Entry 11 — Hebrew / RTL support (Part 1) + Hebrew extraction test (Part 2)

**Date:** 2026-09-09

### Prompt (abridged)

> Genuinely support Hebrew, not just an English UI. Two halves:
> **Part 1 — client:** install react-i18next (+ i18next + browser-languagedetector);
> extract every user-facing string into `src/locales/en.json` + `he.json`
> (screens, filters, status labels, buttons, the reopen modal + "type Reopen"
> flow, errors, empty states — but not API field names); natural professional
> Hebrew; runtime language toggle, no reload; `dir="rtl"` on the root for Hebrew;
> audit real RTL correctness (directional icons, badge/card/modal mirroring,
> search + filter + dropzone, numbers/dates/IDs staying LTR); confirm Hanken
> Grotesk renders Hebrew or add a Hebrew fallback font; walk the whole app in
> Hebrew and fix what breaks.
> **Part 2 — extraction test (report only, cannot edit n8n):** run the 3 Hebrew
> test files through the REAL /process-document; check reading order, whether
> the Information Extractor pulls fields from Hebrew, whether the Sheet row is
> not mojibake, and whether the non-urgent Hebrew invoice is correctly NOT
> flagged urgent; write a report + the EXACT improved Information-Extractor
> prompt text to paste into n8n (which node), without changing it yourself.
> Do not modify `server/.env`.

### Part 1 — files changed (client only)

- **deps:** `i18next`, `react-i18next`, `i18next-browser-languagedetector`.
- **new:** `src/i18n.js` (config, localStorage detection, syncs
  `<html dir/lang>` + `document.title` on language change), `src/locales/en.json`,
  `src/locales/he.json` (101 keys each, verified identical key sets).
- **`index.html`** — added Heebo (Google Fonts) alongside Hanken Grotesk.
- **`src/index.css`** — `--font-sans: 'Hanken Grotesk', 'Heebo', …` so Hebrew
  glyphs (absent from Hanken) fall through to Heebo; English unchanged.
- **`src/main.jsx`** — imports `./i18n.js`; wraps the tree in radix-ui
  `Direction.Provider` (fed by `i18n.dir()`) so Select/Dialog follow the UI dir.
- **`src/App.jsx`** — nav + brand localised; language-toggle button (lucide
  `Languages` icon) in the header; `ml-auto` → `ms-auto`.
- **All 4 screens + `DocumentCard`, `ArchiveCard`, `StatusBadge`, `UrgencyBadge`,
  `FieldList`, `FieldValue`, `SearchField`, `ErrorMessage`, `ReopenDialog`** —
  every string via `t()`. Status values now display through a `status.*` map
  (raw value still drives filtering / the API). `messageFor` → resolves
  `errors.<code>` from the locale (the `ERROR_MESSAGES`/`GENERIC_ERROR` consts
  and `FIELD_LABELS` moved out of `constants.js` → `FIELD_KEYS`).
- **RTL specifics:** `SearchField` icon `left-3`→`start-3`, input `pl-9`→`ps-9`;
  card meta `ml-auto`→`ms-auto`; DocumentDetail back-link `-ml-3`→`-ms-3` and
  its chevron flips `ChevronLeft`↔`ChevronRight` by `i18n.dir()`; `received_at`,
  the char counter and file sizes wrapped `dir="ltr"`; file names / summaries /
  extracted values wrapped `dir="auto"` (fixed "12 March 2026" → "March 2026 12"
  bidi scramble on the deadline field); the file-format hint became
  `<span dir="ltr">PDF, DOCX, TXT</span> · {size}` and the Hebrew
  "unsupported file" copy was rephrased to avoid an acronym pile-up.
- **shadcn ui patches for RTL:** `ui/select.jsx` item `pr-8 pl-2`→`pe-8 ps-2`,
  indicator `right-2`→`end-2`; `ui/dialog.jsx` close button `right-4`→`end-4`,
  header `sm:text-left`→`sm:text-start`; `ui/field.jsx` list `ml-4`→`ms-4`.
- The **reopen confirm word** is now translatable (`reopen.confirmWord`: "Reopen"
  / "פתיחה"); the input compares against the localised word (trimmed).

**Verified in the browser (mock data), Hebrew + English, desktop + 375 px:**
Dashboard (list, filters, dropdown-open checkmark side, empty/no-match, error
state), DocumentDetail (fields, deadline bidi, status pill, both review actions
+ success message), Upload (idle, reject, processing, F3 result), Archive +
Reopen modal end-to-end, language toggle with no reload + localStorage persist,
`<html dir/lang>` flipping, no console warnings, no missing i18n keys.
Also confirmed against the **real backend** — a real Hebrew `summary` from the
pipeline renders correctly RTL in a Dashboard card.

### Part 2 — Hebrew extraction findings (test-and-report)

Ran `test-hebrew-invoice.txt`, `test-hebrew-service-request.pdf`,
`test-hebrew-maintenance.docx` through the live `/process-document` **3× each**
(+ an English spot-check, `test_doc_7_normal_txt.txt` — no regression). The
English files the prompt named (`test-invoice.txt` etc.) are not in `test-files/`;
only the Hebrew trio + the old `test_doc_*` set are.

- **Reading order: fine.** Every Hebrew field, every run, every file type — no
  reversed or word-scrambled Hebrew. n8n's PDF/DOCX/TXT extractors handle RTL.
  (Local `pdftotext` *did* fail on the PDF — that was my tool, not n8n.)
- **Mojibake: none.** All Hebrew stored as clean UTF-8 in the Sheet.
- **PDF: minor artifact** — collapsed spaces in dense Hebrew lines
  ("9בספטמבר2026"), inconsistent between runs. Cosmetic.
- **Summary language: English-biased** — 5 of 8 Hebrew rows got an English
  summary (prompt has no language rule).
- **Deadline verbatim: not honoured for the .txt invoice** — "20 בספטמבר 2026"
  → "September 20, 2026" on all 3 runs.
- **Urgency false positive: real, intermittent** — the non-urgent Hebrew invoice
  ("אין דחיפות מיוחדת") was marked **Medium** on 1 of 3 runs (Low on the other
  2). Cause: "Medium when there is a deadline" + no rule to respect an explicit
  "not urgent" + `OpenAI Chat Model` at default temperature.
- **Urgency true positives: reliable** — both genuinely-urgent Hebrew docs → High
  every run.
- **Flaky 500 + duplicate rows (biggest issue):** `.txt` and `.pdf` returned
  `EXTRACTION_FAILED` on ~2 of 3 tries **but still wrote the Sheet row**. The
  `Create Deadline Urgent Event` (Google Calendar) node runs parallel to
  `Append row in sheet`, has no error handling, and throws on a malformed
  `deadline_iso` (Hebrew relative dates make that more likely) — failing the
  whole request after the row exists → user re-uploads → dup.

Full recommendations + the **exact replacement System Prompt and attribute
descriptions for the `Information Extractor` node**, plus the calendar /
temperature config fixes, are in **`n8n-hebrew-fixes.md`** at the repo root.
Nothing in n8n was changed.

### Corrections needed:

(to be filled in by hand after testing)

---

## Entry 12 — Hebrew extraction re-test after manual n8n fixes (2026-09-09)

Report-only re-test after you applied (in the n8n UI): new System Prompt
Template, tightened `deadline`/`deadline_iso` descriptions, OpenAI temperature 0,
`Create Deadline Urgent Event` -> On Error: Continue. Nothing in n8n changed by
this test. Full report: **`n8n-hebrew-retest.md`**.

- **Hebrew PDF (`test-hebrew-service-request.pdf`): fully fixed.** 3/3 HTTP 200,
  Hebrew summary + action, verbatim Hebrew deadline, High urgency, correct sender,
  1 row/upload. Rows: exec-1026, 1057, 1067.
- **Hebrew DOCX (`test-hebrew-maintenance.docx`): mostly fixed.** 4/4 HTTP 200,
  verbatim Hebrew deadline, High, correct sender, 1 row/upload. But summary came
  back **English on 2 of 4 runs** - language rule not yet reliable for the DOCX
  path (text arrives via Drive export). Rows: exec-1028, 1059, 1063, 1065.
- **Hebrew TXT (`test-hebrew-invoice.txt`): still broken, different bug.**
  HTTP 500 `EXTRACTION_FAILED` on **8/8** attempts, **orphan Sheet row every
  time** (exec-1024, 1033, 1035, 1039, 1041, 1043, 1052, 1055). Extraction is
  now good (Low urgency, verbatim "20 בספטמבר 2026", sender ok) - the throw is
  downstream. High-confidence cause: **`Build Response`** builds `fields` as a
  hand-written JSON string via raw `"{{ }}"` interpolation, and this doc's Hebrew
  always contains a literal `"` (בע"מ, ש"ח) -> invalid JSON -> Set node throws
  *after* the row is written. Not TXT-specific - any Hebrew doc with a `"` in an
  extracted field would fail; PDF/DOCX just happen to have none. Fix: escape /
  `JSON.stringify` the interpolated values in `Build Response`.
- **English spot-check (`test_doc_1_invoice.pdf`): no regression.** 2/2 HTTP 200,
  English extraction intact, sender = issuer not recipient, High (defensible).
- **`test-files/` = 13 files:** Hebrew trio + `test_doc_1..10`. The named English
  trio (`test-invoice.txt` etc.) is **not in this repo and never was**. Reconcile
  by re-adding + committing if you have them.
- **Sheet: 36 rows, needs pruning again.**

---

## Entry 13 — Hebrew re-test follow-up: root-caused the TXT 500 (2026-09-09)

Report-only. Full paste-ready text in **`n8n-followup-fixes.md`**.

- **The `test-hebrew-invoice.txt` 500 is root-caused and CONFIRMED.** Not
  Hebrew-specific, not `.txt`-specific: **any** document whose extracted text
  contains a literal `"` fails. Proven by uploading a plain English `.txt` with
  `Barnes "Best Value" Office Supplies Ltd` as the sender -> identical HTTP 500 +
  orphan row (exec-1072). Node: **`Build Response`** (Edit Fields/Set v3.5) in
  `Doc Assistant - Process Document`, assignment **`fields`** (type Object) -
  builds JSON by raw string interpolation, so a `"` in `בע"מ`/`ש"ח`/a company
  name makes invalid JSON -> `JSON.parse` throws -> 500, after `Append row in
  sheet` already wrote the row. (Confirmed by static trace of the workflow
  export + the probe; no n8n API access - only the webhook secret.)
- **Fix (documented, not applied):** replace the `fields` value with an
  object-literal expression `={{ ({ "document_type": $json["Document Type"], … }) }}`
  (keep Type = Object). Alt: wrap each value in `JSON.stringify(… ?? "")`.
- **DOCX English-summary flakiness fix (documented, not applied):** language-prefix
  the Information Extractor `Text` field with
  `Document language: {{ /[֐-׿]/.test($json.text) ? 'Hebrew' : 'English' }}`.
- **Sheet cleanup list** (scoped to exec-1024–exec-1072 only): keep exec-1052
  (txt), exec-1026 (pdf), exec-1063 (docx), exec-1030 (English pdf); delete the
  other 17 listed rows. Older rows <= exec-1023 untouched.

---

## Entry 14 — CSV export on Dashboard + Archive (2026-09-10)

Client-only feature. No proxy / n8n / Sheets changes.

**New:** `client/src/utils/csvExport.js` — shared utility. `toCsv(rows, columns)`
(pure, returns text with a `\uFEFF` BOM, CRLF, RFC-4180 quote-escaping),
`toCsvBlob`, `downloadCsv(filename, rows, columns)` (object URL -> temp `<a>` ->
revoke), `exportDateStamp()`, and `DOCUMENT_CSV_COLUMNS` (the 12-column spec:
Document ID, File Name, Document Type, Department, Urgency, Deadline, Status,
Reviewed By, Review Note, Submitted By, Received At, Summary — no row_number /
deadline_iso / File Link).

**Changed:**
- `client/src/screens/Dashboard.jsx` — "Export CSV" button, top-right of the
  header (mirrors DocumentCard's `flex items-start justify-between`). Exports
  `visible` (filters + search + status filter + sort already applied). Disabled
  when `visible.length === 0`. Filename `documents-export-YYYY-MM-DD.csv`.
- `client/src/screens/Archive.jsx` — "Export CSV — Archive" button, same
  placement. Exports `visible` (search applied; status always Reviewed).
  Disabled when empty. Filename `archive-export-YYYY-MM-DD.csv`.
- `client/src/locales/en.json` + `he.json` — `common.exportCsv`
  ("Export CSV" / "ייצוא CSV"), `archive.exportCsv`
  ("Export CSV — Archive" / "ייצוא CSV — ארכיון"). 103 keys each, parity checked.

**Decisions / notes:**
- Cell values are the canonical row values (not localised) — Status exports as
  `Processed`/`Needs Review`/`Reviewed`, not `מעובד/...`. Headers stay English.
  Keeps the file stable for sorting/pivoting regardless of UI language.
- `Submitted By` column is always empty: GET /documents (CONTRACT.md §4) does not
  return `submitted_by`. Column kept for the requested order; will populate if
  the backend ever adds the field.
- Verified in-browser (EN + HE/RTL, both screens): BOM bytes `EF BB BF`,
  CRLF-only, exact 12-col header, row count == visible count, filter-respecting,
  disabled at 0 rows, Hebrew round-trips, embedded `"` doubled, embedded comma
  quoted. `npm run build` passes.

---

## Entry 15 — Login + role-based access control (Section 15) (2026-09-10)

**Prompt:** Add login + RBAC to the client + proxy. Username/password, bcrypt
hashes (never store/log/return plaintext), one Admin seeded from `server/.env`
on first run. Three roles — Admin (all + user management), Submitter (all
document actions), Viewer (read-only). JWT in an httpOnly cookie (not the body,
not localStorage), 8h expiry, proxy re-checks auth + role on every request so an
Admin's role change lands on the user's next request without a forced logout.
Gate routes/UI client-side AND server-side (direct API call by a disallowed role
-> clear 403). Admin user-management screen. EN/HE i18n incl. the login screen,
RTL verified there too. Test against real behaviour, not just eyeballing. Pick
the user store and explain the tradeoff. Build as its own commit, after
committing the pre-existing uncommitted Part 1 i18n/RTL layer separately.

**What was built:**
- **Storage:** local `server/users.json` (git-ignored) — `{ users: [{ id,
  username, passwordHash, role, createdAt }] }`, atomic temp-write + rename,
  in-process write serialization. Chosen over Google Sheets (the proxy has no
  Google credentials — n8n owns that integration; adding them here just for a
  user table roughly doubles the auth surface + adds per-login latency) and over
  SQLite (native build + migrations, overkill for a handful of users).
- `server/users.js` — the store, `bcryptjs` (cost 10), input validation,
  `publicUser()` (the only shape that leaves the module — no `passwordHash`
  ever), first-boot seed, self-guards.
- `server/auth.js` — `signSession` (8h JWT), `authRequired` (verify cookie ->
  **re-load the user from the store** so the role is always fresh),
  `requireRole(...)` -> 403 `{ error_code: "FORBIDDEN" }`.
- `server/index.js` — `POST /auth/login` (sets `so_session` httpOnly SameSite=Lax
  cookie, `Secure` in production; returns `{ user }` only, never a token),
  `POST /auth/logout`, `GET /auth/me`, and Admin-only `GET/POST /auth/users` +
  `PATCH/DELETE /auth/users/:id`. Proxy gates: `/api/documents` any signed-in
  role; `/api/process` + `/api/review` need Admin|Submitter. The three
  near-identical n8n handlers were folded into one `forwardToN8n()` helper. CORS
  is now `cors({ origin: CLIENT_ORIGIN, credentials: true })` — a credentialed
  cookie forbids `*`.
- **Client:** `src/auth/AuthContext.jsx` (`{ user, loading, login, logout }`,
  probes `/auth/me` on mount and re-syncs on every navigation),
  `src/auth/permissions.js` (`can(role, action)`), `src/api/auth.js`,
  `src/api/session.js` (a 1-function bridge so a 401 from the fetch layer clears
  the user), `screens/Login.jsx`, `screens/Users.jsx`. `App.jsx`: loading ->
  spinner, no user -> `<Login/>`, user -> role-gated nav + routes + a header chip
  (`username . role`) + Sign out. `main.jsx`: `<AuthProvider>` inside the Router,
  `<DocumentsProvider>` moved into App's authenticated subtree so it never fires
  an anonymous request. Viewer -> no Upload nav / Review card / Reopen button;
  Submitter -> no Users nav; disallowed routes redirect to `/`. `submitted_by` /
  `reviewed_by` now carry the signed-in username instead of `"app-user"`.
- New server env (added to `server/.env.example` only — Yoni adds the real
  values himself): `JWT_SECRET`, `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`,
  `CLIENT_ORIGIN`, `NODE_ENV`. New deps: `bcryptjs`, `jsonwebtoken`,
  `cookie-parser`.
- EN + HE locale keys added: `auth.*`, `users.*`, `nav.users`, `errors.FORBIDDEN`
  / `errors.UNAUTHENTICATED` (132 keys each, parity checked). Role display labels
  are localised; the role *values* are not (same rule as status/urgency).
- `auth-and-roles.md` at the repo root — build notes with the "why" behind each
  choice.

**Decisions / notes:**
- **Session mechanism:** the role in the JWT is ignored for authorization —
  `authRequired` re-reads the user from the store on every request, so an Admin
  changing someone's role takes effect on that user's very next request, no
  re-login. A deleted user's still-valid token stops working immediately.
- **Self-guards, all explicit:** can't change your own role — **self-demotion is
  blocked outright** (consistent with can't-delete-self and can't-remove-last-
  Admin, and keeps "Admin is managed outside the UI" uniform); can't delete your
  own account; can't remove the last Admin; can't grant or change an Admin role
  from the UI (seed- or `users.json`-only). Your own row in the Users screen
  shows a `(you)` marker with no role dropdown and no Remove button. Through the
  UI a role only moves Submitter <-> Viewer.
- CSV export stays available to Viewers — it only exports data they can already
  see.
- The pre-existing uncommitted Part 1 i18n/RTL layer was committed first on its
  own (`ed12e86`) before this feature, per the earlier "i18n first, then the
  feature" decision.
- **Testing (the acceptance checklist):** throwaway `server/_rbac_test.mjs` —
  **43/43** API assertions: login ok / wrong password / unknown user;
  token-not-in-body; HttpOnly + 8h Max-Age; every proxy route 401 for anon;
  per-role 403 on direct calls (Viewer on writes + admin routes, Submitter on
  admin routes); expired / garbage / wrong-signature token -> 401 + cookie
  cleared; add/remove user, 409 duplicate, 400 short password, 400 role=Admin;
  every self-guard; **mid-session demotion -> the same session's next
  `/api/review` is 403 and `/auth/me` reports the new role, no re-login**;
  logout invalidates. Browser walk-through: all three roles' nav / route /
  control gating in EN and HE/RTL; a dynamic demotion reflected on the next
  navigation; the Hebrew user-management screen end-to-end (add -> change role ->
  remove, each with its Hebrew toast). The test proxy ran with
  `--env-file .env --env-file <scratchpad>/auth.env` (multiple `--env-file`
  flags merge) — `server/.env` was never touched. Test script and the test
  `server/users.json` were deleted afterwards so the first real run re-seeds
  cleanly.
- Commit `15a7e5d`. Follow-up `a4b53f2` fixed a `res.clearCookie` deprecation
  warning surfaced in the test server log: split the cookie options —
  `sessionCookieOptions()` keeps `maxAge` for `res.cookie()`, new
  `clearCookieOptions()` omits it for `res.clearCookie()` (deprecated on Express
  4, ignored on Express 5).

---

## Entry 16 — Two-tier app header (2026-09-10)

**Prompt:** Restructure the single crowded header row into two tiers — a top
utility row (smaller/muted: username + role, language toggle, Sign out;
right-aligned in LTR, mirrors to left in RTL following the pattern used
elsewhere) and a main nav row below (Smart Office wordmark + Dashboard / Archive
/ Upload / Users, Users still Admin-only). Apply across every screen that shows
the header. Verify EN/LTR, HE/RTL (the main reason — currently very tight on one
line), that active-nav highlighting still works in the main row, and no layout
break on the Users screen (busiest header today). Cosmetic only — header
component + CSS, no auth/routing/backend changes. Own commit.

**What was built:**
- `client/src/App.jsx` only. The `<header>` renders once for all authenticated
  routes, so one change covers Dashboard, Archive, Upload, Users and
  DocumentDetail.
- Tier 1: full-width `border-b border-border/60`, `text-xs`, `size="xs"` ghost
  buttons. The cluster is `ms-auto flex flex-wrap items-center justify-end` — it
  parks at the inline-end (right in LTR, left in RTL) and wraps gracefully. The
  role is now a small `rounded-full bg-muted` pill beside the username (was
  plain "· Admin" text that was hidden on mobile — now always shown, in its own
  row).
- Tier 2: wordmark + `<nav>`, both `flex-wrap`, `max-w-4xl`. The `navLink`
  active-highlight function is unchanged.
- No CSS file — Tailwind utilities inline, consistent with the rest of the app.
  No new env vars.

**Decisions / notes:**
- RTL handled with logical `ms-auto` + `justify-end`, the same pattern used
  across the app — a real mirror, not just a flip.
- Both tiers are `max-w-4xl` and wrap independently, so nothing collides at
  375px.
- Verified: EN/LTR + HE/RTL at desktop and 375px; active highlight on the nav
  row (Dashboard and Users); Users screen has room in both languages; Submitter
  (no Users) and Viewer (no Upload/Users) navs unchanged. `npm run build` passes.
- Commit `cb1ba75`.

---

## Entry 17 — README documentation pass (2026-09-10)

**Prompt:** After login/roles is built and verified, do a single focused README
pass as its own commit (after the feature + header commits): add an
"Authentication & roles" section; backfill CSV export and Hebrew/RTL (both built
after the README was drafted, undocumented); audit the app against SPEC.md's 8
features for anything else missing and report findings before writing them in;
update the architecture diagram only if the auth step is worth reflecting, keep
it simple; add anything worth flagging to Known limitations.

**What was built:** `README.md` only — commit `229f6da`.
- **Audit reported first, all flagged items approved.** Findings: README claimed
  "No authentication/roles layer" (false now); listed login/roles + CSV +
  Hebrew/RTL as "out of scope" (all three built); the six n8n workflow filenames
  were stale (renamed to `Project Part 1/2 -` in `1698e56`); the Dashboard <->
  Archive status routing + Reopen and the three per-endpoint mock flags were
  undocumented; the README had no feature list at all.
- New sections: **Features** (F1–F8 table), **Authentication & roles** (roles
  table, login / httpOnly-cookie / 8h-session flow, the first-Admin seed + new
  env vars + deps, the `users.json` store), **Documents: Dashboard, Archive &
  Reopen** (which `status` goes where; what Reopen does), **Hebrew & RTL
  support** (toggle, what's translated, RTL behaviour, and that *document
  extraction* — not just the UI — handles Hebrew), **CSV export** (visible rows
  only, the column set, the UTF-8 BOM for Excel).
- Fixes: architecture blurb + diagram note the proxy's auth check (kept minimal
  — one line, prose carries the rest); the proxy-routes table gains a "who can
  call it" column and the auth routes; Setup lists the new env vars + deps and
  that the app now opens on a login screen; the mock-mode paragraph spells out
  the three `VITE_USE_MOCK_*` switches; workflow filenames corrected. **Known
  limitations** rewritten for the auth model (no password reset, no
  self-registration, fixed 8h session, single-instance user store, no login
  rate-limiting); the "no auth" and "out of scope" bullets removed.

**Decisions / notes:**
- README kept setup-focused in tone; the Features table is a compact reference,
  not a walkthrough.
- Architecture diagram change was deliberately minimal per "keep it simple".
- Four untracked `Evidence/Screenshots/` PNGs (Admin user views, EN + HE)
  appeared during review — not part of this pass, left untracked.

---

## Entry 18 — Multi-file upload (2026-09-10)

**Prompt:** Add multi-file upload to the Upload screen — multi-select + drag-drop
of several files at once, uploaded sequentially, with a per-file progress list.
Cap 10 per batch (reject the excess with a clear message — keep-first-10 or
reject-whole was my call). Existing per-file validation (PDF/DOCX/TXT, size) still
applies to each file; an invalid file shows as immediately failed in the list and
does not block the others. Sequential: one file at a time, next starts only after
the current finishes (success or failure). Per-file rows: Queued -> Processing ->
Success / Failed / Invalid, never one overall bar; a success row keeps the F3
result detail (7 fields + urgency badge + file link) via link/expand. Each failed
row gets its own Retry (only that file, doesn't disturb succeeded rows); a failure
never blocks the rest of the queue. Role gating unchanged (Admin/Submitter only,
Viewer can't reach it). EN + HE strings, verify the per-file list in RTL. Test a
3–5 file success batch, an invalid-in-batch, a server failure + retry, 11-file
cap, Hebrew/RTL, Viewer redirect. Client-only — proxy/n8n already do one file per
request. Own single commit.

**What was built:** commit `c5c37cd`. Full detail in **`multi-file-upload.md`**.

- `client/src/screens/Upload.jsx` rewritten around a queue: `items: [{ id, file,
  status, error?, result? }]` (`invalid | queued | processing | success |
  failed`) driven by one `useEffect` runner that takes the first `queued`,
  uploads it via the **existing** `processDocument()`, records the outcome, then
  re-runs for the next. A `runningRef` guards a parallel start + React 18
  StrictMode's double effect invoke. Single upload is now just a batch of one —
  the old single-file "big result card" is gone.
- `client/src/components/UploadItem.jsx` (new) — one queue row: status icon,
  filename, size, state label, Retry (failed) / Remove (queued|invalid). A
  `success` row is an `aria-expanded` disclosure -> `FieldList` + file link +
  `/document/:id` link, so the F3 detail survives.
- `client/src/constants.js` — `MAX_BATCH_FILES = 10` (UI guard, not env).
- Over-limit **rejects the whole selection** ("Select at most 10 files at once.
  Nothing was added — remove some first.") — no ambiguity over which 10 survived.
  Invalid files become `invalid` rows shown inline (never silently dropped),
  skipped by the runner. Retry re-queues only that row; the batch auto-continues
  past a failure.
- i18n: `upload.*` reworked in both locales, dead single-file keys removed (141
  keys each, parity checked).

**Decisions / notes:**
- **i18n plural bug found + fixed.** The "Send N" button first used i18next
  plural keys `sendCount_one` / `sendCount_other`. Hebrew `count: 2` is CLDR
  category **`two`**; with no `sendCount_two` key i18next dropped through
  `fallbackLng` to `en.sendCount_other`, so the Hebrew UI showed "Send 2 files".
  Replaced with two plain keys (`upload.sendOne` / `upload.sendMany`) chosen in
  JS (`count === 1 ? … : …`) — no CLDR categories, identical in both languages.
  (The pre-existing `common.count_*` keys have the same latent issue, only
  visible at exactly 2 / 10 / … documents.)
- **RTL:** status icon at the inline-start, Retry/Remove at the inline-end,
  reason/error line `ps-7` so it indents from the correct side, rotating
  `ChevronDown` for the disclosure (no direction to flip). Verified in Hebrew for
  every row state + an expanded result.
- **Test results (§7), against a real n8n backend on an isolated proxy —
  `server/.env` never touched:** 3 mixed-type files sequential (Queued ->
  Processing -> Done one at a time, header "N of M processed"); an invalid
  `archive.zip` in the batch showed Invalid immediately, no request, others
  proceeded; a mid-queue failure (simulated `EXTRACTION_FAILED`) — failed row got
  its reason + Retry and **the next file still processed automatically**; Retry
  re-ran only that row, siblings untouched, succeeded once the fault was cleared;
  11 files -> nothing added + message, exactly 10 accepted, 10+1 rejected;
  Hebrew/RTL full batch list with all five states + an expanded result; Viewer
  `/upload` still redirects to `/` and the nav item stays hidden. `npm run build`
  passes.

---

## Entry 19 — Two n8n workflow fixes found during multi-file testing (2026-09-10)

Report-only. Both fixes were found during hands-on multi-file upload testing and
applied **directly in the n8n UI** (not via Claude Code). They are already live —
nothing to change in the repo, this entry just records what was found and fixed.

- **`Doc Assistant - Process Document` — Telegram node error-cascade.** The
  `Urgent Telegram Notification` node was intermittently throwing
  "Bad request — please check your parameters". With no error handling on it, one
  failed Telegram send made the **whole execution report as Error** even though
  `Append row in sheet` had already run — so the client saw a failure, retried,
  and got an **orphan / duplicate Sheet row**. Fixed: **On Error -> Continue** on
  that node (same pattern as the earlier `Create Deadline Urgent Event` calendar
  fix in `n8n-hebrew-fixes.md §3.1`).
- **`Document Assistant - Get Documents` — zero-row halt.** When the Sheet had no
  data rows (fresh or freshly cleared), `Get row(s) in sheet` emitted zero items,
  and n8n **skips every downstream node — including `Respond to Webhook` — when a
  node gets zero input**. The execution still showed "Succeeded" (misleading),
  but the client got an empty/invalid body and the Dashboard/Archive showed a
  "not valid JSON" error. Fixed: **Always Output Data** on that node (same
  setting already used on Workflow C's `Find Document Row`).

Both are the same class of bug — an n8n node that fails or emits nothing silently
kills the rest of the chain. Real multi-file / empty-Sheet testing surfaced edge
cases that single-item happy-path testing never hits.
