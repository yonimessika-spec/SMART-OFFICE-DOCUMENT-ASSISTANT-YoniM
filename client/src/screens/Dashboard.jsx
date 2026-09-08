import { useMemo, useState } from 'react'
import { useDocuments } from '../store.jsx'
import { matchesQuery } from '../search.js'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import SearchField from '../components/SearchField.jsx'
import DocumentCard from '../components/DocumentCard.jsx'
import ErrorMessage from '../components/ErrorMessage.jsx'

// F4 Dashboard + F5 Search & filters.
// - free-text over file_name / sender_or_company / summary (shared: matchesQuery)
// - filters: urgency, document_type, department, status (combinable)
// - defaults to status "Processed" — the working inbox; other statuses stay
//   reachable from the Status dropdown
// - clear "no results" state, clear empty-list state (F7)
//
// Filter option lists are derived from the data itself, so no value is ever
// invented (SPEC.md §5).

const DEFAULT_STATUS = 'Processed'

const FILTER_KEYS = [
  ['urgency', 'Urgency'],
  ['document_type', 'Type'],
  ['department', 'Department'],
  ['status', 'Status'],
]

export default function Dashboard() {
  const { documents, loading, error, refresh } = useDocuments()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ status: DEFAULT_STATUS })

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
    return documents.filter(
      (d) =>
        matchesQuery(d, query) &&
        FILTER_KEYS.every(([k]) => !filters[k] || d[k] === filters[k]),
    )
  }, [documents, query, filters])

  // The default status filter doesn't count as an "active" control.
  const hasActiveControls =
    query.trim() ||
    Object.entries(filters).some(
      ([k, v]) => v && !(k === 'status' && v === DEFAULT_STATUS),
    )

  function setFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }))
  }
  function clearAll() {
    setQuery('')
    setFilters({})
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-1.5 h-4 w-2/3" />
            <Skeleton className="mt-4 h-4 w-40" />
          </div>
        ))}
      </div>
    )
  }
  if (error) return <ErrorMessage error={error} onRetry={refresh} />

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {visible.length === documents.length
            ? `${documents.length} ${documents.length === 1 ? 'document' : 'documents'}`
            : `${visible.length} of ${documents.length} documents`}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <SearchField value={query} onChange={setQuery} />

        <div className="flex flex-wrap gap-2">
          {FILTER_KEYS.map(([key, label]) => (
            <Select
              key={key}
              value={filters[key] || 'all'}
              onValueChange={(v) => setFilter(key, v === 'all' ? '' : v)}
            >
              <SelectTrigger className="w-38" aria-label={label}>
                <SelectValue placeholder={label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
                {options[key].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          {hasActiveControls && (
            <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {documents.length === 0 ? (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>No documents yet</EmptyTitle>
            <EmptyDescription>
              No documents have been processed yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : visible.length === 0 ? (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>
              No documents match your search and filters.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={clearAll}>
              Clear all
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((d) => (
            // document_id is empty until Workflow A exists (M4); fall back to the
            // file_name, which is unique in the current dataset. Once Workflow A
            // populates document_id this naturally prefers it.
            <DocumentCard key={d.document_id || d.file_name} doc={d} />
          ))}
        </div>
      )}
    </section>
  )
}
