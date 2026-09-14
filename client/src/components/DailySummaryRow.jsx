import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import FieldValue from './FieldValue.jsx'

// One row in a Daily Summary urgency section. Columns mirror the Part 1 daily
// email's table exactly — Type / From / Deadline / Dept — plus the file name as
// the row's link text: the email couldn't link anywhere (it's a static
// message), but a screen naturally can, and every other list in this app
// already links its rows to /document/:id the same way (DocumentCard,
// ArchiveCard, Upload's result rows).
//
// The whole row is the link (same hover/focus treatment as DocumentCard's
// whole-card link — a subtle background tint on hover plus a focus ring —
// rather than only the file name being clickable), so nothing here reads as
// plain text when it isn't.
export default function DailySummaryRow({ doc }) {
  const ref = doc.document_id || doc.file_name

  return (
    <li>
      <Link
        to={`/document/${encodeURIComponent(ref)}`}
        className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-accent/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4"
      >
        <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {doc.file_name}
        </span>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:shrink-0">
          <Badge variant="outline" className="font-normal">
            {doc.document_type}
          </Badge>
          <span dir="auto" className="max-w-40 truncate">
            <FieldValue value={doc.sender_or_company} />
          </span>
          <span dir="auto">
            <FieldValue value={doc.deadline} />
          </span>
          <Badge variant="outline" className="font-normal">
            {doc.department}
          </Badge>
        </div>
      </Link>
    </li>
  )
}
