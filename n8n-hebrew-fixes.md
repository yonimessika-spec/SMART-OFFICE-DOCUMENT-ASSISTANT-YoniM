# n8n changes for Hebrew document support

Findings and recommended n8n edits from the Hebrew-extraction test
(2026-09-09). **These are for you to apply in the n8n UI — nothing here changes
the repo.** Workflow: **`Doc Assistant - Process Document`** (the sub-workflow).

---

## 1. Information Extractor node — replace the System Prompt

Node: **`Information Extractor`** → open it → **Options → System Prompt Template**.
Replace the whole field with the text below.

Why: the current prompt never mentions language, so the model defaults to
English `summary` for Hebrew documents (5 of 8 test rows), and it sometimes
reformats a Hebrew deadline ("20 בספטמבר 2026" → "September 20, 2026", 3/3 for
the invoice). It also has no rule for a document that *states* it is not urgent,
so the non-urgent Hebrew invoice ("אין דחיפות מיוחדת") was marked **Medium** on
one run.

```
You are an office assistant that reads business documents (invoices, customer requests, complaints, supplier quotes, contracts, and internal reports) and extracts structured information for logging. Documents may be written in Hebrew or in English.

LANGUAGE
- Read and fully understand the document in whatever language it is written.
- Write "summary" and "requested_action" in the SAME language as the document: natural Hebrew for a Hebrew document, English for an English document.
- "document_type", "urgency" and "department" are always one of the fixed English keywords listed for that field, whatever the document's language.
- Copy "sender_or_company" and "deadline" exactly as they appear in the document, in the original language and script. Do not translate, transliterate or reformat them.
- The markers "Not found" and "No action found" are always written in English exactly like that, even inside an otherwise-Hebrew result.

EXTRACTION
- Extract only what appears in the document. Never invent missing details.
- When a field is missing, use "Not found" (or "No action found" for requested_action).
- The sender may be introduced by a label such as "From:", "Sender:", "Submitted by:", or in Hebrew "מאת:", "ספק:", "שם:", "הוגש על ידי:". "לכבוד" / "לקוח" marks the recipient, not the sender. Use the party who issued or sent the document.

URGENCY — decide in this order:
1. If the document explicitly says it is NOT urgent or is routine — e.g. "no rush", "not urgent", "routine", "at your convenience", or Hebrew "אין דחיפות", "ללא דחיפות", "לא דחוף", "שגרתי", "במועד הרגיל" — mark it Low, even if it has a due date.
2. Otherwise mark High when there is a deadline within about 3 days, a payment / legal / safety risk, or an explicit urgent request ("urgent", "asap", "immediately"; Hebrew "דחוף", "בהקדם", "מיידי", "היום").
3. Otherwise mark Medium when there is a later deadline or a response is clearly expected.
4. Otherwise mark Low (informational, no action needed).
A due date on its own is NOT enough for Medium or High — a standard invoice with normal payment terms and no stated urgency is Low.

DEADLINE
- "deadline": the deadline text exactly as written, in its original language (e.g. "20 בספטמבר 2026", "עד סוף השבוע", "within 7 days"). Do not translate or reformat it.
- Put the normalised ISO date only in "deadline_iso".
```

---

## 2. Information Extractor node — tighten two attribute descriptions

Same node, in the **Attributes** list.

**`deadline`** — change the description to:

```
Any deadline mentioned in the document, copied verbatim in its original language and script (e.g. "20 בספטמבר 2026", "עד מחר בבוקר", "within 7 days"). Do not translate or reformat. Use "Not found" if absent.
```

**`deadline_iso`** — change the description to:

```
The deadline as a bare ISO 8601 calendar date, EXACTLY in the form YYYY-MM-DD and nothing else — no time, no words, no parentheses, only digits and hyphens. Convert dated deadlines in any language, e.g. "20 בספטמבר 2026" -> "2026-09-20". For relative expressions ("within 7 days", "עד מחר", "סוף היום", "end of week") compute the real date from today's date given above; "today" / "היום" / "end of day" / "סוף היום" -> today's date. If no concrete date can be determined, or there is no deadline, return an empty string "". Never return anything that is not YYYY-MM-DD or "".
```

Why: the **`Create Deadline Urgent Event`** (Google Calendar) node builds its
start time as `{{ deadline_iso }}T09:00:00`. If the model returns anything that
isn't a clean `YYYY-MM-DD` (extra words, a relative phrase left un-normalised —
more likely with Hebrew "היום" / "סוף היום" / "עד מחר"), that node throws.

---

## 3. Config fixes (not prompt) — the flaky failures & duplicate rows

During testing, `test-hebrew-invoice.txt` and `test-hebrew-service-request.pdf`
returned **HTTP 500 `EXTRACTION_FAILED`** on ~2 of 3 attempts — **while still
writing the sheet row**. A user then re-uploads and gets a **duplicate row**
(with a possibly different, sometimes worse, extraction). Root cause: in
`Doc Assistant - Process Document`, `Information Extractor` fans out to two
parallel branches — `Append row in sheet` **and** `If Deadline - Write to
Calendar → Create Deadline Urgent Event`. The Calendar node has no error
handling, so when `deadline_iso` is malformed it throws and fails the whole
Execute-Workflow call *after* the row is already written.

Recommended, in the n8n UI:

1. **`Create Deadline Urgent Event`** node → **Settings → On Error → "Continue
   (using error output)"** (or at least "Continue"). A bad calendar date should
   never fail document processing.

2. Optionally, guard the date expression on that node. **Start** field:
   ```
   {{ /^\d{4}-\d{2}-\d{2}$/.test($('Information Extractor').item.json.output.deadline_iso) ? $('Information Extractor').item.json.output.deadline_iso : $now.toFormat('yyyy-MM-dd') }}T09:00:00
   ```
   and the matching **End** field with `T09:30:00`.

3. **`OpenAI Chat Model`** node → **Options → add "Temperature" = 0** (currently
   default ≈ 1). The same file gave different `urgency` / `sender_or_company` /
   summary-language on repeated runs; temperature 0 makes extraction
   deterministic and removes most of the odd one-off failures.

4. Consider adding `On Error → Continue` (or a check) to the
   `Information Extractor` node too, so a single bad LLM response returns a
   clean `EMPTY_DOCUMENT` / `EXTRACTION_FAILED` *without* a half-written row —
   or move `Append row in sheet` to run only after both the extraction and the
   calendar step have settled.

---

## 4. Existing test rows to clean up

The flaky 500s wrote duplicate Hebrew rows. In the sheet you can remove the
extras — keep one good row per file:

| file | row IDs seen | keep |
|---|---|---|
| test-hebrew-invoice.txt | exec-995, exec-1003, exec-1008 | one where sender = `אספקת משרד בע"מ` and urgency = `Low` (e.g. exec-1008) |
| test-hebrew-service-request.pdf | exec-997, exec-1005, exec-1010 | any (all correct); exec-1005 has the cleanest deadline spacing |
| test-hebrew-maintenance.docx | exec-999, exec-1012 | either |
