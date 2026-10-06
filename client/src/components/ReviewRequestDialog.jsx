import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CircleCheck, TriangleAlert } from 'lucide-react'
import { cn } from 'cn'
import { useAuth } from '../auth/AuthContext.jsx'
import {
  createReviewRequest,
  getUserDirectory,
  resendReviewRequest,
} from '../api/reviewRequests.js'
import { errorText } from '../api/errorText.js'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const MESSAGE_MAX = 1000
const SEARCH_THRESHOLD = 6 // show the search box once the list is longer than this

// "Flag as needs review" dialog. Flagging goes through the existing review call
// (`flag`, supplied by DocumentDetail); the request email is a separate step that
// only runs after the flag succeeded, so a document is never emailed about unless it
// really is flagged. Picking recipients is optional: "Flag without sending" is the
// old behavior unchanged.
//
// Phases: form -> working -> result            (flag and request both worked)
//                         -> requestFailed     (flagged, but the request failed)
export default function ReviewRequestDialog({ doc, open, onOpenChange, flag, onChanged }) {
  const { t } = useTranslation()
  const { user: me } = useAuth()
  const busy = useRef(false) // double-submit guard, independent of render timing

  const [directory, setDirectory] = useState(null) // null = loading
  const [directoryError, setDirectoryError] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [message, setMessage] = useState(t('reviewRequest.defaultMessage'))
  const [phase, setPhase] = useState('form') // form | working | result | requestFailed
  const [error, setError] = useState(null)
  const [created, setCreated] = useState(null) // the request as returned by the server
  const [resending, setResending] = useState(false)

  function reset() {
    setSearch('')
    setSelected(new Set())
    setMessage(t('reviewRequest.defaultMessage'))
    setPhase('form')
    setError(null)
    setCreated(null)
    setResending(false)
    busy.current = false
  }

  // Load the picker list each time the dialog opens (users change between visits).
  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setDirectory(null)
    setDirectoryError(null)
    getUserDirectory()
      .then((d) => {
        if (!cancelled) setDirectory(d.users)
      })
      .catch((err) => {
        if (!cancelled) setDirectoryError(err)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Anyone with a real email, except yourself. Pending users stay in the list.
  const eligible = useMemo(
    () => (directory || []).filter((u) => u.hasEmail && u.id !== me?.id),
    [directory, me?.id],
  )
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return eligible
    return eligible.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        t(`users.role_${u.role}`, { defaultValue: u.role }).toLowerCase().includes(q),
    )
  }, [eligible, search, t])
  const selectedPending = eligible.filter((u) => selected.has(u.id) && u.pending)

  function close(next) {
    if (phase === 'working' || resending) return // never close mid-request
    onOpenChange(next)
    if (!next) reset()
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function sendRequest() {
    setPhase('working')
    setError(null)
    try {
      const d = await createReviewRequest({
        documentId: doc.document_id,
        recipientUserIds: [...selected],
        message,
      })
      setCreated(d.request)
      setPhase('result')
      onChanged?.()
    } catch (err) {
      setError(err)
      setPhase('requestFailed')
    } finally {
      busy.current = false
    }
  }

  async function onFlagAndSend() {
    if (busy.current || selected.size === 0) return
    busy.current = true
    setPhase('working')
    setError(null)
    const res = await flag()
    if (!res.ok) {
      // Not flagged, so nothing is emailed. Stay on the form and say why.
      setError(res.error)
      setPhase('form')
      busy.current = false
      return
    }
    await sendRequest()
  }

  async function onFlagOnly() {
    if (busy.current) return
    busy.current = true
    setPhase('working')
    await flag() // success or failure is shown in the Review card, as before
    busy.current = false
    onOpenChange(false)
    reset()
  }

  async function onRetryRequest() {
    if (busy.current) return
    busy.current = true
    await sendRequest()
  }

  async function onResend() {
    if (resending || !created) return
    setResending(true)
    setError(null)
    try {
      const d = await resendReviewRequest(created.id)
      setCreated(d.request)
      onChanged?.()
    } catch (err) {
      setError(err)
    } finally {
      setResending(false)
    }
  }

  const working = phase === 'working'
  const sentNames = created?.recipients.filter((r) => r.emailStatus === 'sent').map((r) => r.username) || []
  const failed = created?.recipients.filter((r) => r.emailStatus === 'failed') || []
  const skipped = created?.recipients.filter((r) => r.emailStatus === 'skipped') || []

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('reviewRequest.title')}</DialogTitle>
          <DialogDescription dir="auto">
            {t('reviewRequest.description', { name: doc.file_name })}
          </DialogDescription>
        </DialogHeader>

        {(phase === 'form' || phase === 'working') && (
          <div className="flex flex-col gap-4">
            {/* --- recipient picker --- */}
            <Field>
              <FieldLabel>{t('reviewRequest.recipients')}</FieldLabel>
              {eligible.length > SEARCH_THRESHOLD && (
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('reviewRequest.searchPlaceholder')}
                  aria-label={t('reviewRequest.searchPlaceholder')}
                  autoComplete="off"
                />
              )}
              {directoryError ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorText(t, directoryError)}</AlertDescription>
                </Alert>
              ) : directory === null ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> {t('common.loading')}
                </p>
              ) : visible.length === 0 ? (
                <p className="rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">
                  {t(eligible.length === 0 ? 'reviewRequest.noUsers' : 'reviewRequest.noMatches')}
                </p>
              ) : (
                <ul
                  role="group"
                  aria-label={t('reviewRequest.recipients')}
                  className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border"
                >
                  {visible.map((u) => {
                    const on = selected.has(u.id)
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          disabled={working}
                          onClick={() => toggle(u.id)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-60"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'flex size-4 shrink-0 items-center justify-center rounded border border-input',
                              on && 'border-primary bg-primary text-primary-foreground',
                            )}
                          >
                            {on && <Check className="size-3" />}
                          </span>
                          <span dir="auto" className="min-w-0 flex-1 truncate font-medium">
                            {u.username}
                          </span>
                          <Badge variant="secondary" className="font-normal">
                            {t(`users.role_${u.role}`, { defaultValue: u.role })}
                          </Badge>
                          {u.pending && (
                            <Badge variant="outline" className="font-normal">
                              {t('users.status_Pending')}
                            </Badge>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <FieldDescription>
                {t('reviewRequest.selectedCount', { count: selected.size })}
              </FieldDescription>
            </Field>

            {selectedPending.length > 0 && (
              <Alert>
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>
                  <p>{t('reviewRequest.pendingWarning', { count: selectedPending.length })}</p>
                  <p dir="auto" className="font-medium">
                    {selectedPending.map((u) => u.username).join(', ')}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* --- message --- */}
            <Field>
              <FieldLabel htmlFor="rr-message">{t('reviewRequest.message')}</FieldLabel>
              <Textarea
                id="rr-message"
                value={message}
                maxLength={MESSAGE_MAX}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                disabled={working}
              />
              <FieldDescription>
                <span dir="ltr" className="tabular-nums">
                  {message.length}/{MESSAGE_MAX}
                </span>{' '}
                {t('detail.charCountUnit')}
              </FieldDescription>
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{errorText(t, error)}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {phase === 'requestFailed' && (
          <div className="flex flex-col gap-3">
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription className="gap-1">
                <p className="font-medium">{t('reviewRequest.flaggedButFailed')}</p>
                <p>{errorText(t, error)}</p>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {phase === 'result' && created && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CircleCheck aria-hidden="true" className="size-4 text-primary" />
              {t('detail.doneNeedsReview')}
            </p>
            {sentNames.length > 0 && (
              <p>
                {t('reviewRequest.sentTo')}{' '}
                <span dir="auto" className="font-medium">
                  {sentNames.join(', ')}
                </span>
              </p>
            )}
            {failed.length > 0 && (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription className="gap-2">
                  <p>
                    {t('reviewRequest.failedFor')}{' '}
                    <span dir="auto" className="font-medium">
                      {failed.map((r) => r.username).join(', ')}
                    </span>
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={onResend} disabled={resending}>
                    {resending && <Spinner />}
                    {t('reviewRequest.resend')}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {skipped.length > 0 && (
              <p className="text-muted-foreground">
                {t('reviewRequest.notSentTo')}{' '}
                <span dir="auto">{skipped.map((r) => r.username).join(', ')}</span>
              </p>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{errorText(t, error)}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          {(phase === 'form' || phase === 'working') && (
            <>
              <Button type="button" variant="ghost" onClick={() => close(false)} disabled={working}>
                {t('common.cancel')}
              </Button>
              <Button type="button" variant="outline" onClick={onFlagOnly} disabled={working}>
                {t('reviewRequest.flagOnly')}
              </Button>
              <Button type="button" onClick={onFlagAndSend} disabled={working || selected.size === 0}>
                {working && <Spinner />}
                {working ? t('common.saving') : t('reviewRequest.flagAndSend')}
              </Button>
            </>
          )}
          {phase === 'requestFailed' && (
            <>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                {t('reviewRequest.close')}
              </Button>
              <Button type="button" onClick={onRetryRequest}>
                {t('common.tryAgain')}
              </Button>
            </>
          )}
          {phase === 'result' && (
            <Button type="button" onClick={() => close(false)} disabled={resending}>
              {t('reviewRequest.close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
