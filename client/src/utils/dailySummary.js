// Client-side port of the Part 1 "Document Assistant - Daily Email Summary"
// workflow's logic, so the in-app screen shows the same thing that email would
// contain if it ran right now. Nothing here talks to the network — it filters
// and groups the document list already loaded via GET /api/documents.
//
// The n8n "Today Only" node does exactly this:
//   {{ $json['Received At'].split(' ')[0] }} === {{ $now.format('dd/MM/yyyy') }}
// i.e. a STRING comparison on the date portion of `Received At`, not a real
// Date parse. `received_at` is CONTRACT.md's opaque "DD/MM/YYYY HH:mm" display
// string (Google Sheets' own locale format) and is never parsed with `new
// Date()` anywhere in this app, for the documented reason that it isn't ISO
// 8601 and JS's parser can misread day vs. month. This mirrors that same rule
// rather than reintroducing the problem.

function ddMmYyyy(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

// Today's date in the same 'dd/MM/yyyy' shape the comparison (and the email)
// use, from the browser's local clock. Exported so the screen can show the
// same date it filtered by.
export function todayDateStamp(date = new Date()) {
  return ddMmYyyy(date)
}

// True when `receivedAt` (a document's opaque received_at string) falls on
// today's date, by the same string comparison the n8n workflow performs.
export function isToday(receivedAt, date = new Date()) {
  if (!receivedAt) return false
  return String(receivedAt).split(' ')[0] === ddMmYyyy(date)
}

// Buckets `docs` by `urgency`, in `order`. A bucket for a value not present in
// `order` is never created — matches the email, which only ever prints
// High/Medium/Low rows and silently has nothing to say about any other value.
export function groupByUrgency(docs, order) {
  const buckets = Object.fromEntries(order.map((urgency) => [urgency, []]))
  for (const doc of docs) {
    if (buckets[doc.urgency]) buckets[doc.urgency].push(doc)
  }
  return buckets
}
