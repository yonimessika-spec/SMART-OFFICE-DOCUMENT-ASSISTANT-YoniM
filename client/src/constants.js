// Display + validation constants. No business logic — these only mirror what
// SPEC.md and CONTRACT.md already state.

// SPEC.md F1: only PDF / DOCX / TXT accepted.
export const ACCEPTED_TYPES = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
}

// Client-side size ceiling (SPEC.md F1: reject oversized files before any
// request). Configurable via VITE_MAX_FILE_MB in client/.env; falls back to 10.
export const MAX_FILE_MB = Number(import.meta.env.VITE_MAX_FILE_MB) || 10
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

// SPEC.md §5: urgency values are displayed exactly as n8n returns them.
// This map is presentation only (badge colour). Label text is always shown too —
// never colour-only (SPEC.md F3).
export const URGENCY_STYLES = {
  High: { bg: '#fdecea', fg: '#8b1a10', border: '#e5534b' },
  Medium: { bg: '#fff4e5', fg: '#8a5a00', border: '#e0a13c' },
  Low: { bg: '#eaf4ec', fg: '#1e5631', border: '#4caf7d' },
}
export const URGENCY_FALLBACK = { bg: '#eee', fg: '#333', border: '#999' }

// Review-status pill colours for StatusBadge (Dashboard + Archive rows).
// Same shape as URGENCY_STYLES. "Needs Review" reuses the warm amber already
// defined for Medium urgency — same palette, no new colour — so it reads as
// needing attention. Everything else ("Reviewed", "Processed", …) falls back to
// the neutral warm-stone token values from index.css
// (--muted / --muted-foreground / --border).
export const REVIEW_STATUS_STYLES = {
  'Needs Review': URGENCY_STYLES.Medium,
  Reviewed: { bg: '#f3efe9', fg: '#6b625a', border: '#e7e1d9' },
}
export const REVIEW_STATUS_FALLBACK = { bg: '#f3efe9', fg: '#6b625a', border: '#e7e1d9' }

// The seven extracted fields, in display order, with human labels (CONTRACT.md §2).
export const FIELD_LABELS = [
  ['document_type', 'Document type'],
  ['sender_or_company', 'Sender / company'],
  ['summary', 'Summary'],
  ['requested_action', 'Requested action'],
  ['deadline', 'Deadline'],
  ['urgency', 'Urgency'],
  ['department', 'Department'],
]

// error_code -> plain-language sentence (SPEC.md F7).
// CONTRACT.md §3 (process) + §6 (review).
export const ERROR_MESSAGES = {
  UNSUPPORTED_FILE_TYPE: 'Only PDF, DOCX and TXT files can be processed.',
  EMPTY_DOCUMENT: 'No readable text — try a different file.',
  EXTRACTION_FAILED: 'The document could not be read. You can try again.',
  UNAUTHORIZED: 'Configuration error: the server rejected our credentials. This is not something you can fix here.',
  DOCUMENT_NOT_FOUND: 'That document is no longer in the sheet — it may have been removed.',
}

export const GENERIC_ERROR =
  'Something went wrong and the request did not complete. Please try again.'
