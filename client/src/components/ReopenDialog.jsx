import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

// "Reopen" button + confirm-by-typing modal for one archived document.
// Confirm posts /api/review with status "Processed", which the backend treats
// as "flip back to unreviewed" (and clears reviewed_by / review_note itself).
export default function ReopenDialog({ doc }) {
  const { t } = useTranslation()
  const { reopenDocument } = useDocuments()
  const inputId = useId()
  const confirmWord = t('reopen.confirmWord')

  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState('idle') // idle | saving | error
  const [error, setError] = useState(null)

  const canConfirm = text.trim() === confirmWord && phase !== 'saving'

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
        {t('reopen.button')}
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reopen.title')}</DialogTitle>
            <DialogDescription>
              {t('reopen.description', { name: doc.file_name })}
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor={inputId}>
              {t('reopen.confirmLabel', { word: confirmWord })}
            </FieldLabel>
            <Input
              id={inputId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={confirmWord}
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
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={onConfirm} disabled={!canConfirm}>
              {phase === 'saving' && <Spinner />}
              {phase === 'saving' ? t('reopen.confirming') : t('reopen.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
