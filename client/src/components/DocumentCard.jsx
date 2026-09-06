import { Link } from 'react-router-dom'
import UrgencyBadge from './UrgencyBadge.jsx'
import FieldValue from './FieldValue.jsx'

// One row in the dashboard list. Links to the detail view.
export default function DocumentCard({ doc }) {
  return (
    <Link to={`/document/${doc.document_id}`} className="doc-card">
      <div className="doc-card__head">
        <span className="doc-card__name">{doc.file_name}</span>
        <UrgencyBadge value={doc.urgency} />
      </div>
      <p className="doc-card__summary">
        <FieldValue value={doc.summary} />
      </p>
      <div className="doc-card__meta">
        <span>{doc.document_type}</span>
        <span>{doc.department}</span>
        <span>{doc.status}</span>
        {/* received_at is an opaque display string from n8n — show it as-is. */}
        <span>{doc.received_at}</span>
      </div>
    </Link>
  )
}
