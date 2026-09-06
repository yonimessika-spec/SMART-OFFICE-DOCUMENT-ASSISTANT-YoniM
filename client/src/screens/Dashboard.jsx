import { useMemo, useState } from 'react'
import { useDocuments } from '../store.jsx'
import DocumentCard from '../components/DocumentCard.jsx'
import ErrorMessage from '../components/ErrorMessage.jsx'

// F4 Dashboard + F5 Search & filters.
// - list every document, newest first
// - free-text over file_name / sender_or_company / summary
// - filters: urgency, document_type, department, status (combinable)
// - clear "no results" state, clear empty-list state (F7)
//
// Filter option lists are derived from the data itself, so no value is ever
// invented (SPEC.md §5).

const FILTER_KEYS = [
  ['urgency', 'Urgency'],
  ['document_type', 'Type'],
  ['department', 'Department'],
  ['status', 'Status'],
]

export default function Dashboard() {
  const { documents, loading, error, refresh } = useDocuments()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({})

  const options = useMemo(() => {
    const acc = { urgency: new Set(), document_type: new Set(), department: new Set(), status: new Set() }
    for (const d of documents) {
      for (const k of Object.keys(acc)) if (d[k]) acc[k].add(d[k])
    }
    return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, [...v].sort()]))
  }, [documents])

  // `documents` already arrives newest-first from the API layer. Filtering
  // preserves that order — received_at is an opaque string and is never sorted.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return documents.filter((d) => {
      if (q) {
        const haystack = [d.file_name, d.sender_or_company, d.summary]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return FILTER_KEYS.every(([k]) => !filters[k] || d[k] === filters[k])
    })
  }, [documents, query, filters])

  const hasActiveControls = query.trim() || Object.values(filters).some(Boolean)

  function setFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }))
  }
  function clearAll() {
    setQuery('')
    setFilters({})
  }

  if (loading) return <p className="state">Loading documents…</p>
  if (error) return <ErrorMessage error={error} onRetry={refresh} />

  return (
    <section>
      <h1>Documents</h1>

      <div className="controls">
        <input
          type="search"
          placeholder="Search file name, sender, or summary…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search documents"
        />
        {FILTER_KEYS.map(([key, label]) => (
          <label key={key}>
            {label}
            <select value={filters[key] || ''} onChange={(e) => setFilter(key, e.target.value)}>
              <option value="">All</option>
              {options[key].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
        {hasActiveControls && (
          <button type="button" onClick={clearAll}>
            Clear
          </button>
        )}
      </div>

      {documents.length === 0 ? (
        <p className="state">No documents have been processed yet.</p>
      ) : visible.length === 0 ? (
        <p className="state">
          No documents match your search and filters.{' '}
          <button type="button" className="link" onClick={clearAll}>
            Clear all
          </button>
        </p>
      ) : (
        <div className="doc-list">
          {visible.map((d) => (
            <DocumentCard key={d.document_id} doc={d} />
          ))}
        </div>
      )}
    </section>
  )
}
