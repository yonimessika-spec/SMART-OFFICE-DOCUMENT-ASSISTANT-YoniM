import { cn } from 'cn'

// Renders a single extracted value. SPEC.md §5 / F3: the literal strings
// "Not found" and "No action found" must render as visible text, never blank
// space and never replaced with a guess. Any empty/missing value is shown as an
// explicit placeholder rather than nothing.
export default function FieldValue({ value }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground italic">Not found</span>
  }
  const isPlaceholder = value === 'Not found' || value === 'No action found'
  return (
    <span className={cn(isPlaceholder && 'text-muted-foreground italic')}>
      {value}
    </span>
  )
}
