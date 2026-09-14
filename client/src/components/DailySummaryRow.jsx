import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import FieldValue from './FieldValue.jsx'

// One row in a Daily Summary urgency section. Columns mirror the Part 1 daily
// email's table exactly — Type / From / Deadline / Dept — plus the file name as
// the row's link text: the email couldn't link anywhere (it's a static
// message), but a screen naturally can, and every other list in this app
// already links its rows to /document/:id the same way (DocumentCard,
// ArchiveCard, Upload's result rows).
export default function DailySummaryRow({ doc }) {
  const ref = doc.document_id || doc.file_name

  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <Link
        to={`/document/${encodeURIComponent(ref)}`}
        dir="auto"
        className="min-w-0 flex-1 truncate text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {doc.file_name}
      </Link>

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
    </li>
  )
}
