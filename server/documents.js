// Read-only lookup of one document from n8n's documents data (the Sheet).
//
// Review-request emails are built from what the Sheet says, never from fields the
// browser sends, so a request cannot put invented content into an email that comes
// from the app. The same GET the dashboard uses is called with the shared secret.

const { N8N_BASE_URL, N8N_DOCUMENTS_PATH, N8N_SECRET, REQUEST_TIMEOUT_MS = '90000' } = process.env

const timeoutMs = Number(REQUEST_TIMEOUT_MS) || 90000

function typedError(status, code, message) {
  const e = new Error(message)
  e.status = status
  e.code = code
  return e
}

// Same identity the client router uses: document_id, falling back to file_name.
export async function fetchDocumentById(id) {
  const wanted = String(id || '')
  if (!wanted) throw typedError(400, 'INVALID_INPUT', 'A document_id is required.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let rows
  try {
    const res = await fetch(`${N8N_BASE_URL}${N8N_DOCUMENTS_PATH}`, {
      headers: { 'x-api-key': N8N_SECRET, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) {
      throw typedError(502, 'DOCUMENTS_UNAVAILABLE', 'Could not load the document from the automation service.')
    }
    rows = await res.json()
  } catch (err) {
    if (err.code === 'DOCUMENTS_UNAVAILABLE') throw err
    throw typedError(
      502,
      'DOCUMENTS_UNAVAILABLE',
      err.name === 'AbortError'
        ? 'The automation service took too long to respond.'
        : 'Could not reach the automation service.',
    )
  } finally {
    clearTimeout(timer)
  }

  if (!Array.isArray(rows)) {
    throw typedError(502, 'DOCUMENTS_UNAVAILABLE', 'The automation service returned an unexpected response.')
  }
  const row = rows.find((d) => (d.document_id || d.file_name) === wanted)
  if (!row) throw typedError(404, 'DOCUMENT_NOT_FOUND', 'That document is no longer in the sheet.')

  // Only the fields the email needs, as plain strings. file_link is deliberately
  // not copied: the Drive link is private to the account that owns the file.
  const str = (v) => (v === undefined || v === null ? '' : String(v))
  return {
    document_id: str(row.document_id || row.file_name),
    file_name: str(row.file_name),
    document_type: str(row.document_type),
    sender_or_company: str(row.sender_or_company),
    summary: str(row.summary),
    requested_action: str(row.requested_action),
    deadline: str(row.deadline),
    urgency: str(row.urgency),
  }
}
