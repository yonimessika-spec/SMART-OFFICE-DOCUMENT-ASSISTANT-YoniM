import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { useDocuments } from '../store.jsx'
import { matchesQuery } from '../search.js'
import { downloadCsv, DOCUMENT_CSV_COLUMNS, exportDateStamp } from '../utils/csvExport.js'
import { Button } from '@/components/ui/button'
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

// Archive — handled/done documents only (status "Reviewed"). "Needs Review"
// documents still need action, so they stay on the Dashboard, not here. Same
// free-text search as the Dashboard; each row can be reopened.
export default function Archive() {
  const { t } = useTranslation()
  const { documents, loading, error, refresh } = useDocuments()
  const [query, setQuery] = useState('')

  const archived = useMemo(
    () => documents.filter((d) => d.status === 'Reviewed'),
    [documents],
  )
  const visible = useMemo(
    () => archived.filter((d) => matchesQuery(d, query)),
    [archived, query],
  )

  // Export exactly the archived rows currently visible (search applied).
  function exportCsv() {
    if (visible.length === 0) return
    downloadCsv(`archive-export-${exportDateStamp()}.csv`, visible, DOCUMENT_CSV_COLUMNS)
  }

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">{t('archive.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {visible.length === archived.length
              ? t('common.count', { count: archived.length })
              : t('common.countFiltered', { visible: visible.length, total: archived.length })}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={visible.length === 0}
        >
          <Download aria-hidden="true" />
          {t('archive.exportCsv')}
        </Button>
      </div>

      <SearchField value={query} onChange={setQuery} label={t('search.ariaArchive')} />

      {archived.length === 0 ? (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>{t('archive.emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('archive.emptyBody')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : visible.length === 0 ? (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>{t('common.noMatchesTitle')}</EmptyTitle>
            <EmptyDescription>{t('archive.noMatchesBody')}</EmptyDescription>
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
