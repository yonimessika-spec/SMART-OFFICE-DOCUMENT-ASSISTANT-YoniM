# API Contract — Smart Office Document Assistant (Part 2)

Single source of truth for every request/response shape exchanged between the
application and n8n. If this file and the code disagree, the code is wrong. Any
change here must be made in three places at once: this file, the n8n workflow,
and the application.

## 1. POST /process-document — Request
| Field        | Type   | Required | Notes                                          |
|--------------|--------|----------|-------------------------------------------------|
| file_name    | string | Yes      | Original name including extension               |
| mime_type    | string | Yes      | application/pdf, text/plain, or the DOCX type    |
| file_base64  | string | Yes      | Base64-encoded file content, **no** data-URL prefix |
| submitted_by | string | No       | Who used the app; for the log                    |

## 2. POST /process-document — Success response (200)
\```json
{
  "status": "processed",
  "document_id": "exec-1043",
  "file_name": "invoice-4471.pdf",
  "file_link": "https://drive.google.com/file/d/1a2b3c/view",
  "received_at": "05/08/2026 14:48",
  "fields": {
    "document_type": "invoice",
    "sender_or_company": "Nordic Supplies Ltd",
    "summary": "Invoice for office chairs delivered in February.",
    "requested_action": "Approve and pay invoice 4471",
    "deadline": "12 March 2026",
    "urgency": "High",
    "department": "Finance"
  },
  "notification_sent": true
}
\```
## Note on received_at (applies throughout this contract)
`received_at` is Google Sheets' own locale-formatted datetime string
(confirmed format: `DD/MM/YYYY HH:mm`, e.g. `05/08/2026 14:48` — verify
against your spreadsheet's locale setting, don't assume). Treat it as an
opaque display string everywhere in the application; never parse it with
`new Date()`, since it is not ISO 8601 and JavaScript's parser can silently
misread which side is the day vs. the month.
## 3. POST /process-document — Error response
\```json
{
  "status": "error",
  "error_code": "UNSUPPORTED_FILE_TYPE",
  "message": "Only PDF, DOCX and TXT files can be processed."
}
\```

| error_code          | When                                       | App shows                                    |
|----------------------|---------------------------------------------|-----------------------------------------------|
| UNSUPPORTED_FILE_TYPE | MIME type isn't PDF/DOCX/TXT               | Inline message on upload screen, file not sent |
| EMPTY_DOCUMENT        | Extraction produced nothing (e.g. scanned image) | "No readable text — try a different file"   |
| EXTRACTION_FAILED     | AI step failed / unusable output           | Retry button, file kept in the form            |
| UNAUTHORIZED          | Missing/wrong secret header                | Configuration-error message, not user-actionable |

## 4. GET /documents — Response (200)
\```json
[
  {
    "document_id": "exec-1043",
    "received_at": "05/08/2026 14:48",
    "file_name": "invoice-4471.pdf",
    "file_link": "https://drive.google.com/file/d/1a2b3c/view",
    "document_type": "invoice",
    "sender_or_company": "Nordic Supplies Ltd",
    "summary": "Invoice for office chairs delivered in February.",
    "requested_action": "Approve and pay invoice 4471",
    "deadline": "12 March 2026",
    "urgency": "High",
    "department": "Finance",
    "status": "Processed"
  }
]
\```
(Confirmed shape — matches what Workflow B actually returns, verified in M1.)

## 5. POST /review — Request
| Field        | Type   | Notes                                 |
|--------------|--------|-----------------------------------------|
| document_id  | string | Must match a Document ID in the sheet   |
| status       | string | "Reviewed" or "Needs Review"            |
| reviewed_by  | string | Name/email of reviewer                  |
| review_note  | string | Optional, ≤200 characters               |

## 6. POST /review — Response
\```json
{ "status": "updated", "document_id": "exec-1043" }
\```
404 returned when no row matches `document_id`.