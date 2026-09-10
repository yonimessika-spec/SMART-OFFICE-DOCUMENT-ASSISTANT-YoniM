// Client-only CSV export. No dependency, no backend — turns an array of plain
// row objects + a column list into a downloadable UTF-8 CSV Blob and (optionally)
// triggers the browser download. Shared by Dashboard and Archive so the two
// screens can't drift apart.
//
// Why the BOM: several fields (Document Type, Department, Summary, Review Note …)
// can hold Hebrew. Excel only reads a bare .csv as UTF-8 when it starts with a
// byte-order mark, so without this prefix Hebrew opens as mojibake on the very
// machines this app is built for.

// Excel-friendly UTF-8 byte-order mark (U+FEFF).
export const CSV_BOM = String.fromCharCode(0xfeff)

// RFC 4180 line ending.
const EOL = '\r\n'

// Columns exported for a document row, in this exact order (matches the feature
// spec). Deliberately omits row_number, deadline_iso and File Link. `header` is
// the literal column title; `key` is the property read off each row object.
export const DOCUMENT_CSV_COLUMNS = [
  { header: 'Document ID', key: 'document_id' },
  { header: 'File Name', key: 'file_name' },
  { header: 'Document Type', key: 'document_type' },
  { header: 'Department', key: 'department' },
  { header: 'Urgency', key: 'urgency' },
  { header: 'Deadline', key: 'deadline' },
  { header: 'Status', key: 'status' },
  { header: 'Reviewed By', key: 'reviewed_by' },
  { header: 'Review Note', key: 'review_note' },
  { header: 'Submitted By', key: 'submitted_by' },
  { header: 'Received At', key: 'received_at' },
  { header: 'Summary', key: 'summary' },
]

// One CSV field: stringify, and wrap in double quotes (doubling any internal
// quote) only when it contains a comma, quote, CR or LF — RFC 4180 §2.6/2.7.
function escapeField(value) {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// rows: array of plain objects. columns: [{ header, key }].
// Returns the full CSV text, BOM included, with a trailing newline.
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => escapeField(c.header)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => escapeField(row[c.key])).join(','))
  }
  return CSV_BOM + lines.join(EOL) + EOL
}

// Same inputs, wrapped as a Blob ready for download.
export function toCsvBlob(rows, columns) {
  return new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })
}

// Today's date as YYYY-MM-DD in the user's local timezone (for the filename).
export function exportDateStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Build the Blob and trigger a client-side download: object URL -> a temporary
// <a> click -> revoke. Returns nothing. Browser-only (needs document / URL).
export function downloadCsv(filename, rows, columns) {
  const url = URL.createObjectURL(toCsvBlob(rows, columns))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the download has certainly started first.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
