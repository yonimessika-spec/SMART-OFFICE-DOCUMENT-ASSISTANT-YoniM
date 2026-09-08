import { REVIEW_STATUS_STYLES, REVIEW_STATUS_FALLBACK } from '../constants.js'

// Review-status pill for Archive rows. Mirrors UrgencyBadge: pill shape, a small
// leading dot, colour from a map in constants.js, label text always shown.
// "Needs Review" carries the warm amber (needs attention); "Reviewed" is muted.
export default function StatusBadge({ value }) {
  const label = value || 'Unknown'
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
