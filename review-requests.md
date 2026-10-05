# Review requests

Branch: `feature/review-requests` (cut from `feature/persistent-users`). Not merged, nothing
pushed to master.

"Flag as needs review" in the document detail view now opens a dialog. The person flagging can
pick anyone with a real email, edit a message, and send a review request by email. Everything is
stored in Neon and shown on the document in a "Review requests" card.

## Decisions and why

- **The client flags, then asks.** The dialog calls the existing `POST /api/review` (status
  "Needs Review", the Sheet stays the source of truth) and only after that succeeds calls
  `POST /api/review-requests`. The new endpoint never changes a status.
  Why: flag-only behavior stays exactly as before (including mock-review mode and n8n error
  handling), and nobody is emailed about a document that failed to flag. If the request step
  fails after a successful flag, the dialog says so and retries only the request.
- **Email fields come from the Sheet, not the browser.** The server fetches the document by id
  from the same documents webhook the dashboard uses and builds the email from that. The client
  sends only `document_id`, `recipient_user_ids` and `message`; anything else it sends is
  ignored. If the lookup fails the request is not stored (502 `DOCUMENTS_UNAVAILABLE`).
  Cost: one extra n8n call per request or resend.
- **One email per recipient.** Recipients never see each other's addresses. Reply-To is the
  requester's email.
- **Wording follows the recipient's current role** (so a resend after a role change is right).
  Admin and Submitter: subject `Review requested: <file>`, button "Open and review". Viewer:
  subject `For your attention: <file>`, button "Open document (read-only)", plus "Reply to this
  email to send your feedback to <requester>." Viewers get no new permission; their answer comes
  back by email reply.
- **Pending users** stay selectable and are marked Pending. Selecting one shows a warning in the
  dialog. Their email starts with "You need to set your password first. Check your invitation
  email, or ask the administrator to resend it." (placed before the title). No invite is resent
  automatically.
- **Escaping.** The email HTML is built on the server from structured data and every
  user-supplied value (message, file name, summary and the other fields, usernames) is
  HTML-escaped. Newlines in the message become `<br>`. The subject is plain text with control
  characters stripped. No Drive link, token or password is ever included.
- **Failures never un-flag.** The request and recipients are saved first with status `failed`,
  then each email is sent (5 at a time) and the row is updated to `sent`. A crash mid-send leaves
  resendable rows. Resend sends only `failed` recipients; a recipient whose account was deleted
  (or whose address became a placeholder) is marked `skipped`.
- **Removed users stay in history.** `requested_by_user_id` and `user_id` are `ON DELETE SET
  NULL` with username, email, role snapshots; the card shows "(removed)".
- **Rate limits and guards.** 10 requests per 10 minutes per user (counted only for requests
  that pass shape validation, so typos cost nothing), 20 resends per 10 minutes. The same
  requester sending the same recipient set for the same document within 10 seconds gets 409.
  Duplicate recipient ids collapse. Max 20 recipients, message max 1000 characters. The
  requester cannot pick themselves. A requester whose own email is a placeholder gets a clear 400
  (replies could not reach them).
- **No emails in any response.** Not in the directory, the list, or create/resend results. A
  Viewer reading the card sees usernames, roles and sent/failed only.
- **Logs.** Only usernames and error codes. No email body, message, address, token or password.
- Dev mode (not production, or `EMAIL_MODE` not `n8n`): the email is printed to the server console
  (recipient, subject, reply-to and link) instead of sent, like the invite flow.

## Schema (idempotent, in the advisory-locked migration)

```
review_requests            id, document_id, file_name,
                           requested_by_user_id -> users (SET NULL), requested_by_username,
                           message (CHECK <= 1000), created_at
review_request_recipients  id, request_id -> review_requests (CASCADE),
                           user_id -> users (SET NULL), username, email, role,
                           email_status 'sent'|'failed'|'skipped', emailed_at
```

## Endpoints

| Endpoint | Who | Notes |
|---|---|---|
| `GET /auth/users/directory` | Admin, Submitter | `{id, username, role, hasEmail, pending}` only. `GET /auth/users` stays Admin-only. |
| `POST /api/review-requests` | Admin, Submitter | body `{document_id, recipient_user_ids[], message}`; 201 `{request}` with per-recipient `emailStatus` |
| `GET /api/review-requests?document_id=` | any signed-in role | newest first, no emails |
| `POST /api/review-requests/:id/resend` | Admin, Submitter | failed recipients only; 409 `NOTHING_TO_RESEND` if none |

Error codes: `NO_RECIPIENTS`, `TOO_MANY_RECIPIENTS`, `MESSAGE_TOO_LONG`, `RECIPIENT_NOT_FOUND`,
`RECIPIENT_NOT_ELIGIBLE`, `DUPLICATE_REQUEST`, `REQUESTER_EMAIL_MISSING`, `DOCUMENT_NOT_FOUND`,
`DOCUMENTS_UNAVAILABLE`, `REQUEST_NOT_FOUND`, `NOTHING_TO_RESEND`, `RESEND_IN_PROGRESS`,
`RATE_LIMITED`. All have EN and HE text.

## Files

