import { useTranslation } from 'react-i18next'
import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

// Turns any failure into one plain-language sentence (SPEC.md F7), in the UI
// language. Accepts an error_code string (CONTRACT.md §3 / §6) and/or an Error
// object (whose `.status` / `.code` the API layer sets).
function resolveMessage(t, errorOrCode) {
  if (typeof errorOrCode === 'string') {
    return t(`errors.${errorOrCode}`, { defaultValue: t('errors.generic') })
  }
  if (errorOrCode && errorOrCode.code) {
    return t(`errors.${errorOrCode.code}`, { defaultValue: t('errors.generic') })
  }
  if (errorOrCode && errorOrCode.status === 404) {
    return t('errors.notFoundOnServer')
  }
  return t('errors.generic')
}

export default function ErrorMessage({ code, error, onRetry }) {
  const { t } = useTranslation()
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription className="gap-3">
        <p>{resolveMessage(t, code ?? error)}</p>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {t('common.tryAgain')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
