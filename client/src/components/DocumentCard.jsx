import { Link } from 'react-router-dom'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { REVIEW_STATUS_STYLES } from '../constants.js'
import UrgencyBadge from './UrgencyBadge.jsx'
import StatusBadge from './StatusBadge.jsx'
import FieldValue from './FieldValue.jsx'

// One row in the dashboard list — a single large link target to the detail view.
// "Needs Review" rows get a warm-amber border + faint fill (same treatment the
// Archive list used for them) so they stand out from plain "Processed" rows.
export default function DocumentCard({ doc }) {
  // document_id is empty for real documents until Workflow A writes that column.
  // Fall back to file_name so this link and DocumentDetail's lookup agree.
  const ref = doc.document_id || doc.file_name
  const needsReview = doc.status === 'Needs Review'
  const accent = REVIEW_STATUS_STYLES[doc.status]

  return (
    <Link
      to={`/document/${encodeURIComponent(ref)}`}
      className={cn(
        'block rounded-xl border p-5 shadow-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        needsReview
          ? ''
          : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30',
      )}
      style={
        needsReview
          ? { borderColor: accent.border, backgroundColor: accent.bg }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          dir="auto"
          className="min-w-0 flex-1 truncate text-base font-semibold text-foreground"
        >
          {doc.file_name}
        </h2>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge value={doc.status} />
          <UrgencyBadge value={doc.urgency} />
        </div>
      </div>

      <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
        <FieldValue value={doc.summary} />
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="font-normal">
          {doc.document_type}
        </Badge>
        <Badge variant="outline" className="font-normal">
          {doc.department}
        </Badge>
        {/* received_at is an opaque display string from n8n — show it as-is,
            and keep it LTR even inside an RTL layout. */}
        <span dir="ltr" className="ms-auto tabular-nums">
          {doc.received_at}
        </span>
      </div>
    </Link>
  )
}