Server: `db.js` (tables), `documents.js` (Sheet lookup), `email.js` (builder), `reviewRequests.js`
(store, validation, sending), `reviewRoutes.js`, `users.js` (directory), `index.js` (mounting).
Client: `ReviewRequestDialog.jsx`, `ReviewRequestsCard.jsx`, `DocumentDetail.jsx`,
`api/reviewRequests.js`, `api/auth.js` (exports `request`), `en.json`, `he.json`.
Workflow: `workflows/Project Part 2 - Document Assistant - Send Email.json`.

## Env lines

None new. It uses the existing `N8N_*`, `N8N_EMAIL_PATH`, `APP_BASE_URL` / `CLIENT_ORIGIN` and
`DATABASE_URL`. For real emails Render needs `N8N_EMAIL_PATH=/send-email` (already listed for
invites). Netlify: nothing.

## n8n: what I found and changed

Checked `Send Email.json` rather than assuming:

- `replyTo` **is** passed to the Gmail node's Reply To option
  (`options.replyTo = $('Webhook').first().json.body.replyTo || ''`).
- `appendAttribution` was already `false` (no n8n footer).
- The sender name was not set. I added `options.senderName = "Smart Office Document Assistant"`.

If you would rather edit the live workflow by hand:

1. Open the "Doc Assistant - Send Email" workflow in n8n.
2. Open the Gmail node ("Send Email").
3. Under Options, add **Sender Name** and enter `Smart Office Document Assistant`.
4. Under Options, check **Reply To** is set to the expression
   `{{ $('Webhook').first().json.body.replyTo || '' }}`.
5. Under Options, check **Append n8n attribution** is off.
6. Save and make sure the workflow is published.

Test from PowerShell (placeholders only; use an inbox you own and reply to it to see the
Reply-To):

```powershell
$h = @{ 'x-api-key' = '<N8N_SECRET>'; 'Content-Type' = 'application/json' }
$b = '{"to":"you@example.com","subject":"Reply-To test","html":"<p>Reply to this email.</p>","replyTo":"someone-else@example.com"}'
Invoke-RestMethod -Method Post -Uri 'https://<your-n8n-host>/webhook/send-email' -Headers $h -Body $b
```

Expected: `{"status":"sent"}`; the email is from "Smart Office Document Assistant" and pressing
Reply addresses `someone-else@example.com`.

## Testing done (Neon dev branch only)

A throwaway server on port 5066 with throwaway credentials, plus a local mock of the n8n webhooks
(documents, send-email, review) so each email body could be inspected. 78 automated API checks,
all passing:

- directory: only `id, username, role, hasEmail, pending`; no emails, hashes or tokens; Viewer 403;
  anonymous 401; placeholder user not selectable; pending flagged; `GET /auth/users` still Admin-only.
- emails for Admin/Submitter, Viewer and a pending Viewer: subject and wording by role, button
  text, Reply-To, one address per email, link `<base>/document/<id>`, no Drive link, spam line,
  newline handling, Sheet fields shown, client-supplied fields ignored.
- escaping: a message, file name, sender and summary containing `<script>`, `<b>`, `<img onerror>`,
  quotes and ampersands appear as plain text and no raw tag reaches the HTML.
- permissions: Viewer 403 on create and resend, anonymous 401, any role can read a document's
  requests, no emails or hashes in any response, rejected requests create nothing.
- validation: zero recipients, 21 recipients, 1001-char message (1000 accepted), unknown id,
  placeholder recipient, self, unknown document, missing `document_id`, non-list recipients,
  duplicate ids collapsed, 409 for a repeat within 10 seconds.
- failure: n8n returning 500 still saves the request with failed recipients; the list shows them;
  a recipient deleted afterwards shows as removed and is skipped on resend; resend delivers the
  live ones; nothing left gives 409; resend does not re-email other requests; documents lookup
  failing gives 502 and stores nothing; requester with a placeholder email gets 400; a deleted
  requester keeps the request.
- rate limit: 10 valid requests then 429; malformed requests never reach 429; users are independent.
- logs contain no message text, HTML, token or password.
- regression: the earlier suites still pass (65 API checks, 28 session checks).
- Browser (Hebrew RTL and English): dialog with picker, role and Pending badges, search, selection
  surviving a search, pending warning, counter, flag and send with failing emails (document flagged,
  failed names shown, Resend works), flag without sending (no request created), status badge updates,
  Review requests card (Admin with Resend, Viewer read-only without Review actions). Dashboard,
  Archive and Daily Summary still load. A production build succeeds.

## Not verified / limitations

- **Real Gmail sending** was not tested (the workflow is not imported on my side); the request body
  to the webhook was checked against the mock. Whether the live Gmail node honors Reply To and
  Sender Name is for you to confirm with the PowerShell test above.
- Upload (multi-file) and CSV export code was not touched; I did not click through them.
- Deep-link emails go to `<app base>/document/<id>`. The document must be in the dashboard data
  (the app loads documents on sign-in). A recipient who is not signed in sees the login first; the URL
  stays the same, so after signing in they land on that document (reasoned from App.jsx, not clicked through).
- Email fields are the Sheet's at send time. A resend uses the Sheet's current values.
- A pending recipient can receive the email but cannot open the document until they set a password.
- The 10-second duplicate guard and the in-flight resend guard are per process (fine for one Render
  instance).
- `README.md`, `PROMPTS.md` and `auth-and-roles.md` were not edited, as asked.
