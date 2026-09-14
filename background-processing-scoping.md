# Scoping: instant ack + background processing + polling

Investigation only — **nothing built, nothing changed** in `server/`, `client/`,
`workflows/`, or the live n8n instance. This file is uncommitted; it exists so
the plan and evidence are written down before any decision is made.

---

## 1. Feasibility verdict: **YES**, with evidence, not assumption

n8n's Webhook node has three response modes. The one this needs —
**"Using 'Respond to Webhook' Node"** — is not a hypothetical; it is **already
the configured mode on the live workflow**:

```json
// workflows/Project Part 2 - Document Assistant - Upload Endpoint.json
"Webhook": { "parameters": { "responseMode": "responseNode", ... } }
```

In this mode, n8n does **not** wait for the workflow to finish — it waits for
*any* `Respond to Webhook` node to execute, sends the HTTP response at that
instant, and **the rest of the node graph keeps executing afterward**, detached
from the HTTP request. This is exactly the "respond early, keep running"
behavior asked for, and it's n8n's documented, ordinary way of using this
response mode — not an edge case or a hack.

Today the three `Respond to Webhook - *` nodes sit at the very **end** of the
chain (after the `Execute Workflow` call to `Process Document` and its ~90s of
work), so the response is effectively synchronous even though the plumbing for
an early response already exists. **The fix is structural, not a new n8n
capability**: move a `Respond to Webhook` node to fire right after the document
ID is minted and *before* the slow work, and let everything downstream —
including the `Execute Workflow` call — continue running in the background.

### What I could NOT verify (say so, don't guess)

- **Whether `Execute Workflow` (v1.3, used here) exposes a "Wait For
  Sub-Workflow Completion" toggle.** Newer n8n versions have this option; I
  can't confirm it exists at this typeVersion without opening the node in the
  n8n UI. **It doesn't matter for feasibility** — the architecture below doesn't
  depend on it (the parent already responded before reaching that node, so
  whether the node call is "sync-but-nobody's-waiting" or "detached" is
  irrelevant to the client). It's a possible minor optimization to check for,
  not a requirement.
- **Whether a second `Respond to Webhook` node executing after the first one
  already responded, in the same execution, throws an error or is silently
  ignored.** I'd want to test this once, live, before deleting anything. It only
  affects how the *old* end-of-chain Success/Error/Empty-Document respond nodes
  get retired (see §3) — worst case they get replaced with plain data-writing
  nodes instead of just deleted, which is the structurally correct move anyway
  once the row-write model changes (§3).
- **n8n Cloud plan-specific execution/timeout limits** on this specific
  instance (`ymworkflows.app.n8n.cloud`). Long detached background executions
  are an ordinary pattern on n8n Cloud, but exact caps vary by plan tier and I
  have no way to query this account's plan from here. Worth a two-minute check
  in n8n's own Settings before building.

Everything else below is grounded in the actual exported workflow JSON in this
repo, not general n8n folklore.

---

## 2. Proposed architecture

### Today (synchronous)

```
Client → POST /api/process → n8n Upload Endpoint
                                 validate mimeType
                                 upload file to Drive
                                 Execute Workflow → Process Document (~90s):
                                     extract → Information Extractor
                                     Append row (Status: Processed)
                                     notifications, calendar
                                 ← returns here, ~90s later
                              ← client gets the full result
```

### Proposed (instant ack + background + poll)

```
Client → POST /api/process → n8n Upload Endpoint
                                 validate mimeType (still instant, unchanged)
                                 upload file to Drive
                                 mint document_id (moved here, see below)
                                 Append PLACEHOLDER row (Status: Processing)
                                 Respond to Webhook  ← fires HERE, fast
                              ← client gets { status: "processing", document_id } in ~1-2s
                                 [n8n keeps running, detached from the HTTP request]
                                 Execute Workflow → Process Document (~90s):
                                     extract → Information Extractor
                                     look up the placeholder row by Document ID
                                     UPDATE that row (Status: Processed | Failed)
                                     notifications, calendar
Client polls GET /api/documents (or a new endpoint) → sees the row flip from
Processing → Processed/Failed → stops polling
```

### Why `document_id` has to move

Today `Generate Doc ID` lives **inside** `Process Document` and computes
`'exec-' + $execution.id` — the sub-workflow's *own* execution ID. That ID
doesn't exist yet at the moment `Upload Endpoint` needs to respond, because the
sub-workflow hasn't started. So ID generation has to move to `Upload Endpoint`
(computed as `'exec-' + $execution.id` of the *parent* execution instead) and be
passed into `Process Document` as a new `workflowInputs` field, the same way
`file_name` / `file_link` / `mimeType` / `submitted_by` already are.

