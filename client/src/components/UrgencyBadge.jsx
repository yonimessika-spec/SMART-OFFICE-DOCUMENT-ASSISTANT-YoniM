import { URGENCY_STYLES, URGENCY_FALLBACK } from '../constants.js'

// Coloured urgency badge. SPEC.md F3: the label text is ALWAYS present — the
// colour is decoration, never the only signal. Unknown values still render as
// text (SPEC.md §5: display exactly what n8n returns).
//
// Styling pass: only the shape/spacing changed (rounder pill, roomier padding,
// a small leading dot). The colour mapping is unchanged — it comes straight from
// URGENCY_STYLES in constants.js and must never be altered.
export default function UrgencyBadge({ value }) {
  const label = value || 'Not found'
  const style = URGENCY_STYLES[value] || URGENCY_FALLBACK
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
      Urgency: {label}
    </span>
  )
}
