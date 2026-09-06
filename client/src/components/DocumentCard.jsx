import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import UrgencyBadge from './UrgencyBadge.jsx'
import FieldValue from './FieldValue.jsx'

// One row in the dashboard list — a single large link target to the detail view.
export default function DocumentCard({ doc }) {
  // document_id is empty for real documents until Workflow A writes that column
  // (a later milestone). Fall back to file_name so this link and
  // DocumentDetail's lookup agree on the same identifier. Once document_id is
  // populated the fallback stops being reached.
  const ref = doc.document_id || doc.file_name
  return (
    <Link
      to={`/document/${encodeURIComponent(ref)}`}
      className="block rounded-xl border border-border bg-card p-5 shadow-xs transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
          {doc.file_name}
        </h2>
        <UrgencyBadge value={doc.urgency} />
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
        <span>{doc.status}</span>
        {/* received_at is an opaque display string from n8n — show it as-is. */}
        <span className="ml-auto tabular-nums">{doc.received_at}</span>
      </div>
    </Link>
  )
}
