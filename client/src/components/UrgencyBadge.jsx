import { useTranslation } from 'react-i18next'
import { URGENCY_STYLES, URGENCY_FALLBACK } from '../constants.js'

// Coloured urgency badge. SPEC.md F3: the label text is ALWAYS present — the
// colour is decoration, never the only signal. SPEC.md §5: the urgency *value*
// (High / Medium / Low) is displayed exactly as n8n returns it and is never
// translated; only the "Urgency:" prefix is localised.
export default function UrgencyBadge({ value }) {
  const { t } = useTranslation()
  const displayValue = value || t('common.notFound')
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
      {t('urgencyBadge.label', { value: displayValue })}
    </span>
  )
}
