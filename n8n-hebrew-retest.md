# Hebrew extraction — re-test after the manual n8n fixes

Date: 2026-09-09. Report-only. Real (non-mock) `/api/process` → live n8n backend.
No n8n workflow was modified by this test.

## What was applied before this test (by you, in the n8n UI)

- Information Extractor → System Prompt Template replaced (language rules + urgency order)
- Information Extractor → `deadline` / `deadline_iso` attribute descriptions tightened
- OpenAI Chat Model → Temperature = 0
- `Create Deadline Urgent Event` → On Error: Continue

## Verdict

| File | HTTP 500 gone? | 1 row/upload? | Hebrew summary? | Hebrew action? | Deadline verbatim? | Low/High correct? | Sender correct? |
|---|---|---|---|---|---|---|---|
| **test-hebrew-service-request.pdf** | ✅ yes (3/3 = 200) | ✅ yes | ✅ 3/3 | ✅ 3/3 | ✅ verbatim¹ | ✅ High 3/3 | ✅ "דוד לוי, מנהל תפעול" |
| **test-hebrew-maintenance.docx** | ✅ yes (4/4 = 200) | ✅ yes | ⚠️ 2/4 only² | ✅ 4/4 | ✅ verbatim | ✅ High 4/4 | ✅ "רחל אוחנה, מנהלת משרד" |
| **test-hebrew-invoice.txt** | ❌ **no — 500 every time** | ❌ **no — orphan row every time** | ✅ 6/8 | n/a³ | ✅ 7/8 | ✅ Low 7/8 | ✅ 7/8 |
| **test_doc_1_invoice.pdf** (English spot-check) | ✅ yes (2/2 = 200) | ✅ yes | n/a (English ✅) | n/a | ✅ "August 5, 2026" | ✅ High⁴ | ✅ "NeuralStack AI Solutions Ltd" (issuer, not recipient) |

¹ PDF text-extraction collapses the spaces: `"היום,9בספטמבר2026, לפני השעה14:00"`. That is a
  PDF-layer artifact (the tokens have no spaces when the PDF is extracted), **not** a translation
  or reformat — the words and order are the document's own.
² DOCX summary came back in **English** on 2 of 4 runs (exec-1059, exec-1065) and Hebrew on the
  other 2 (exec-1028, exec-1063), even at temperature 0. `requested_action` was Hebrew on all 4.
  The language rule mostly holds for DOCX but is not yet reliable.
