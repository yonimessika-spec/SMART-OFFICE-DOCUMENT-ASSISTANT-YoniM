import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import UrgencyBadge from './UrgencyBadge.jsx'
import StatusBadge from './StatusBadge.jsx'
import FieldValue from './FieldValue.jsx'
import ReopenDialog from './ReopenDialog.jsx'

// One row in the Archive list. Every Archive document is "Reviewed" (handled),
// so the card stays neutral — the amber "Needs Review" treatment moved to the
// Dashboard's DocumentCard. Unlike DocumentCard the whole card isn't a link (it
// contains the Reopen button) — the file name links to the detail view.
export default function ArchiveCard({ doc }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <Link
          dir="auto"
          to={`/document/${encodeURIComponent(doc.document_id || doc.file_name)}`}
          className="min-w-0 flex-1 truncate text-base font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {doc.file_name}
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge value={doc.status} />
          <UrgencyBadge value={doc.urgency} />
        </div>
      </div>

      <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
        <FieldValue value={doc.summary} />
      </p>

      {doc.review_note ? (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs">
          <span className="text-muted-foreground">{t('detail.reviewNoteLabel')}</span>
          <FieldValue value={doc.review_note} />
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="font-normal">
          {doc.document_type}
        </Badge>
        <Badge variant="outline" className="font-normal">
          {doc.department}
        </Badge>
        {doc.reviewed_by ? (
          <span>{t('archive.reviewedBy', { name: doc.reviewed_by })}</span>
        ) : null}
        {/* received_at is an opaque display string from n8n — show it as-is,
            and keep it LTR even inside an RTL layout. */}
        <span dir="ltr" className="tabular-nums">
          {doc.received_at}
        </span>
        <div className="ms-auto">
          <ReopenDialog doc={doc} />
        </div>
      </div>
    </div>
  )
}
