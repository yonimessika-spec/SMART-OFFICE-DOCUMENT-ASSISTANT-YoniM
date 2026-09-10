import { NavLink, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from 'cn'
import { Languages } from 'lucide-react'
import { USE_MOCK_DOCUMENTS, USE_MOCK_PROCESS, USE_MOCK_REVIEW } from './api/index.js'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Dashboard from './screens/Dashboard.jsx'
import Upload from './screens/Upload.jsx'
import Archive from './screens/Archive.jsx'
import DocumentDetail from './screens/DocumentDetail.jsx'

// Honestly show which calls are still served by the mock (SPEC.md §1). The list
// items are the raw endpoint names and stay untranslated.
const MOCKED = [
  USE_MOCK_DOCUMENTS && 'documents',
  USE_MOCK_PROCESS && 'process',
  USE_MOCK_REVIEW && 'review',
].filter(Boolean)

const navLink = ({ isActive }) =>
  cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    isActive
      ? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
      : 'text-muted-foreground',
  )

export default function App() {
  const { t, i18n } = useTranslation()
  const current = i18n.resolvedLanguage === 'he' ? 'he' : 'en'
  const other = current === 'he' ? 'en' : 'he'

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <span className="flex shrink-0 items-center gap-2 font-semibold tracking-tight whitespace-nowrap">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
            {t('nav.brand')}
          </span>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navLink}>
              {t('nav.dashboard')}
            </NavLink>
            <NavLink to="/archive" className={navLink}>
              {t('nav.archive')}
            </NavLink>
            <NavLink to="/upload" className={navLink}>
              {t('nav.upload')}
            </NavLink>
          </nav>

          <div className="ms-auto flex items-center gap-2">
            {MOCKED.length > 0 && (
              <Badge
                variant="outline"
                className="font-normal whitespace-nowrap text-muted-foreground"
              >
                {t('nav.mockPrefix')}{' '}
                <span dir="ltr">{MOCKED.join(', ')}</span>
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => i18n.changeLanguage(other)}
              aria-label={t('lang.ariaLabel')}
            >
              <Languages aria-hidden="true" />
              {t(`lang.${other}`)}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/document/:id" element={<DocumentDetail />} />
          <Route
            path="*"
            element={<p className="text-muted-foreground">{t('common.pageNotFound')}</p>}
          />
        </Routes>
      </main>
    </div>
  )
}
