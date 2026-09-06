import { URGENCY_STYLES, URGENCY_FALLBACK } from '../constants.js'

// Coloured urgency badge. SPEC.md F3: the label text is ALWAYS present — the
// colour is decoration, never the only signal. Unknown values still render as
// text (SPEC.md §5: display exactly what n8n returns).
export default function UrgencyBadge({ value }) {
  const label = value || 'Not found'
  const style = URGENCY_STYLES[value] || URGENCY_FALLBACK
  return (
    <span
      className="urgency-badge"
      style={{
        backgroundColor: style.bg,
        color: style.fg,
        border: `1px solid ${style.border}`,
      }}
    >
      Urgency: {label}
    </span>
  )
}
