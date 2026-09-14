# Scoping: Daily Summary screen (mirrors the Part 1 daily email)

Investigation only — **nothing built, nothing changed**. This file is
uncommitted, for reference. No `server/`, `client/`, `workflows/`, or n8n
changes were made while writing it.

---

## 1. What the Part 1 email actually computes and sends (read from the workflow, not assumed)

Source: `workflows/Project Part 1 - Document Assistant - Daily Email Summary.json`.
Four nodes, read in full:

| Node | What it does |
|---|---|
| `Schedule Trigger` | `triggerAtHour: 18` — fires once a day at 18:00 (n8n instance timezone — see the timezone note below). No other schedule logic. |
| `DocAssistant Google Sheet - retrieving data` | Plain `Get row(s) in sheet` against the same "Document - Processing Log" sheet the rest of the app uses. **No filter at the node level** — it pulls every row, every time. |
| `Today Only` | A `Filter` node: `{{ $json['Received At'].split(' ')[0] }} === {{ $now.format('dd/MM/yyyy') }}`. This is a **string comparison on the date portion of `Received At`**, not a real date-range or "since last run" calculation. "Today" means exactly: the date substring before the space in `Received At` equals today's date in `dd/MM/yyyy`. |
| `Send Daily Email Summary` (Gmail) | Builds the email from whatever survived the filter. |

**The email body, exactly, is:**

- Subject: `Processed Documents - Daily Summary <today's date> ({{count}} documents)` — `count` is simply `$input.all().length`, i.e. the total number of documents received **today**, full stop. Not "needing review," not filtered by anything else.
- An intro line: `<date> — N documents processed today`.
- **Three sections, in this fixed order, grouped by `Urgency` only:**
  1. 🚨 **Urgent** (`Urgency === 'High'`)
  2. ⚠️ **Normal** (`Urgency === 'Medium'`)
  3. 📄 **Informational** (`Urgency === 'Low'`)
- Each section is an HTML table with exactly **four columns**: **Type** (`Document Type`), **From** (`Sender or Company`), **Deadline**, **Dept** (`Department`). Nothing else — no status, no summary, no requested action, no per-department subtotal, no "past deadline" flag, no review state.
- A closing line linking to the full Sheet.

**What the real email does *not* do**, so nothing here gets invented to sound plausible: no "needing review" count, no department-level breakdown/totals, no overdue/past-deadline check (there's no code anywhere in this workflow that compares `Deadline` to today — it's a free-text field, this workflow never touches it except to print it verbatim). The brief's illustrative list ("count by urgency/department, any documents past deadline") is broader than what the real email contains — I'm reporting that gap explicitly rather than quietly building the broader version.

**Timezone note (flagging, not guessing):** `$now.format(...)` resolves in whichever timezone this n8n instance/workflow is configured for; I can't read that setting from the exported JSON. Given the whole app is built for Israel-based use, it's a reasonable bet that's Israel time, but I haven't confirmed it. The client-side equivalent (§3) will use the browser's local date, which for this user in practice should agree with n8n's "today" the overwhelming majority of the time — the only failure mode is a document received in the last few minutes before/after local midnight landing in yesterday's/today's bucket differently between the two. Low-stakes for a "roughly what today looks like" screen; noting it rather than silently assuming it away.

---

## 2. Does this need a new endpoint? **No — confirmed reusable as-is.**

Every field the email uses is already in `GET /api/documents`'s existing
response shape (CONTRACT.md §4): `document_type`, `sender_or_company`,
`deadline`, `department`, `urgency`, plus `received_at` for the date filter and
`document_id`/`file_name` for linking a row to its detail view. Nothing is
missing.

- **No new n8n webhook.** The existing "Get Documents" workflow already returns
  the full row set; the "today" + "group by urgency" logic is pure
  client-side filtering/grouping over data the app already fetches for the
  Dashboard.
- **No new proxy route.** `useDocuments()` (already loaded by `App.jsx` for
  every authenticated screen) is sufficient.
- **No new permission.** `GET /api/documents` is already "any signed-in role"
  server-side (`server/index.js`) — Viewer already has full read access to this
  exact data today via the Dashboard. Making a summary screen visible to all
  three roles requires zero backend permission change.

This is the mirror image of the polling investigation: there, nothing matched
an existing pattern for the hard part (error handling). Here, **everything**
needed already exists — data, permissions, and (per §4) the UI primitives.

---

## 3. Proposed screen

Route `/daily-summary` (or `/summary` — naming, not a real decision), nav label
**"Daily Summary"**, visible to all three roles exactly like Dashboard/Archive —
no `can()` gate needed in `App.jsx`, same as those two.

### Layout

```
Daily Summary
14 September 2026 · 8 documents today

🚨 Urgent (3)
  [row] [row] [row]

⚠️ Normal (4)
  [row] [row] [row] [row]

📄 Informational (1)
  [row]
```

- Header: today's date (kept `dir="ltr" tabular-nums`, same treatment
  `DocumentCard`/`ArchiveCard` already give `received_at`) + the total count,
  reusing the existing `common.count` / `common.count_one` i18n plural pattern
  already used on Dashboard/Archive.
- **Empty state** (0 documents today): reuse the same `Empty` component pattern
  Dashboard/Archive already use for "nothing yet."
- Three sections, **High → Medium → Low**, matching the email's fixed order.
  Each section heading reuses the app's existing `URGENCY_STYLES` colours
  (already used by `UrgencyBadge` everywhere else) rather than the email's raw
  hex codes — same red/amber/neutral-green palette, just sourced from the one
  place the app already defines it, so this doesn't introduce a fourth colour
  system to keep in sync.
