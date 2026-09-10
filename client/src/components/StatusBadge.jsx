import { useTranslation } from 'react-i18next'
import { REVIEW_STATUS_STYLES, REVIEW_STATUS_FALLBACK } from '../constants.js'

// Review-status pill. Mirrors UrgencyBadge: pill shape, a small leading dot,
// colour from a map in constants.js, label text always shown. The raw status
// value ("Processed" / "Needs Review" / "Reviewed") drives colour + filtering;
// the label is shown in the UI language via the `status.*` map.
export default function StatusBadge({ value }) {
  const { t } = useTranslation()
  const label = value
    ? t(`status.${value}`, { defaultValue: value })
    : t('common.notFound')
  const style = REVIEW_STATUS_STYLES[value] || REVIEW_STATUS_FALLBACK
  return (
    <span
      className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{
        backgroundColor: style.bg,
        color: style.fg,
        borderColor: style.border,
      }}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ backgroundColor: style.fg }}
      />
      {label}
    </span>
  )
}
