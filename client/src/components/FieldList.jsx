import { useTranslation } from 'react-i18next'
import { FIELD_KEYS } from '../constants.js'
import FieldValue from './FieldValue.jsx'
import UrgencyBadge from './UrgencyBadge.jsx'

// The seven extracted fields in contract order (CONTRACT.md §2).
// `fields` may be the nested `fields` object (from /process) or a flat document
// row (from /documents) — both carry the same keys.
export default function FieldList({ fields }) {
  const { t } = useTranslation()
  return (
    <dl className="divide-y divide-border rounded-lg border border-border">
      {FIELD_KEYS.map((key) => (
        <div
          key={key}
          className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4"
        >
          <dt className="text-sm text-muted-foreground">{t(`fields.${key}`)}</dt>
          <dd className="text-sm">
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
