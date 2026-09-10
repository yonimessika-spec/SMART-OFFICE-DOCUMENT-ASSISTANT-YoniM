# n8n follow-up fixes — Hebrew re-test (2026-09-09)

Report-only. Nothing in n8n was changed by this investigation. Everything below
is exact text for you to paste in the n8n UI yourself. Workflow throughout:
**`Doc Assistant - Process Document`** (id `FDIWDBWQOdwb41gT`), the sub-workflow
called by `Doc Assistant - Upload Endpoint`.

---

## 1. Root cause of the `test-hebrew-invoice.txt` 500 + orphan row — CONFIRMED

**It is not Hebrew-specific and not `.txt`-specific. It is any document whose
extracted text contains a literal `"` character.**

### How it was confirmed

I do not have an n8n API credential (the proxy only holds the webhook
`x-api-key` shared secret, not a REST API key), so I could not pull the raw
execution record. Instead it was confirmed three ways, which together are
conclusive:

1. **Static trace of the workflow export.** Exactly one node in the whole
   pipeline hand-builds JSON by string-interpolating the extracted text fields:
   **`Build Response`** (an *Edit Fields / Set* node, type `n8n-nodes-base.set`
   v3.5), in its assignment named **`fields`** (field type: **Object**). Current
   value:

   ```
   ={   "document_type": "{{ $json['Document Type'] }}",   "sender_or_company": "{{ $json['Sender or Company'] }}",   "summary": "{{ $json['Summary'] }}",   "requested_action": "{{ $json['Requested Action'] }}",   "deadline": "{{ $json['Deadline'] }}",   "urgency": "{{ $json['Urgency'] }}",   "department": "{{ $json['Department'] }}" }
   ```

   Because the field type is **Object**, n8n takes that resolved string and
   `JSON.parse`s it. If `{{ $json['Sender or Company'] }}` is
   `אספקת משרד בע"מ`, the string becomes

   ```
   { ... "sender_or_company": "אספקת משרד בע"מ", ... }
   ```

   — the `"` after `בע` closes the JSON string early, `מ"` is a syntax error,
   `JSON.parse` throws, the node errors, the sub-workflow fails, and the
   Upload Endpoint's `Call 'Doc Assistant - Process Document'` **error output**
   fires `Respond to Webhook - Extraction Failed` → **HTTP 500
   `EXTRACTION_FAILED`**.

2. **Why the row is still written.** In `Doc Assistant - Process Document` the
   flow is
   `Information Extractor → [ Append row in sheet , If Deadline… ]`, then
   `Append row in sheet → [ If (urgency=High) , Build Response ]`, and the
   notification / calendar branches also converge on `Build Response`. So
   **`Append row in sheet` always runs before `Build Response`**. The row is
   committed; then `Build Response` throws; the caller gets a 500. Re-upload →
   another row.

3. **Empirical probe.** I uploaded a **plain English `.txt`** whose only unusual
   feature was a quote in the company name —
   `From: Barnes "Best Value" Office Supplies Ltd` — with an ordinary
   `October 15, 2026` deadline and "routine invoice, no rush" text.
   Result: **HTTP 500 `EXTRACTION_FAILED`**, and a Sheet row (`exec-1072`) was
   written with `sender_or_company` = `Barnes "Best Value" Office Supplies Ltd`.
   Identical failure, no Hebrew involved.

The Hebrew invoice hits this every single time because Hebrew business text
routinely contains the gershayim mark typed as `"` — `בע"מ` (Ltd) in the sender
and `ש"ח` (shekels) in the summary. The Hebrew PDF and DOCX test files pass only
because their particular extracted values happen to contain no `"`.

### The exact node and field to fix

| | |
|---|---|
| **Workflow** | `Doc Assistant - Process Document` |
| **Node** | **`Build Response`** (Edit Fields / Set node, near the end, just before `Filter`) |
| **Assignment** | the one named **`fields`** — leave its **Type = Object** |
| **Action** | replace its **Value** with the expression in §2 |

---

## 2. Corrected `Build Response` → `fields` value (paste this)

Open **`Build Response`**, find the assignment **`fields`** (Type stays
**Object**), and replace the whole Value field with:

```
={{ ({
  "document_type":     $json["Document Type"],
  "sender_or_company":  $json["Sender or Company"],
  "summary":            $json["Summary"],
  "requested_action":   $json["Requested Action"],
  "deadline":           $json["Deadline"],
  "urgency":            $json["Urgency"],
  "department":         $json["Department"]
}) }}
```