- **Per-row content — deliberately kept to what the email actually shows**:
  Type, From, Deadline, Dept. A new small row component (not a reuse of
  `DocumentCard`, which shows `summary`/`status`/badges the email doesn't have)
  built from the same primitives already proven elsewhere: `Badge
  variant="outline"` for Type/Dept, `dir="auto"` for the sender and deadline
  text (free-text, can be Hebrew), `dir="ltr" tabular-nums` for a literal date
  if the deadline happens to be one. This is copying an established pattern,
  not inventing new RTL handling.
- **One natural addition beyond the email**: each row links to
  `/document/:id`, the same way every other list in this app already does
  (Dashboard, Archive, Upload's result rows). The email couldn't link
  per-row (it's a static message); a screen naturally can, and every other
  list here already does this — I'm treating it as "this app's existing
  convention," not as inventing new content.
- No search, no filters, no date picker — matches "keep it simple/contained."

### Files

| File | Change |
|---|---|
| `client/src/utils/dailySummary.js` (new) | Pure functions: `isToday(receivedAt)` (exact port of the n8n `Filter` node's logic — split on space, compare to today formatted `dd/MM/yyyy`) and `groupByUrgency(docs)` → `{ High: [...], Medium: [...], Low: [...] }`. Kept out of the component so the "today" rule lives in one tested place, same reasoning as pulling CSV logic into `csvExport.js`. |
| `client/src/screens/DailySummary.jsx` (new) | Reads `useDocuments()`, runs it through the two utils above, renders the three sections + empty state + loading skeleton (same skeleton pattern Dashboard/Archive already use) + `ErrorMessage` on fetch failure (same as every other screen). |
| A new small row component, e.g. `client/src/components/DailySummaryRow.jsx` | Type/From/Deadline/Dept + link to detail, per above. |
| `client/src/App.jsx` | One new ungated `NavLink` (next to Dashboard/Archive, not gated like Upload/Users) + one new ungated `Route`. |
| `client/src/constants.js` | Optionally a one-line `URGENCY_ORDER = ['High', 'Medium', 'Low']` constant so the section order is declared once, not hardcoded three times. Everything else (`URGENCY_STYLES`) is reused as-is. |
| `client/src/locales/{en,he}.json` | New `nav.dailySummary` key, new `dailySummary.*` namespace (title, section headings, column headers, empty state, count line). Same shape as the existing `dashboard.*`/`archive.*` namespaces — no new i18n technique needed. |

Nothing in `server/` or `workflows/` changes. `CONTRACT.md` doesn't need a new
section since no new endpoint or response shape is introduced.

### Small (non-blocking) implementation choices, flagged rather than silently decided

These aren't "decisions I need before building" in the way polling's were —
they're low-stakes enough that I'd default one way and mention it, but noting
them since the brief asked me not to invent unilaterally:

- Hide a section entirely when it has zero documents today (cleaner for a
  screen) vs. always show all three like the email does (even an empty
  table). I'd default to hiding.
- Whether to show `File Name` as an additional identifying column/row title —
  the email doesn't have it (Type + From was enough context for an email
  recipient who already knows the business), but on a screen where rows are
  clickable it's arguably worth a glance. I'd default to including it as the
  row's link text, since every other list in the app leads with the file name.

---

## 4. i18n / RTL

Nothing new here technically — this reuses patterns already solved:

- `dir="auto"` on sender/deadline (free text, can be Hebrew) — same as
  `FieldValue`/`DocumentCard` today.
- `dir="ltr" tabular-nums"` on the displayed date and on `received_at` if shown
  — same as everywhere else `received_at` appears.
- Section headings and column labels are plain translated strings, same
  `t('dailySummary.xxx')` pattern as every other screen — no plurals trickier
  than the existing `common.count_one`/`_other` (and that one's Hebrew-plural
  gotcha from yesterday, `sendOne`/`sendMany`-style, is already a documented
  precedent to just follow, not rediscover).
- RTL layout of a 4-column-ish row list is the same shape Dashboard/Archive
  already got right (icon/badge/text ordering via logical properties) — no new
  layout pattern.

---

## 5. Time / risk estimate

| Piece | Estimate | Confidence |
|---|---|---|
| `dailySummary.js` utils (today-filter + urgency grouping) | 1–2 hrs | High — the filter logic is a direct port of four lines of n8n expression |
| `DailySummaryRow` + `DailySummary.jsx` screen | 2–3 hrs | High — every visual primitive it needs already exists and is proven |
| Nav + route wiring in `App.jsx` | <30 min | High — identical to how Dashboard/Archive are already wired |
| i18n (EN + HE) + RTL check | 1–2 hrs | High — no new i18n or RTL technique, just more keys |
| Testing (empty day, single-urgency day, mixed day, Hebrew/RTL, all three roles can see it) | 1–2 hrs | High |
| **Total** | **~0.5–1 day** | No part of this has "no existing pattern to copy" — everything reuses data, permissions, components, or i18n techniques already in the app. This is the opposite risk profile from the polling investigation. |

No decisions are blocking this the way polling's eight were. The only thing
worth a yes/no from you before I build: the two small implementation choices in
§3 (hide-empty-sections, and whether to show File Name) — happy to just pick
sensible defaults and let you correct them in review, if you'd rather not
spend time on them now.
