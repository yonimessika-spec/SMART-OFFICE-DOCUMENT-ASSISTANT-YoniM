import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { reviewDocument } from '../api/index.js'
import { useDocuments } from '../store.jsx'
import FieldList from '../components/FieldList.jsx'
import FieldValue from '../components/FieldValue.jsx'
import ErrorMessage from '../components/ErrorMessage.jsx'

// F6 Detail view + review.
// - shows every field for one document
// - "Mark as reviewed" with an optional note (<=200 chars)
// - posts to /api/review; on success { status: "updated" } updates local state
// - 404 (no matching row) surfaces as a plain sentence (F7)

const NOTE_MAX = 200

export default function DocumentDetail() {
  const { id } = useParams()
  const { documents, loading, applyReview } = useDocuments()
  const doc = useMemo(() => documents.find((d) => d.document_id === id), [documents, id])

  const [note, setNote] = useState('')
  const [phase, setPhase] = useState('idle') // idle | saving | done | error
  const [error, setError] = useState(null)

  if (loading) return <p className="state">Loading…</p>
  if (!doc) {
    return (
      <section>
        <p className="state">No document with ID “{id}” is loaded.</p>
        <Link to="/">Back to documents</Link>
      </section>
    )
  }

  async function onSubmit(e) {
    e.preventDefault()
    setPhase('saving')
    setError(null)
    try {
      const payload = {
        document_id: doc.document_id,
        status: 'Reviewed',
        reviewed_by: 'app-user',
        review_note: note.slice(0, NOTE_MAX),
      }
      const res = await reviewDocument(payload)
      if (res.status === 'updated') {
        applyReview(doc.document_id, payload)
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

  const alreadyReviewed = doc.status === 'Reviewed'

  return (
    <section>
      <p>
        <Link to="/">← All documents</Link>
      </p>
      <h1>{doc.file_name}</h1>
      <p className="doc-detail__meta">
        {/* received_at is an opaque display string from n8n — show it as-is. */}
        ID {doc.document_id} · received {doc.received_at} · status{' '}
        <FieldValue value={doc.status} />
      </p>
      <p>
        <a href={doc.file_link} target="_blank" rel="noreferrer">
          Open file
        </a>
      </p>

      <FieldList fields={doc} />

      {doc.review_note ? (
        <p className="review-note">
          Review note: <FieldValue value={doc.review_note} />
        </p>
      ) : null}

      <form className="review-form" onSubmit={onSubmit}>
        <h2>Review</h2>
        {alreadyReviewed && phase !== 'done' && (
          <p className="state">This document is already marked as Reviewed. Submitting again will update the note.</p>
        )}
        <label>
          Note (optional, {NOTE_MAX} characters max)
          <textarea
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <span className="char-count">
            {note.length}/{NOTE_MAX}
          </span>
        </label>

        {phase === 'error' && <ErrorMessage error={error} onRetry={() => setPhase('idle')} />}
        {phase === 'done' && (
          <p className="state state--ok">Saved. This document is now marked as Reviewed.</p>
        )}

        <button type="submit" disabled={phase === 'saving'}>
          {phase === 'saving' ? 'Saving…' : 'Mark as reviewed'}
        </button>
      </form>
    </section>
  )
}
