// Renders a single extracted value. SPEC.md §5 / F3: the literal strings
// "Not found" and "No action found" must render as visible text, never blank
// space and never replaced with a guess. Any empty/missing value is shown as an
// explicit placeholder rather than nothing.
export default function FieldValue({ value }) {
  if (value === null || value === undefined || value === '') {
    return <span className="field-value field-value--missing">Not found</span>
  }
  const isPlaceholder = value === 'Not found' || value === 'No action found'
  return (
    <span className={`field-value${isPlaceholder ? ' field-value--missing' : ''}`}>
      {value}
    </span>
  )
}
