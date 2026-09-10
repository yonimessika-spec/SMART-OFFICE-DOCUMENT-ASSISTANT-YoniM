import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

// The F5 free-text search box. Shared by Dashboard and Archive.
// `value` is the current query string; `onChange` receives the next string.
// `label` is the accessible name (defaults to the generic "search documents").
export default function SearchField({ value, onChange, label }) {
  const { t } = useTranslation()
  return (
    <div className="relative">
      {/* start-3 / ps-9: mirrors to the right edge under RTL */}
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        placeholder={t('search.placeholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label || t('search.ariaDefault')}
        className="ps-9"
      />
    </div>
  )
}
