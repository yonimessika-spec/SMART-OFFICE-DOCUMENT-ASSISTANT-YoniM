import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

// The F5 free-text search box. Shared by Dashboard and Archive.
// `value` is the current query string; `onChange` receives the next string.
export default function SearchField({ value, onChange, label = 'Search documents' }) {
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        placeholder="Search file name, sender, or summary…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="pl-9"
      />
    </div>
  )
}
