// Free-text search over a document, per SPEC.md F5: matches on file_name,
// sender_or_company and summary. Shared by Dashboard and Archive so the two
// screens can't drift apart.
export function matchesQuery(doc, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [doc.file_name, doc.sender_or_company, doc.summary]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q)
}
