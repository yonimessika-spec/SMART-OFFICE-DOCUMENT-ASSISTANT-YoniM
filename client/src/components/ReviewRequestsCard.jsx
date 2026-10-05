import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listReviewRequests, resendReviewRequest } from '../api/reviewRequests.js'
import { errorText } from '../api/errorText.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { can } from '../auth/permissions.js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const STATUS_VARIANT = { sent: 'secondary', failed: 'destructive', skipped: 'outline' }

// Who was asked to look at this document, when, and whether the email went out.
// Visible to every signed-in role (a Viewer sees it read-only). The server sends no
// email addresses, so none can show up here. `refreshKey` changes whenever the
// dialog created or resent a request, which reloads the list.
export default function ReviewRequestsCard({ documentId, refreshKey }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const canResend = can(user?.role, 'review')

  const [requests, setRequests] = useState(null) // null = loading
  const [loadError, setLoadError] = useState(null)
  const [resendingId, setResendingId] = useState(null)
  const [resendError, setResendError] = useState(null) // { id, message }

  const load = useCallback(async () => {
    try {
      const d = await listReviewRequests(documentId)
      setRequests(d.requests)
      setLoadError(null)
    } catch (err) {
      setLoadError(err)
    }
  }, [documentId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  async function resend(req) {
    if (resendingId) return
    setResendingId(req.id)
    setResendError(null)
    try {
      const d = await resendReviewRequest(req.id)
      setRequests((prev) => prev.map((r) => (r.id === req.id ? d.request : r)))
    } catch (err) {
      setResendError({ id: req.id, message: errorText(t, err) })
    } finally {
      setResendingId(null)
    }
  }

  const when = (iso) =>
    new Date(iso).toLocaleString(i18n.resolvedLanguage === 'he' ? 'he-IL' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('reviewRequest.cardTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription className="gap-2">
              <p>{errorText(t, loadError)}</p>
              <Button type="button" variant="outline" size="sm" onClick={load}>
                {t('common.tryAgain')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : requests === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> {t('common.loading')}
          </p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('reviewRequest.none')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {requests.map((req) => {
              const hasFailed = req.recipients.some((r) => r.emailStatus === 'failed')
              return (
                <li key={req.id} className="rounded-lg border border-border p-4">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="text-muted-foreground">{t('reviewRequest.requestedBy')}</span>
                    <span dir="auto" className="font-medium">
                      {req.requestedBy.username}
                    </span>
                    {req.requestedBy.removed && (
                      <span className="text-xs text-muted-foreground">{t('reviewRequest.removed')}</span>
                    )}
                    <span dir="ltr" className="text-xs text-muted-foreground tabular-nums">
                      {when(req.createdAt)}
                    </span>
                  </p>

                  {req.message && (
                    <p
                      dir="auto"
                      className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm break-words whitespace-pre-wrap"
                    >
                      {req.message}
                    </p>
                  )}

                  <ul className="mt-3 flex flex-col gap-1.5">
                    {req.recipients.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span dir="auto" className="font-medium">
                          {r.username}
                        </span>
                        {r.removed && (
                          <span className="text-xs text-muted-foreground">{t('reviewRequest.removed')}</span>
                        )}
                        <Badge variant="outline" className="font-normal">
                          {t(`users.role_${r.role}`, { defaultValue: r.role })}
                        </Badge>
                        <Badge variant={STATUS_VARIANT[r.emailStatus] || 'outline'} className="font-normal">
                          {t(`reviewRequest.status_${r.emailStatus}`, { defaultValue: r.emailStatus })}
                        </Badge>
                      </li>
                    ))}
                  </ul>

                  {canResend && hasFailed && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => resend(req)}
                        disabled={resendingId !== null}
                      >
                        {resendingId === req.id && <Spinner />}
                        {t('reviewRequest.resend')}
                      </Button>
                      {resendError?.id === req.id && (
                        <span className="text-xs text-destructive">{resendError.message}</span>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
