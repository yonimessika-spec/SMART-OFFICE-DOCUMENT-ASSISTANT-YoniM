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
// - the Status filter defaults to the "active work" set: "Needs Review" (looked
//   at, still needs action) + "Processed" (not looked at yet). "Reviewed"
//   documents live on the Archive page. The dropdown still lets a user narrow to
//   one status, or widen to all.
// - "Needs Review" rows sort first and carry the amber StatusBadge treatment.
// - clear "no results" state, clear empty-list state (F7)
//
// Filter option lists are derived from the data itself, so no value is ever
// invented (SPEC.md §5).

// Status-filter sentinels (never real status values).
const ACTIVE = '__active' // default: Needs Review + Processed
const ALL = '__all' // every status, including Reviewed

const ACTIVE_STATUSES = ['Needs Review', 'Processed']
const STATUS_RANK = { 'Needs Review': 0, Processed: 1 } // Needs Review sorts first

const FILTER_KEYS = [
  ['urgency', 'Urgency'],
  ['document_type', 'Type'],
  ['department', 'Department'],
]

export default function Dashboard() {
  const { documents, loading, error, refresh } = useDocuments()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ status: ACTIVE })

  const options = useMemo(() => {
    const acc = { urgency: new Set(), document_type: new Set(), department: new Set(), status: new Set() }
    for (const d of documents) {
      for (const k of Object.keys(acc)) if (d[k]) acc[k].add(d[k])
    }
    return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, [...v].sort()]))
  }, [documents])

  const visible = useMemo(() => {
    const s = filters.status
    return documents
      .filter((d) => {
        if (!matchesQuery(d, query)) return false
        // status: ACTIVE -> the two active statuses; ALL -> no constraint;
        // a real value -> just that one
        if (s === ACTIVE && !ACTIVE_STATUSES.includes(d.status)) return false
        if (s !== ACTIVE && s !== ALL && d.status !== s) return false
        return FILTER_KEYS.every(([k]) => !filters[k] || d[k] === filters[k])
      })
      // stable sort keeps the API layer's newest-first order within each group;
      // "Needs Review" ahead of "Processed", anything else last
      .sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9))
  }, [documents, query, filters])

  const hasActiveControls =
    query.trim() ||
    filters.urgency ||
    filters.document_type ||
    filters.department ||
    filters.status !== ACTIVE

  function setFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }))
  }
  function clearAll() {
    setQuery('')
    setFilters({ status: ACTIVE })
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

          <Select
            value={filters.status || ACTIVE}
            onValueChange={(v) => setFilters((prev) => ({ ...prev, status: v }))}
          >
            <SelectTrigger className="w-56" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ACTIVE}>Needs Review + Processed</SelectItem>
              {options.status.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
              <SelectItem value={ALL}>All statuses</SelectItem>
            </SelectContent>
          </Select>

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
            <DocumentCard key={d.document_id || d.file_name} doc={d} />
          ))}
        </div>
      )}
    </section>
  )
}
