# Multi-file upload — build notes

Key decisions and non-obvious bits from adding a multi-file batch to the Upload
screen. To be folded into README + PROMPTS.md as a separate step.

---

## 1. Scope: a client-side queue, no backend change

The proxy and n8n already process exactly one file per request. Multi-upload is
pure client orchestration: the Upload screen builds a list of files and calls the
**existing** `processDocument()` once per file, in sequence. Nothing in
`server/` or n8n changed.

## 2. Single and multi are the same code path

There is no separate "one file" flow any more. A single upload is a batch of one
— one row in the queue that you expand to see the F3 result. This avoids two
parallel state machines. The old single-file "big result card" is gone; its
content (7 fields + urgency badge + file link + a link to `/document/:id`) now
lives in the expandable row.

## 3. The sequential runner

`Upload.jsx` holds `items: [{ id, file, status, error?, result? }]` with
`status ∈ invalid | queued | processing | success | failed`.

A single `useEffect([items, started, …])` drives it:

- if `started` and nothing is `processing` and something is `queued`, take the
  first queued item, mark it `processing`, upload it, record `success` / `failed`,
  then the state change re-runs the effect and it takes the next.
- `runningRef` (a `useRef` boolean) guards against a parallel start **and** React
  18 StrictMode's double-invoke of the effect. It is cleared *before* the final
  `setItems`, so that state update is what re-triggers the effect to pick the
  next file.
- The in-flight `processDocument` promise is never cancelled by unrelated state
  changes (e.g. removing a different queued row) — the async closure only ever
  writes back to its own `item.id`.

Consequences that fall out for free:
- **Sequential** — only one `processing` at a time, by construction.
- **A failure never blocks the queue** — `failed` is just another terminal state;
  the effect keeps going to the next `queued`.
- **Retry** — set a `failed` (or its `error`/`result`) row back to `queued`;
  `started` is already true, so the effect picks it up. Retrying touches only
  that row; `success` rows are never re-read.
- **Add files mid-batch** — a drop while the runner is live just appends `queued`
  rows; the effect drains them too.

## 4. Decisions where the brief said "your call"

- **Over-limit (> 10 files): reject the whole selection.** Dropping/selecting 11+
  adds *nothing* and shows "Select at most 10 files at once. Nothing was added —
  remove some first." Silently keeping "the first 10" leaves the user guessing
  which 10 survived (drop order isn't meaningful). The cap counts **all** rows
  currently in the list (including `invalid` ones) — remove some to make room.
- **Per-file result detail: an inline disclosure.** A `success` row is a
  `<button aria-expanded>` — click to expand `FieldList` (the same component
  DocumentDetail uses) plus the file link and an "Open detail view" link. The
  batch list itself stays one compact row per file. Nothing is lost vs. the old
  single-file result view.
- **Cap value:** `MAX_BATCH_FILES = 10` in `constants.js` (not env-configurable —
  it's a UI guard, not a real limit).

## 5. Validation

Each file is validated (`ACCEPTED_TYPES`, `MAX_FILE_BYTES`) the moment it enters
the list. A bad file becomes an `invalid` row immediately with its reason
(`upload.errUnsupported` / `upload.errTooBig`) shown inline — it is **in the
list, not silently dropped**, never sends a request, and doesn't count toward the
"Send N" button. The runner skips straight over `invalid` rows.

## 6. i18n / RTL

New `upload.*` keys in both locales; dead single-file keys removed (`dropzone`,
`hintSize`, `selectedLabel`, `send`, `doneTitle`, `doneNotified`,
`doneNotNotified`). 141 keys each, parity checked.

**Plural gotcha (fixed):** the "Send N files" button first used i18next plural
keys `sendCount_one` / `sendCount_other`. That silently fell back to English for
Hebrew whenever `count` resolved to a CLDR category with no key — Hebrew `count:2`
is category **`two`**, and `sendCount_two` didn't exist, so i18next dropped
through `fallbackLng` to `en.sendCount_other` → the Hebrew UI showed
"Send 2 files". Replaced with two plain keys, `upload.sendOne` and
`upload.sendMany`, selected in JS (`count === 1 ? … : …`). No CLDR categories,
works identically in both languages. (The pre-existing `common.count_*` keys have
the same latent issue but only bite at exactly 2 / 10 / … documents.)

**Row layout in RTL** (`components/UploadItem.jsx`): status icon at the
inline-start (right in RTL), filename `dir="auto"` + `text-start`, size `dir="ltr"`,
status label, then Retry / Remove at the inline-end (left in RTL). The invalid /
failure reason line uses `ps-7` so it indents from the correct side under the
icon. The expand chevron is a rotating `ChevronDown` (vertical — no direction to
flip). Verified in-browser: queued / processing / done / failed / invalid rows
and an expanded result all read correctly in Hebrew.

## 7. Testing done (§7)

Against a real n8n backend on an isolated proxy (`USERS_FILE` + `PORT` overrides,
`--env-file .env --env-file <scratch>` — `server/.env` never touched):

- **3 mixed files (txt/pdf/docx), sequential:** each goes Queued → Processing →
  Done one at a time; header shows "N of M processed"; the alert names the
  current file. (One run had the docx genuinely fail at n8n — which also
  exercised the failure path — a later clean run had all three Done.)
- **Invalid in the batch:** `archive.zip` → Invalid immediately, no request, the
  other three still processed. Runner skipped it.
- **Failure in the middle:** good → (simulated `EXTRACTION_FAILED`) → good; the
  failed row got its reason + Retry, and **the third file still processed
  automatically**.
- **Retry:** re-ran only the failed row (siblings stayed Done); failed again
  while the fault was injected, succeeded once removed.
- **Cap:** 11 files → nothing added + message; exactly 10 → accepted; 10 then 1
  more → rejected.
- **Hebrew/RTL:** full batch list with all five row states + an expanded result.
- **Viewer:** `/upload` still redirects to `/` and the Upload nav item is still
  hidden.

## 8. Files

- `client/src/screens/Upload.jsx` — rewritten around the queue + runner
- `client/src/components/UploadItem.jsx` — new; one queue row (states, retry,
  remove, expandable result)
- `client/src/constants.js` — `MAX_BATCH_FILES`
- `client/src/locales/{en,he}.json` — `upload.*` rework

## 9. Not done / out of scope

- No parallelism knob — always strictly one at a time (the brief's requirement).
- No "cancel a running batch" button — you can Clear all once it settles, or
  remove still-queued rows while it runs, but the in-flight file always finishes.
- No drag-to-reorder the queue.