n8n execution IDs are unique across the whole instance (not per-workflow), so
switching which execution's ID backs the `exec-<n>` string is safe — still
unique, still the same `exec-` format everything already keys off (Sheet rows,
`/document/:id` routes, CSV export). The only visible change is that the
numbers will look different from before (they'll track Upload Endpoint's
execution counter instead of Process Document's) — cosmetic, not a compatibility
break.

---

## 3. File-by-file plan

### n8n — `Document Assistant - Upload Endpoint` (parent workflow)

| Change | Detail |
|---|---|
| Move `Generate Doc ID` here | New `Set` node right after `Validate mimeType` passes / before `Upload file`. Same expression style: `document_id = 'exec-' + $execution.id`. |
| New: **Append placeholder row** | Google Sheets node, `operation: append`, same target sheet as today's `Append row in sheet`. Columns: `Document ID`, `File Name`, `Received At`, `File Link`, `Status: "Processing"`, everything else blank. Mirrors the existing `Append row in sheet` node's config almost exactly (see `workflows/…Process Document.json`). |
| New: **Respond to Webhook — Processing** | Fires right after the placeholder row is written. Body: `{ "status": "processing", "document_id": "...", "file_name": "...", "received_at": "..." }`. This is the node whose execution triggers the early HTTP response (§1). |
| `Execute Workflow` call | Unchanged shape, plus one new input field: `document_id` (from the new `Generate Doc ID` node). Runs **after** the response has already gone out. |
| Old `Respond to Webhook - Success` / `- Extraction Failed` / `- Empty Document` | **Retired.** Their job (telling the client the outcome) no longer happens here — the outcome is now a Sheet-row update, discovered by polling. Structurally these become dead ends unless repurposed; simplest is to delete them once the "does a second Respond node error" question (§1) is settled — if it turns out to be harmless to leave stray unreached nodes, deleting is still cleaner and avoids confusion for whoever edits this workflow later. |
| `Validate mimeType`'s existing error branch | **Unchanged.** `UNSUPPORTED_FILE_TYPE` is detected before any of this and can still respond synchronously and instantly — no reason to make an already-instant rejection async. |

### n8n — `Doc Assistant - Process Document` (sub-workflow)

| Change | Detail |
|---|---|
| Remove `Generate Doc ID` | Superseded — `document_id` now arrives as a workflow input from the parent. Every downstream `{{ $('Generate Doc ID').item.json.document_id }}` expression becomes `{{ $json.document_id }}` (or whatever the trigger node exposes it as). |
| New: **Find placeholder row** | Google Sheets lookup by `Document ID`, filter-matched — **identical pattern to the existing `Find Document Row` node in `Review Endpoint`**, which already does exactly this against the same sheet. Not a new technique for this n8n account. |
| `Append row in sheet` → **Update row** | Change `operation` from `append` to `update`, matched on `row_number` (the value just obtained from the lookup above) — **identical pattern to the existing `Update Document` node in `Review Endpoint`**, which already updates rows this same way. Same field mappings as today, `Status` becomes `"Processed"` on success (unchanged meaning — still the "ingested, not yet reviewed" state, per the current README). |
| `Check Empty Extraction` logic **relocates here** | Today `Upload Endpoint` checks the result for an empty summary *after* the synchronous call returns. In the async model nothing downstream is waiting for that check, so it has to happen *inside* `Process Document`: if extraction is empty, update the row to a **new terminal status** (proposed: `Status: "Empty"` or reuse `"Failed"` with a distinguishing note — this is a decision, see §5) instead of `"Processed"`. |
| **Error handling — the substantial new piece** | If `Information Extractor`, the file-extraction nodes, or anything else throws, nothing today updates the row — it would sit at `"Processing"` forever. Needs either: (a) an **Error Workflow** (n8n's workflow-level Settings → Error Workflow, a separate workflow n8n automatically invokes on any unhandled failure, given the failed execution's data) that performs the "look up row, mark `Status: Failed`" update; or (b) per-node `On Error → Continue (using error output)` branches wired to the same "mark Failed" nodes, one per risky node. (a) is more robust (catches *any* unforeseen failure point) but is a new workflow to build; (b) is more surgical but only as good as the list of nodes I remember to wire. **This is the highest-risk, most net-new part of the whole change** — everything else above is reusing patterns already proven elsewhere in this n8n account; this one isn't. |

### Proxy (`server/index.js`)

**No change needed for the ack itself.** `POST /api/process` already forwards
whatever n8n returns, status and body verbatim (`forwardToN8n`) — it doesn't
inspect the shape. A fast `{status: "processing", document_id}` response passes
through exactly like today's full result does.

For polling, one of two paths (§4) — either **zero proxy changes** (reuse
`GET /api/documents`) or **one new route** (`GET /api/documents/:id`) if a
dedicated status endpoint is chosen.

### Client

| File | Change |
|---|---|
| `client/src/api/client.js` | `processDocument()` — no shape change needed; it already returns whatever the proxy hands back. If a dedicated status endpoint is chosen: new `getDocumentStatus(id)` function alongside it. |
| `client/src/screens/Upload.jsx` | The sequential runner's single `await processDocument(...)` becomes `await processDocument(...)` (fast ack) **then** `await pollUntilTerminal(document_id)` before applying the `success`/`failed` patch. The one-file-at-a-time queue structure doesn't need to change — see §4 for why this plugs into the existing state machine rather than replacing it. |
| `client/src/components/UploadItem.jsx` | No structural change — `processing` already renders as its own state; it just now covers "ack received, backend still working" instead of "HTTP request still open." Could optionally show elapsed time or a "still processing…" sub-label once polling has run a few cycles, but not required. |
| `client/src/constants.js` | New `REVIEW_STATUS_STYLES.Processing` (and `.Failed` if that becomes a real terminal status — §5) entries, so `StatusBadge` on the Dashboard renders them with a colour instead of falling back to the neutral default. |
| `client/src/locales/{en,he}.json` | New `status.Processing` (and `status.Failed`) labels, EN + HE. |
| `client/src/screens/Dashboard.jsx` | `ACTIVE_STATUSES` / `STATUS_RANK` need a decision: is a `"Processing"` document part of the default "active work" view (almost certainly yes — it's the most active thing there is), and where does it rank relative to `"Needs Review"`? One-line changes once decided. |
| `CONTRACT.md` | Would need new documented shapes for the ack response and the polled resource. Not edited in this pass (scoping only) — draft shapes below for reference. |

### Draft contract shapes (for review, not yet in CONTRACT.md)

```jsonc
// POST /process-document — new ack response (202-ish semantics, likely still HTTP 200
// to keep today's client error-handling path simple — flagged as a decision, §5)
{
  "status": "processing",
  "document_id": "exec-2044",
  "file_name": "invoice-4471.pdf",
  "received_at": "14/09/2026 09:03"
}
```

```jsonc
// Polling — either the existing GET /documents shape, with two new possible
// values for "status" ("Processing", and a terminal failure value), e.g.:
{
  "document_id": "exec-2044",
  "status": "Processing",       // | "Processed" | "Needs Review" | "Reviewed" | "Failed"
  "file_name": "invoice-4471.pdf",
  "received_at": "14/09/2026 09:03",
  "document_type": "Not found", // placeholder values until the update lands
  "...": "..."
}
```

---

## 4. Client polling — plugging into the existing state machine

Yesterday's multi-file build already has exactly the shape this needs:
`items: [{ id, file, status, error?, result? }]` with a `useEffect` runner that
does `processing → success|failed`, driven today by one `await
processDocument()` call resolving.

**The polling change is additive, not a rewrite**: the same runner effect
would `await processDocument(...)` (now fast), then loop `await sleep(interval);
const row = await checkStatus(document_id)` until `row.status` is terminal, then
apply the same `success`/`failed` patch it already applies today. The
`processing` UI state, the per-row layout, Retry, Remove, the expandable F3
detail on success — **none of that changes**. This is the same conclusion the
brief was steering toward, confirmed by actually reading the code: yesterday's
state machine was accidentally future-proofed for this.

**What genuinely is a design fork, not an implementation detail:**

- **Does "one file at a time" still mean anything once ack is instant?**
  Today "sequential" exists because each `processDocument()` call held a
  connection open for up to 90s and the batch waited on it. Once ack is ~1-2s,
  the batch *could* fire all N uploads back-to-back almost immediately and then
  poll all N in parallel, turning "sequential upload" into "sequential
  *submission*, concurrent *processing*." That's a materially different
  behavior (n8n now runs N executions of `Process Document` at once instead of
  one) and needs an explicit answer — see §5, decision 3.

---

## 5. Decisions needed from you before any of this is built

1. **Polling interval and back-off.** A fixed interval (e.g. every 3s)? A
   back-off (2s, 4s, 8s, …)? Faster polling = fresher UI + more `GET
   /api/documents` calls against n8n/Sheets; slower = cheaper but laggier.
2. **Polling timeout / give-up behavior.** If a document never reaches a
   terminal status (e.g. the error-handling in §3 has a gap, or a genuinely
   stuck n8n execution), what does the client do — show a "still processing,
   check back later" state after N minutes and stop polling? Keep polling
   forever? Show a client-side "timed out" state that's distinct from `Failed`
   (since the client doesn't actually know it failed, only that it gave up
   watching)? This needs a real answer; I'm not picking one.
3. **Sequential-submit-and-wait vs. sequential-submit-then-parallel-poll for
   batches** (§4). Keeping today's "one at a time, full stop" behavior is the
   lower-risk choice (less concurrent load on the n8n account, smaller behavior
   change) but gives up most of the latency win for multi-file batches
   specifically. This is very much your call, not mine.
4. **Does single-file upload get this too, or does it stay purely synchronous?**
   The brief explicitly asked me to flag this rather than assume. Given
   yesterday's build already unified single-file into "a batch of one," the
   async machinery would apply to both for free once built — the question is
   whether that's actually wanted (a single 90s synchronous wait has been fine
   so far) or whether it's not worth the added moving parts for the one-file
   case.
5. **Error-handling mechanism in Process Document**: centralized n8n **Error
   Workflow** vs. per-node **On Error → Continue** branches (§3). Robustness vs.
   build effort trade-off — recommend the Error Workflow for robustness, but
   it's more new work.
6. **What a background failure actually looks like to the user.** A new
   `Status: "Failed"` Sheet row that's permanently visible in the Dashboard
   (transparent, debuggable, consistent with how yesterday's per-file Retry
   already treats failures) — or should failed background rows be quietly
   removed/hidden, showing only in the Upload screen's own history? And should
   the empty-extraction case (`EMPTY_DOCUMENT`) collapse into the same `Failed`
   status, or stay distinguishable?
7. **What "Retry" means for a background failure.** Yesterday's Retry just
   re-submits as a brand-new upload (new `document_id`, new row) — simplest,
   zero extra backend work, but leaves the failed row sitting in the Sheet
   alongside the new one. Alternative: retry re-uses the same `document_id` and
   re-runs extraction against the existing placeholder row (needs `Process
   Document` to accept a "retry" trigger against an existing row — more n8n
   work). Flagging, not assuming.
8. **HTTP status code for the ack.** Keep `200` (matches today's success shape
   family and needs zero client error-path changes) or move to `202 Accepted`
   (more semantically correct for "accepted, not yet done," but the client's
   current `!res.ok` branching would need to explicitly allow `202` through as
   non-error).

---

## 6. Time / risk estimate

Based on what's actually in the repo, not a generic guess:

| Piece | Estimate | Confidence |
|---|---|---|
| n8n: move ID generation to Upload Endpoint, add placeholder-row append, add early Respond node, thread `document_id` into Execute Workflow | 0.5–1 day | High — mechanical, every technique used already exists elsewhere in this account |
| n8n: convert `Append row in sheet` → lookup + update in Process Document, relocate the empty-extraction check | 0.5 day | High — same pattern as `Review Endpoint`'s existing Find+Update |
| n8n: error handling (Error Workflow **or** per-node branches) so a background failure reliably reaches a `Failed` row | 1–2 days | **Lower** — this is genuinely new territory for this workflow, needs careful testing of multiple failure injection points (extraction throws, Sheets write throws, network blip) |
| n8n: retire/replace the three old end-of-chain Respond nodes; verify the "second Respond node in one execution" question live | 0.5 day incl. testing | Medium |
| Proxy: none (reuse) or one new route + one new n8n webhook workflow for dedicated status | 0 day / 0.5–1 day | High either way |
| Client: polling loop in the `Upload.jsx` runner, new status handling in `constants.js`/`Dashboard.jsx`/locales | 1 day | High — additive to a state machine that already fits |
| End-to-end testing: success path, mid-batch failure, retry, timeout/never-terminal scenario, Hebrew/RTL of any new status labels | 1 day | Medium — this is where multi-file testing found two real n8n bugs last time; expect at least one more surprise |
| **Total** | **~4.5–6.5 days** | Error handling (§3, §6 row 3) is the swing factor — could run longer if the first error-handling approach tried doesn't cleanly catch every failure mode on the first try |

This is roughly **4–5x** the size of yesterday's multi-file client-only change,
because unlike that one, this touches n8n workflow structure (ID generation
location, append→update conversion, new error-handling surface) rather than
being purely additive client orchestration over an unchanged backend.

---

## 7. Summary of what to decide before I write any code

Decisions 1–8 in §5, plus a green light on the overall direction (instant ack
via the already-configured `responseNode` response mode + relocated ID
generation + placeholder-row-then-update + either an Error Workflow or per-node
error branches). Nothing in this document has been applied anywhere — the n8n
workflows, the proxy, and the client are all exactly as they were before this
investigation.
