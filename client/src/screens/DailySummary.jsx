import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocuments } from '../store.jsx'
import { URGENCY_ORDER, URGENCY_STYLES, URGENCY_FALLBACK } from '../constants.js'
import { isToday, groupByUrgency, todayDateStamp } from '../utils/dailySummary.js'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import DailySummaryRow from '../components/DailySummaryRow.jsx'
import ErrorMessage from '../components/ErrorMessage.jsx'

// Section 15 extension — a screen mirroring the Part 1 "Daily Email Summary"
// n8n workflow's actual content: every document received TODAY, grouped by
// urgency only (High -> Medium -> Low), no other computation. Visible to every
// role, same as Dashboard — it's read-only over data GET /api/documents already
// serves to all three roles, so no new permission is needed.
//
// "Today" is a straight port of the email's own n8n Filter node (see
// utils/dailySummary.js) — a string comparison on received_at's date portion,
// not a Date parse, for the same reason received_at is never parsed elsewhere.
// A section with zero documents today is omitted rather than shown empty.

const SECTION_LABEL_KEY = {
  High: 'dailySummary.sectionHigh',
  Medium: 'dailySummary.sectionMedium',
  Low: 'dailySummary.sectionLow',
}

export default function DailySummary() {
  const { t } = useTranslation()
  const { documents, loading, error, refresh } = useDocuments()

  const todayDocs = useMemo(
    () => documents.filter((d) => isToday(d.received_at)),
    [documents],
  )
  const buckets = useMemo(
    () => groupByUrgency(todayDocs, URGENCY_ORDER),
    [todayDocs],
  )

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-1.5 h-4 w-2/3" />
          </div>
        ))}
      </div>
    )
  }
  if (error) return <ErrorMessage error={error} onRetry={refresh} />

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl">{t('dailySummary.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span dir="ltr" className="tabular-nums">
            {todayDateStamp()}
          </span>
          {' · '}
          {t('common.count', { count: todayDocs.length })}
        </p>
      </div>

      {todayDocs.length === 0 ? (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>{t('dailySummary.emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('dailySummary.emptyBody')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          {URGENCY_ORDER.filter((urgency) => buckets[urgency].length > 0).map(
            (urgency) => {
              const style = URGENCY_STYLES[urgency] || URGENCY_FALLBACK
              return (
                <div key={urgency} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: style.fg }}
                    />
                    <h2 className="text-base font-semibold" style={{ color: style.fg }}>
                      {t(SECTION_LABEL_KEY[urgency])}
                    </h2>
                    <span className="text-sm text-muted-foreground">
                      {t('common.count', { count: buckets[urgency].length })}
                    </span>
                  </div>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {buckets[urgency].map((doc) => (
                      <DailySummaryRow
                        key={doc.document_id || doc.file_name}
                        doc={doc}
                      />
                    ))}
                  </ul>
                </div>
              )
            },
          )}
        </div>
      )}
    </section>
  )
}
