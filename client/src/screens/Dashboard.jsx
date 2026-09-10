import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

// F4 Dashboard + F5 Search & filters. See src/locales for all UI copy.
//
// The Status filter defaults to the "active work" set: "Needs Review" (looked
// at, still needs action) + "Processed" (not looked at yet). "Reviewed"
// documents live on the Archive page. The dropdown still narrows to one status
// or widens to all. Filter option values are the raw n8n strings (SPEC.md §5);
// only their display labels are localised.

// Status-filter sentinels (never real status values).
const ACTIVE = '__active' // default: Needs Review + Processed
const ALL = '__all' // every status, including Reviewed

const ACTIVE_STATUSES = ['Needs Review', 'Processed']
const STATUS_RANK = { 'Needs Review': 0, Processed: 1 } // Needs Review sorts first

const FILTER_KEYS = [
  { key: 'urgency', label: 'filters.urgency', all: 'filters.allUrgency' },
  { key: 'document_type', label: 'filters.type', all: 'filters.allType' },
  { key: 'department', label: 'filters.department', all: 'filters.allDepartment' },
]

export default function Dashboard() {
  const { t } = useTranslation()
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
        if (s === ACTIVE && !ACTIVE_STATUSES.includes(d.status)) return false
        if (s !== ACTIVE && s !== ALL && d.status !== s) return false
        return FILTER_KEYS.every(({ key }) => !filters[key] || d[key] === filters[key])
      })
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
        <h1 className="text-2xl">{t('dashboard.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {visible.length === documents.length
            ? t('common.count', { count: documents.length })
            : t('common.countFiltered', { visible: visible.length, total: documents.length })}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <SearchField value={query} onChange={setQuery} />

        <div className="flex flex-wrap gap-2">
          {FILTER_KEYS.map(({ key, label, all }) => (
            <Select
              key={key}
              value={filters[key] || 'all'}
              onValueChange={(v) => setFilter(key, v === 'all' ? '' : v)}
            >
              <SelectTrigger className="w-38" aria-label={t(label)}>
                <SelectValue placeholder={t(label)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(all)}</SelectItem>
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
            <SelectTrigger className="w-56" aria-label={t('filters.status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ACTIVE}>{t('filters.statusActive')}</SelectItem>
              {options.status.map((v) => (
                <SelectItem key={v} value={v}>
                  {t(`status.${v}`, { defaultValue: v })}
                </SelectItem>
              ))}
              <SelectItem value={ALL}>{t('filters.allStatuses')}</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveControls && (
            <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
              {t('common.clear')}
            </Button>
          )}
        </div>
      </div>

      {documents.length === 0 ? (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>{t('dashboard.emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('dashboard.emptyBody')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : visible.length === 0 ? (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>{t('common.noMatchesTitle')}</EmptyTitle>
            <EmptyDescription>{t('dashboard.noMatchesBody')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={clearAll}>
              {t('common.clearAll')}
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
