// Mock API layer.
//
// Returns the example JSON straight from CONTRACT.md (sections 2, 4 and 6) so the
// three screens can be built and reviewed with no server and no n8n. Every
// function here mirrors the signature and return shape of its twin in client.js.
//
// Nothing in this file makes a network request.

const LATENCY_MS = 600 // pretend the network exists, so processing/loading states are visible

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// --- Seed data -------------------------------------------------------------

// CONTRACT.md §4 — GET /documents response (200). One row given in the contract;
// a couple more added here (same shape, values drawn from the allowed sets in
// SPEC.md §5) so the dashboard list, search and filters have something to chew on.
//
// Stored oldest-first, the way the real n8n webhook returns rows (Google-Sheet
// insertion order). received_at values are opaque display strings — never parsed.
const DOCUMENTS = [
  {
    document_id: 'exec-1045',
    received_at: '2026-03-09T08:47:00Z',
    file_name: 'support-escalation.txt',
    file_link: 'https://drive.google.com/file/d/7g8h9i/view',
    document_type: 'request',
    sender_or_company: 'Acme Retail',
    summary: 'Customer reports repeated outages on the shared portal.',
    requested_action: 'Escalate to infrastructure team and reply within 24h',
    deadline: '10 March 2026',
    urgency: 'Medium',
    department: 'Support',
    status: 'Reviewed',
  },
  {
    document_id: 'exec-1044',
    received_at: '2026-03-10T14:05:00Z',
    file_name: 'q2-partnership-proposal.docx',
    file_link: 'https://drive.google.com/file/d/4d5e6f/view',
    document_type: 'quote',
    sender_or_company: 'Brightline Partners',
    summary: 'Proposal outlining a co-marketing arrangement for Q2.',
    requested_action: 'No action found',
    deadline: 'Not found',
    urgency: 'Low',
    department: 'Sales',
    status: 'Processed',
  },
  {
    document_id: 'exec-1043',
    received_at: '2026-03-11T09:24:00Z',
    file_name: 'invoice-4471.pdf',
    file_link: 'https://drive.google.com/file/d/1a2b3c/view',
    document_type: 'invoice',
    sender_or_company: 'Nordic Supplies Ltd',
    summary: 'Invoice for office chairs delivered in February.',
    requested_action: 'Approve and pay invoice 4471',
    deadline: '12 March 2026',
    urgency: 'High',
    department: 'Finance',
    status: 'Processed',
  },
]

// CONTRACT.md §2 — POST /process-document success response (200), verbatim.
const PROCESS_SUCCESS = {
  status: 'processed',
  document_id: 'exec-1043',
  file_name: 'invoice-4471.pdf',
  file_link: 'https://drive.google.com/file/d/1a2b3c/view',
  received_at: '2026-03-11T09:24:00Z',
  fields: {
    document_type: 'invoice',
    sender_or_company: 'Nordic Supplies Ltd',
    summary: 'Invoice for office chairs delivered in February.',
    requested_action: 'Approve and pay invoice 4471',
    deadline: '12 March 2026',
    urgency: 'High',
    department: 'Finance',
  },
  notification_sent: true,
}

// --- API functions -------------------------------------------------------

// GET /api/documents  ->  CONTRACT.md §4
// Mirrors the real path: n8n returns rows oldest-first, so newest-first for the
// UI (SPEC.md F4) is just the reverse. No date parsing.
export async function getDocuments() {
  await delay(LATENCY_MS)
  return [...DOCUMENTS].reverse()
}

// POST /api/process  ->  CONTRACT.md §2 (success) / §3 (error)
// `payload` is { file_name, mime_type, file_base64, submitted_by? } per §1.
// The mock ignores the bytes and always returns the §2 example.
export async function processDocument(payload) {
  await delay(LATENCY_MS)
  return { ...PROCESS_SUCCESS, file_name: payload?.file_name ?? PROCESS_SUCCESS.file_name }
}

// POST /api/review  ->  CONTRACT.md §6
// `payload` is { document_id, status, reviewed_by, review_note? } per §5.
export async function reviewDocument(payload) {
  await delay(LATENCY_MS)
  const known = DOCUMENTS.some((d) => d.document_id === payload?.document_id)
  if (!known) {
    // §6: 404 when no row matches document_id.
    const err = new Error('No document matches that ID.')
    err.status = 404
    throw err
  }
  return { status: 'updated', document_id: payload.document_id }
}
