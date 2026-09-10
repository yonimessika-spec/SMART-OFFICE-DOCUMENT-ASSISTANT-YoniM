import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from 'cn'
import { ChevronLeft, ChevronRight, CircleCheck } from 'lucide-react'
import { reviewDocument } from '../api/index.js'
import { useDocuments } from '../store.jsx'
import { buttonVariants, Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import FieldList from '../components/FieldList.jsx'
import FieldValue from '../components/FieldValue.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import ErrorMessage from '../components/ErrorMessage.jsx'

// F6 Detail view + review. See src/locales for all UI copy.

const NOTE_MAX = 200

export default function DocumentDetail() {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const { documents, loading, applyReview } = useDocuments()
  const doc = useMemo(
    () => documents.find((d) => (d.document_id || d.file_name) === id),
    [documents, id],
  )

  const [note, setNote] = useState('')
  const [phase, setPhase] = useState('idle') // idle | saving | done | error
  const [error, setError] = useState(null)
  const [savedAs, setSavedAs] = useState(null) // 'Reviewed' | 'Needs Review'

  // "Back" points in the reading direction: left in LTR, right in RTL.
  const BackIcon = i18n.dir() === 'rtl' ? ChevronRight : ChevronLeft

  if (loading) return <p className="text-muted-foreground">{t('detail.loading')}</p>
  if (!doc) {
    return (
      <Empty className="border border-border">
        <EmptyHeader>
          <EmptyTitle>{t('detail.notLoadedTitle')}</EmptyTitle>
          <EmptyDescription>
            {t('detail.notLoadedBody', { id })}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link to="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {t('detail.backToDocuments')}
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  // Shared review-submission path. Both action buttons call this — only the
  // status differs. The early return + the buttons' `disabled` both guard
  // against a double-submit while a request is in flight.
  async function submitReview(status) {
    if (phase === 'saving') return
    setPhase('saving')
    setError(null)
    try {
      const payload = {
        document_id: doc.document_id,
        status,
        reviewed_by: 'app-user',
        review_note: note.slice(0, NOTE_MAX),
      }
      const res = await reviewDocument(payload)
      if (res.status === 'updated') {
        applyReview(doc.document_id, payload)
        setSavedAs(status)
        setPhase('done')
      } else {
        setError(new Error('Unexpected response'))
        setPhase('error')
      }
    } catch (err) {
      setError(err)
      setPhase('error')
    }
  }

  function onSubmit(e) {
    e.preventDefault()
    submitReview('Reviewed')
  }

  const alreadyReviewed = doc.status === 'Reviewed'

  return (
    <section className="flex flex-col gap-6">
      <Link
        to="/"
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          '-ms-3 self-start text-muted-foreground',
        )}
      >
        <BackIcon aria-hidden="true" />
        {t('detail.allDocuments')}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle dir="auto" className="truncate text-xl">
            {doc.file_name}
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {/* received_at is an opaque display string from n8n — kept LTR. */}
              {t('detail.receivedLabel')}{' '}
              <span dir="ltr" className="text-foreground tabular-nums">
                {doc.received_at}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              {t('detail.statusLabel')} <StatusBadge value={doc.status} />
            </span>
            <a
              href={doc.file_link}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('common.openFile')}
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldList fields={doc} />
          {doc.review_note ? (
            <p className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm">
              <span className="text-muted-foreground">{t('detail.reviewNoteLabel')}</span>
              <FieldValue value={doc.review_note} />
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('detail.reviewTitle')}</CardTitle>
          {alreadyReviewed && phase !== 'done' && (
            <CardDescription>{t('detail.alreadyReviewed')}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="review-note">{t('detail.noteLabel')}</FieldLabel>
                <Textarea
                  id="review-note"
                  value={note}
                  maxLength={NOTE_MAX}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                <FieldDescription>
                  <span dir="ltr" className="tabular-nums">
                    {note.length}/{NOTE_MAX}
                  </span>{' '}
                  {t('detail.charCountUnit')}
                </FieldDescription>
              </Field>

              {phase === 'error' && (
                <ErrorMessage error={error} onRetry={() => setPhase('idle')} />
              )}
              {phase === 'done' && (
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CircleCheck aria-hidden="true" className="size-4 text-primary" />
                  {savedAs === 'Needs Review'
                    ? t('detail.doneNeedsReview')
                    : t('detail.doneReviewed')}
                </p>
              )}

              <Field orientation="horizontal">
                <Button type="submit" disabled={phase === 'saving'}>
                  {phase === 'saving' && <Spinner />}
                  {phase === 'saving' ? t('common.saving') : t('detail.markReviewed')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => submitReview('Needs Review')}
                  disabled={phase === 'saving'}
                >
                  {phase === 'saving' && <Spinner />}
                  {phase === 'saving' ? t('common.saving') : t('detail.flagNeedsReview')}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
