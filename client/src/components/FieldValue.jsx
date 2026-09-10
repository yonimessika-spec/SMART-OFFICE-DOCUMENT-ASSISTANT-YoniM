import { useTranslation } from 'react-i18next'

// Renders a single extracted value. SPEC.md §5 / F3: missing data must always
// render as visible text, never blank space and never a guess.
//
// n8n sends the literal English sentinels "Not found" / "No action found" for
// missing fields (CONTRACT.md §3); those two known markers — and a genuinely
// empty value — are shown in the UI language. Real field content (summary,
// deadline, sender, …) is rendered exactly as returned; `dir="auto"` lets each
// value orient by its own script so an English deadline stays LTR and a Hebrew
// one stays RTL even inside the opposite-direction layout.
export default function FieldValue({ value }) {
  const { t } = useTranslation()

  if (value === null || value === undefined || value === '' || value === 'Not found') {
    return <span className="text-muted-foreground italic">{t('common.notFound')}</span>
  }
  if (value === 'No action found') {
    return <span className="text-muted-foreground italic">{t('common.noActionFound')}</span>
  }
  return <span dir="auto">{value}</span>
}
