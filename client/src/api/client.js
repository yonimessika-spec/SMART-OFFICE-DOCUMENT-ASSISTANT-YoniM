// Real HTTP API layer.
//
// Calls the Express proxy in server/, which forwards to the n8n webhooks and
// attaches the x-api-key header server-side. NO secret belongs in this file or
// anywhere under client/.
//
// Wire these up ONE AT A TIME, in this order (SPEC.md §6):
//   1. getDocuments   -> GET  /api/documents   [IMPLEMENTED]
//   2. processDocument -> POST /api/process    [IMPLEMENTED]
//   3. reviewDocument  -> POST /api/review     [IMPLEMENTED]
//
// Request/response shapes: CONTRACT.md §1–§6.

const SERVER_BASE_URL = import.meta.env.VITE_SERVER_BASE_URL

// GET /api/documents  ->  CONTRACT.md §4
// The proxy forwards n8n's response unchanged: a flat array of document rows in
// Google-Sheet insertion order (oldest first). "Newest first" for the UI is just
// the reverse — received_at is an opaque display string and is never parsed.
export async function getDocuments() {
  if (!SERVER_BASE_URL) {
    throw new Error(
      'VITE_SERVER_BASE_URL is not set. Add it to client/.env (e.g. http://localhost:3001).',
    )
  }

  let res
  try {
    res = await fetch(`${SERVER_BASE_URL}/api/documents`, {
      headers: { Accept: 'application/json' },
    })
  } catch (cause) {
    // fetch only rejects on network-level failure (server down, DNS, CORS).
    throw new Error(`Could not reach the server at ${SERVER_BASE_URL}. Is it running?`, { cause })
  }

  if (!res.ok) {
    let detail = ''
    let code
    try {
      const body = await res.json()
      detail = body?.error || body?.message || ''
      code = body?.error_code // e.g. UNAUTHORIZED — CONTRACT.md §3
    } catch {
      /* non-JSON error body — ignore */
    }
    const err = new Error(
      detail || `The server returned ${res.status} for /api/documents.`,
    )
    err.status = res.status
    if (code) err.code = code // full error_code -> sentence mapping is a later F7 step
    throw err
  }

  const body = await res.json()
  if (!Array.isArray(body)) {
    throw new Error('The server returned an unexpected shape for /api/documents (expected an array).')
  }
  return [...body].reverse()
}

// POST /api/process  ->  CONTRACT.md §1 (request) / §2 (success 200) / §3 (error)
//
// `payload` is the object Upload.jsx already builds and passes in:
//   { file_name, mime_type, file_base64, submitted_by }
// Field names are snake_case to match CONTRACT.md §1 exactly (note: mime_type).
// file_base64 has no data-URL prefix — Upload.jsx strips it.
//
// Mirrors getDocuments(): no client-side timeout of its own — the ~90 s budget
// lives in the server's REQUEST_TIMEOUT_MS (it returns 504 if n8n runs long).
export async function processDocument(payload) {
  if (!SERVER_BASE_URL) {
    throw new Error(
      'VITE_SERVER_BASE_URL is not set. Add it to client/.env (e.g. http://localhost:5055).',
    )
  }

  let res
  try {
    res = await fetch(`${SERVER_BASE_URL}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (cause) {
    // fetch only rejects on network-level failure (server down, DNS, CORS).
    throw new Error(`Could not reach the server at ${SERVER_BASE_URL}. Is it running?`, { cause })
  }

  const body = await res.json().catch(() => null)

  // CONTRACT.md §3 error envelope: { status: "error", error_code, message }.
  // Workflow A returns it with an HTTP 4xx (400 UNSUPPORTED_FILE_TYPE /
  // 422 EMPTY_DOCUMENT); also guard on body.status in case one arrives with 200.
  if (!res.ok || body?.status === 'error') {
    const err = new Error(
      body?.message || `The server returned ${res.status} for /api/process.`,
    )
    err.status = res.status
    // error_code drives ErrorMessage's messageFor() -> ERROR_MESSAGES map;
    // no new user-facing error text is invented here.
    if (body?.error_code) err.code = body.error_code
    throw err
  }

  if (!body) {
    const err = new Error('The server returned an empty response for /api/process.')
    err.status = res.status
    throw err
  }

  // CONTRACT.md §2 success shape — handed back to Upload.jsx untouched.
  return body
}

// POST /api/review  ->  CONTRACT.md §5 (request) / §6 (response)
//
// `payload` is { document_id, status, reviewed_by, review_note } — passed
// through as-is. `status` is "Reviewed" | "Needs Review" | "Processed"
// (the last one reopens a document; the backend clears reviewed_by/review_note).
//
// Success (200): { status: "updated", document_id }.
// No match (404): { status: "error", error_code: "DOCUMENT_NOT_FOUND", message }.
//
// Same shape/handling as processDocument().
export async function reviewDocument(payload) {
  if (!SERVER_BASE_URL) {
    throw new Error(
      'VITE_SERVER_BASE_URL is not set. Add it to client/.env (e.g. http://localhost:5055).',
    )
  }

  let res
  try {
    res = await fetch(`${SERVER_BASE_URL}/api/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (cause) {
    // fetch only rejects on network-level failure (server down, DNS, CORS).
    throw new Error(`Could not reach the server at ${SERVER_BASE_URL}. Is it running?`, { cause })
  }

  const body = await res.json().catch(() => null)

  if (!res.ok || body?.status === 'error') {
    const err = new Error(
      body?.message || `The server returned ${res.status} for /api/review.`,
    )
    err.status = res.status
    // error_code drives ErrorMessage's messageFor() -> ERROR_MESSAGES map.
    if (body?.error_code) err.code = body.error_code
    throw err
  }

  if (!body) {
    const err = new Error('The server returned an empty response for /api/review.')
    err.status = res.status
    throw err
  }

  // CONTRACT.md §6 success shape — { status: "updated", document_id }.
  return body
}
