import { FIELD_LABELS } from '../constants.js'
import FieldValue from './FieldValue.jsx'
import UrgencyBadge from './UrgencyBadge.jsx'

// The seven extracted fields in contract order (CONTRACT.md §2).
// `fields` may be the nested `fields` object (from /process) or a flat document
// row (from /documents) — both carry the same keys.
export default function FieldList({ fields }) {
  return (
    <dl className="field-list">
      {FIELD_LABELS.map(([key, label]) => (
        <div className="field-row" key={key}>
          <dt>{label}</dt>
          <dd>
            {key === 'urgency' ? (
              <UrgencyBadge value={fields?.[key]} />
            ) : (
              <FieldValue value={fields?.[key]} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
