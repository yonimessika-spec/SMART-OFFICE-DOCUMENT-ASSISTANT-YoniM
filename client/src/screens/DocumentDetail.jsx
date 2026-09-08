import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { cn } from 'cn'
import { ChevronLeft, CircleCheck } from 'lucide-react'
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
import ErrorMessage from '../components/ErrorMessage.jsx'

// F6 Detail view + review.
// - shows every field for one document
// - "Mark as reviewed" / "Flag as needs review", with an optional note (<=200 chars)
// - posts to /api/review; on success { status: "updated" } updates local state
// - 404 (no matching row) surfaces as a plain sentence (F7)

const NOTE_MAX = 200

export default function DocumentDetail() {
  const { id } = useParams()
  const { documents, loading, applyReview } = useDocuments()
  // Match the identifier DocumentCard / Upload put in the URL: prefer
  // document_id, fall back to file_name while document_id is still empty
  // (pre-Workflow A). `id` from useParams is already URL-decoded.
  const doc = useMemo(
    () => documents.find((d) => (d.document_id || d.file_name) === id),
    [documents, id],
  )

  const [note, setNote] = useState('')
  const [phase, setPhase] = useState('idle') // idle | saving | done | error
  const [error, setError] = useState(null)
  const [savedAs, setSavedAs] = useState(null) // 'Reviewed' | 'Needs Review' — which action last succeeded

  if (loading) return <p className="text-muted-foreground">Loading…</p>
  if (!doc) {
    return (
      <Empty className="border border-border">
        <EmptyHeader>
          <EmptyTitle>Document not loaded</EmptyTitle>
          <EmptyDescription>
            No document with ID “{id}” is loaded.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link to="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Back to documents
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
          '-ml-3 self-start text-muted-foreground',
        )}
      >
        <ChevronLeft aria-hidden="true" />
        All documents
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="truncate text-xl">{doc.file_name}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {/* received_at is an opaque display string from n8n — show it as-is. */}
              Received{' '}
              <span className="text-foreground tabular-nums">{doc.received_at}</span>
            </span>
            <span className="flex items-center gap-1">
              Status <FieldValue value={doc.status} />
            </span>
            <a
              href={doc.file_link}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Open file
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldList fields={doc} />
          {doc.review_note ? (
            <p className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm">
              <span className="text-muted-foreground">Review note: </span>
              <FieldValue value={doc.review_note} />
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review</CardTitle>
          {alreadyReviewed && phase !== 'done' && (
            <CardDescription>
              This document is already marked as Reviewed. Submitting again will
              update the note.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="review-note">Note (optional)</FieldLabel>
                <Textarea
                  id="review-note"
                  value={note}
                  maxLength={NOTE_MAX}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                <FieldDescription className="tabular-nums">
                  {note.length}/{NOTE_MAX} characters
                </FieldDescription>
              </Field>

              {phase === 'error' && (
                <ErrorMessage error={error} onRetry={() => setPhase('idle')} />
              )}
              {phase === 'done' && (
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CircleCheck aria-hidden="true" className="size-4 text-primary" />
                  {savedAs === 'Needs Review'
                    ? 'Saved. This document is now flagged as Needs Review.'
                    : 'Saved. This document is now marked as Reviewed. This document is now available to view on Archive.'}
                </p>
              )}

              <Field orientation="horizontal">
                <Button type="submit" disabled={phase === 'saving'}>
                  {phase === 'saving' && <Spinner />}
                  {phase === 'saving' ? 'Saving…' : 'Mark as reviewed'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => submitReview('Needs Review')}
                  disabled={phase === 'saving'}
                >
                  {phase === 'saving' && <Spinner />}
                  {phase === 'saving' ? 'Saving…' : 'Flag as needs review'}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
