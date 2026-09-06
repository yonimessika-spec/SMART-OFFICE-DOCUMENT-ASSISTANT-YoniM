// Real HTTP API layer.
//
// Calls the Express proxy in server/, which forwards to the n8n webhooks and
// attaches the x-api-key header server-side. NO secret belongs in this file or
// anywhere under client/.
//
// Wire these up ONE AT A TIME, in this order (SPEC.md §6):
//   1. getDocuments   -> GET  /api/documents   [IMPLEMENTED]
//   2. processDocument -> POST /api/process    [not yet — throwing stub below]
//   3. reviewDocument  -> POST /api/review     [not yet — throwing stub below]
//
// Request/response shapes: CONTRACT.md §1–§6.

const SERVER_BASE_URL = import.meta.env.VITE_SERVER_BASE_URL

const NOT_IMPLEMENTED =
  'Real endpoint not implemented yet. Set the matching VITE_USE_MOCK_* flag to ' +
  'true in client/.env, or wire this call to the Express proxy (see SPEC.md §6).'

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

// POST /api/process  ->  CONTRACT.md §1 (request) / §2 (success) / §3 (error)
// payload: { file_name, mime_type, file_base64, submitted_by? }
export async function processDocument(payload) {
  // TODO(step: connect /api/process) — see SPEC.md §6.
  throw new Error(NOT_IMPLEMENTED)
}

// POST /api/review  ->  CONTRACT.md §5 (request) / §6 (response, 404 if no match)
// payload: { document_id, status, reviewed_by, review_note? }
export async function reviewDocument(payload) {
  // TODO(step: connect /api/review) — see SPEC.md §6.
  throw new Error(NOT_IMPLEMENTED)
}
