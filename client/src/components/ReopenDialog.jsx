import { useId, useState } from 'react'
import { reviewDocument } from '../api/index.js'
import { useDocuments } from '../store.jsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import ErrorMessage from './ErrorMessage.jsx'

const CONFIRM_WORD = 'Reopen'

// "Reopen" button + confirm-by-typing modal for one archived document.
// Confirm posts /api/review with status "Processed", which the backend treats
// as "flip back to unreviewed" (and clears reviewed_by / review_note itself).
export default function ReopenDialog({ doc }) {
  const { reopenDocument } = useDocuments()
  const inputId = useId()

  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState('idle') // idle | saving | error
  const [error, setError] = useState(null)

  const canConfirm = text === CONFIRM_WORD && phase !== 'saving'

  function onOpenChange(next) {
    if (phase === 'saving') return // don't let the modal close mid-request
    setOpen(next)
    if (!next) {
      setText('')
      setPhase('idle')
      setError(null)
    }
  }

  async function onConfirm() {
    setPhase('saving')
    setError(null)
    try {
      const res = await reviewDocument({
        document_id: doc.document_id,
        status: 'Processed',
        reviewed_by: '',
        review_note: '',
      })
      if (res.status === 'updated') {
        reopenDocument(doc.document_id) // drop it from Archive, hand it back to Dashboard
        setOpen(false)
        setText('')
        setPhase('idle')
      } else {
        setError(new Error('Unexpected response'))
        setPhase('error')
      }
    } catch (err) {
      setError(err)
      setPhase('error')
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Reopen
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen this document?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{doc.file_name}</span>{' '}
              moves back to the Dashboard as unreviewed. Its reviewer and review
              note are cleared.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor={inputId}>
              Type “{CONFIRM_WORD}” to confirm
            </FieldLabel>
            <Input
              id={inputId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={CONFIRM_WORD}
            />
          </Field>

          {phase === 'error' && (
            <ErrorMessage
              code={error?.code}
              error={error instanceof Error ? error : undefined}
            />
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={phase === 'saving'}
            >
              Cancel
            </Button>
            <Button type="button" onClick={onConfirm} disabled={!canConfirm}>
              {phase === 'saving' && <Spinner />}
              {phase === 'saving' ? 'Reopening…' : 'Reopen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