This returns a real JavaScript object. No string is ever hand-assembled or
re-parsed, so a `"` (or `\`, or a newline) inside any extracted value is just
ordinary string content and can never break the output. Downstream is
unaffected: `Filter` only reads `document_id`, and
`Respond to Webhook - Success` already does `{{ JSON.stringify($json.fields) }}`,
which serialises this object correctly.

### Equivalent alternative (if you'd rather keep a JSON-string style)

Same node, same `fields` assignment, Type still **Object**:

```
={
  "document_type":     {{ JSON.stringify($json["Document Type"]     ?? "") }},
  "sender_or_company":  {{ JSON.stringify($json["Sender or Company"]  ?? "") }},
  "summary":            {{ JSON.stringify($json["Summary"]            ?? "") }},
  "requested_action":   {{ JSON.stringify($json["Requested Action"]   ?? "") }},
  "deadline":           {{ JSON.stringify($json["Deadline"]           ?? "") }},
  "urgency":            {{ JSON.stringify($json["Urgency"]            ?? "") }},
  "department":         {{ JSON.stringify($json["Department"]         ?? "") }}
}
```

Here `JSON.stringify` emits the surrounding quotes **and** escapes any inner
`"`, so `בע"מ` becomes the valid token `"אספקת משרד בע\"מ"`. Prefer the first
version — it has fewer moving parts.

> Do **not** "fix" this by splitting `fields` into seven separate string
> assignments — that flattens the response shape and breaks the
> `JSON.stringify($json.fields)` in `Respond to Webhook - Success` and the
> client contract. Keep it as one `fields` object.

### Optional hardening (not required once §2 is in)

`test-hebrew-invoice.txt` also exposed that `Append row in sheet` commits before
`Build Response` runs, so any later failure leaves an orphan row. With §2 applied
the known failure is gone, but if you want defence in depth: set **`Build
Response` → Settings → On Error → Continue**, or move `Append row in sheet` to
run only after `Build Response` succeeds. Lower priority.

---

## 3. DOCX summary comes back in English ~half the time

Observed: `test-hebrew-maintenance.docx` returned an English `summary` on 2 of 4
runs (Hebrew on the other 2), even with the model at temperature 0.
`requested_action` stayed Hebrew on all 4. The Hebrew **PDF** was Hebrew 3/3, so
this is specific to the DOCX path, whose text arrives via a Google Drive
`export?mimeType=text/plain` round-trip (`Export DOCX Text` → `Shape DOCX
Output`) that seems to strip enough cues that the model sometimes defaults to
English.

**Fix — make the language explicit in the Information Extractor input.** No new
node needed. Open **`Information Extractor`**, and replace the **`Text`** field
(currently
`=Today's date: {{ $now.toFormat('yyyy-MM-dd') }}\n\nDocument content:\n{{ $json.text }}`)
with:

```
=Document language: {{ /[֐-׿]/.test($json.text) ? 'Hebrew' : 'English' }}
Write the "summary" and "requested_action" fields in that language, matching the document. All other fields use their fixed English keywords.

Today's date: {{ $now.toFormat('yyyy-MM-dd') }}

Document content:
{{ $json.text }}
```

`/[֐-׿]/` is the Hebrew Unicode block; `.test()` is true if the
extracted text contains any Hebrew letter. This puts an unambiguous
language instruction right next to the content, where models weight it more
heavily than a system-prompt rule.

### Alternative — add to the System Prompt Template instead

If you'd rather not touch the `Text` field, add this as the first bullet under
the `LANGUAGE` section of the **`Options → System Prompt Template`**:

```
- Detect the document's language from its body text, not from any header, label, or letterhead. If the body contains Hebrew letters, treat the document as Hebrew and write "summary" and "requested_action" in Hebrew, even when the text was extracted from a DOCX/Word file and looks partly stripped of formatting.
```

Do one or the other, not both. The `Text`-field version is more reliable.

---

## 4. Sheet cleanup — today's re-test rows only (`exec-1024` … `exec-1072`)

Scoped strictly to rows written by today's re-test. **Do not touch anything at or
below `exec-1023`** — older rows such as `exec-1001` (test_doc_7) and `exec-1012`
(test-hebrew-maintenance.docx) are outside this range and out of scope here.

### KEEP — one clean row per test file (4 rows)

| Row | File | Why this one |
|---|---|---|
| **exec-1052** | test-hebrew-invoice.txt | best extraction: Hebrew summary, `urgency=Low`, `deadline="20 בספטמבר 2026"` verbatim, `sender="אספקת משרד בע\"מ"`, action "No action found" |
| **exec-1026** | test-hebrew-service-request.pdf | HTTP 200, Hebrew, High, correct sender (all 3 pdf runs are equivalent) |
| **exec-1063** | test-hebrew-maintenance.docx | HTTP 200, **Hebrew** summary, High, correct sender (exec-1028 is also Hebrew — keep whichever you prefer, delete the other) |
| **exec-1030** | test_doc_1_invoice.pdf | HTTP 200, English extraction intact, sender = issuer not recipient |

### DELETE (17 rows, all within range)

| Rows | File | Reason |
|---|---|---|
| exec-1024, 1033, 1035, 1039, 1041, 1043, 1055 | test-hebrew-invoice.txt | orphan rows from the 500s; exec-1033 is also a bad extraction (Medium / "September 20, 2026" / sender "Not found") |
| exec-1057, exec-1067 | test-hebrew-service-request.pdf | duplicate 200-runs of exec-1026 |
| exec-1028, exec-1059, exec-1065 | test-hebrew-maintenance.docx | exec-1059 & exec-1065 have English summaries; exec-1028 is the extra Hebrew dup (keep it instead of exec-1063 if you prefer, but not both) |
| exec-1061 | test_doc_1_invoice.pdf | duplicate 200-run of exec-1030 |
| exec-1046, exec-1048, exec-1050 | test_doc_7 / test_doc_6 / test_doc_9 .txt | throwaway English-`.txt` control runs I used to isolate the bug; not part of the test set |
| exec-1072 | zz-quote-probe.txt | the §1.3 diagnostic probe (English invoice with a `"` in the sender); delete the file from Drive too if you want |

After this the sheet has one row per real test file for today's run, plus
whatever pre-existing rows you already had at/below exec-1023.

---

## Summary of what to paste where

1. **`Build Response`** node → assignment **`fields`** (keep Type = Object) →
   replace Value with the object expression in **§2**. This fixes the 500 +
   orphan row for good.
2. **`Information Extractor`** node → **`Text`** field → replace with the
   language-prefixed version in **§3**. This fixes the flaky English DOCX summary.
3. Delete the 17 Sheet rows listed in **§4**, keep the 4.