³ The invoice legitimately needs no action → `requested_action` = "No action found" on 7/8 (correct).
⁴ English urgency unchanged from before the fixes — High is defensible ("payment expected upon
  receipt to avoid service interruption" = payment risk). No regression.

### The big remaining bug: `test-hebrew-invoice.txt` → HTTP 500 + orphan row, 100% of the time

- Every single upload (8 this session) returned `HTTP 500 EXTRACTION_FAILED` to the caller…
- …but every single one still **wrote a Google Sheet row** first. Re-uploading multiplies rows.
- The extraction itself is now **good** on most runs: `urgency = Low` ✅, `deadline = "20 בספטמבר 2026"`
  verbatim ✅, `sender = אספקת משרד בע"מ` ✅, Hebrew summary ✅. So the model + prompt are fine —
  something **downstream of the extraction throws** and turns a good result into a 500.

**High-confidence root cause (please confirm in n8n — I can't see the live workflow):**

It is almost certainly the **`Build Response`** node, not anything TXT-specific.

`Build Response` builds its `fields` value as a hand-written JSON *string* with raw interpolation:

```
"fields" = { "sender_or_company": "{{ $json['Sender or Company'] }}", "summary": "{{ $json['Summary'] }}", ... }   (type: object)
```

This Hebrew invoice's extracted text always contains a literal double-quote — `בע"מ` in the
sender and/or `ש"ח` (shekels) in the summary. When that `"` is interpolated into the hand-rolled
JSON string, the string is no longer valid JSON, and the `Set` node fails to parse it → the
sub-workflow throws → Upload Endpoint's error output returns `EXTRACTION_FAILED` (500) — *after*
`Append row in sheet` has already run on the parallel branch.

Why the PDF and DOCX don't hit it: their extracted `sender` / `summary` / `deadline` happen to
contain no `"` character. It looks "Hebrew-.txt-specific" only by coincidence — English `.txt`
files (`test_doc_6/7/9`) all returned 200, and any Hebrew doc whose extracted fields contain a
`"` would fail the same way regardless of file type.

**Fix (for you, in n8n — `Build Response` node):** stop assembling `fields` as a hand-built JSON
string. Either (a) make each sub-key its own assignment, or (b) wrap each interpolated value in
`{{ JSON.stringify($json['...']) }}` so embedded quotes are escaped. Same node I flagged in
`n8n-hebrew-fixes.md §3.4`, different reason.

**To confirm:** open the most recent failed execution of `Doc Assistant - Process Document` and
check which node is red. I expect `Build Response`.

### deadline_iso

Not observable from this test — it is not returned in the `/api/process` response and there is no
`deadline_iso` column in the sheet. Indirect evidence it is now clean: every Hebrew PDF/DOCX run
(deadlines `"היום…"` / `"סוף היום…"`) returned 200 with `notification_sent: true`, i.e. the
`Create Deadline Urgent Event` calendar node consumed it without failing. Worth a manual look at
one calendar event's date to be sure.

## Sheet row IDs written during this re-test

| File | Result | Row IDs |
|---|---|---|
| test-hebrew-invoice.txt | HTTP 500 each, row written anyway | **exec-1024, exec-1033, exec-1035, exec-1039, exec-1041, exec-1043, exec-1052, exec-1055** |
| test-hebrew-service-request.pdf | HTTP 200 | exec-1026, exec-1057, exec-1067 |
| test-hebrew-maintenance.docx | HTTP 200 | exec-1028, exec-1059, exec-1063, exec-1065 |
| test_doc_1_invoice.pdf (English) | HTTP 200 | exec-1030, exec-1061 |
| test_doc_6/7/9 *.txt (English .txt control) | HTTP 200 | exec-1048, exec-1046, exec-1050 |

Pre-existing Hebrew rows still in the sheet from earlier sessions: exec-1001 (doc7), exec-1012
(docx). Total sheet rows now: **36** — needs pruning again (keep one good row per file, e.g.
`test-hebrew-invoice.txt` → exec-1052; the rest of that file's rows are orphans from the 500s,
and exec-1033 is a bad early extraction: Medium / "September 20, 2026" / sender "Not found").

## `test-files/` — exact current contents (13 files)

```
test-hebrew-invoice.txt              723 B
test-hebrew-maintenance.docx       9,249 B
test-hebrew-service-request.pdf   20,573 B
test_doc_1_invoice.pdf            2,924 B
test_doc_2_customer_enquiry.pdf   2,643 B
test_doc_3_complaint.pdf          2,371 B
test_doc_4_supplier_quote.pdf     2,829 B
test_doc_5_internal_report.pdf    2,259 B
test_doc_6_urgent_txt.txt           571 B
test_doc_7_normal_txt.txt           647 B
test_doc_8_compliance_notice.pdf  2,760 B
test_doc_9_purchase_order.txt       736 B
test_doc_10_renewal_notice.pdf    2,655 B
```

**Reconciliation:** the English trio you expected — `test-invoice.txt`,
`test-service-request.pdf`, `test-maintenance-report.docx` — is **not in this repo checkout and
never was** (nothing in git history under those names; `git log --all -- test-files/` shows only
the `test_doc_*` set and, added 2026-09-09, the `test-hebrew-*` trio). The English coverage here
is `test_doc_1..10` (7 PDF + 3 TXT). If you have the named trio elsewhere, they were added in a
different working copy or branch; to re-add them, drop them into `test-files/` and commit.

## Bottom line

- The prompt / temperature / calendar fixes **worked** for the Hebrew **PDF** and **DOCX** paths:
  Hebrew summaries, verbatim Hebrew deadlines, correct High urgency, correct senders, no 500s,
  no duplicate rows. English extraction is **not regressed**.
- Two things still open:
  1. **`test-hebrew-invoice.txt` → 500 + orphan row every time.** Root cause is almost certainly
     the `Build Response` node choking on a `"` inside an extracted Hebrew field (`בע"מ` / `ש"ח`),
     not the TXT branch. Fix = escape/`JSON.stringify` the interpolated values in that node.
  2. **DOCX summary language is flaky** — English on ~half of runs. The system-prompt language
     rule needs to bite harder for the DOCX path (its text arrives via Google Drive export, which
     may strip the cues the model keys on). Consider prepending the detected language explicitly
     to the Information Extractor input, e.g. add to the `text` field:
     `Document language: {{ /[֐-׿]/.test($json.text) ? 'Hebrew' : 'English' }}`.
