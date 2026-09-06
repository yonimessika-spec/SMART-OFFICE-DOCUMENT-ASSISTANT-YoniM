import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useDocuments } from '../store.jsx'
import { Input } from '@/components/ui/input'
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
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            placeholder="Search file name, sender, or summary…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search documents"
            className="pl-9"
          />
        </div>

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
