import { useMemo, useState } from 'react'
import { useDocuments } from '../store.jsx'
import { matchesQuery } from '../search.js'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import SearchField from '../components/SearchField.jsx'
import ArchiveCard from '../components/ArchiveCard.jsx'
import ErrorMessage from '../components/ErrorMessage.jsx'

// Archive — documents that have been reviewed (or flagged for review).
// Same free-text search as the Dashboard (shared: SearchField + matchesQuery);
// each row can be reopened, which sends it back to the Dashboard.
const ARCHIVED = new Set(['Reviewed', 'Needs Review'])

export default function Archive() {
  const { documents, loading, error, refresh } = useDocuments()
  const [query, setQuery] = useState('')

  const archived = useMemo(
    () => documents.filter((d) => ARCHIVED.has(d.status)),
    [documents],
  )
  const visible = useMemo(
    () => archived.filter((d) => matchesQuery(d, query)),
    [archived, query],
  )

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-3 h-4 w-full" />
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
        <h1 className="text-2xl">Archive</h1>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {visible.length === archived.length
            ? `${archived.length} ${archived.length === 1 ? 'document' : 'documents'}`
            : `${visible.length} of ${archived.length} documents`}
        </p>
      </div>

      <SearchField value={query} onChange={setQuery} label="Search the archive" />

      {archived.length === 0 ? (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>Nothing archived yet</EmptyTitle>
            <EmptyDescription>
              Documents show up here once they’re marked as reviewed.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : visible.length === 0 ? (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>
              No archived documents match your search.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((d) => (
            <ArchiveCard key={d.document_id || d.file_name} doc={d} />
          ))}
        </div>
      )}
    </section>
  )
}
