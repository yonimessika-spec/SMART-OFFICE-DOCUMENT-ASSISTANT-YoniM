import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from 'cn'
import { CloudUpload } from 'lucide-react'
import { processDocument } from '../api/index.js'
import { ACCEPTED_TYPES, MAX_FILE_BYTES } from '../constants.js'
import { useDocuments } from '../store.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import FieldList from '../components/FieldList.jsx'
import ErrorMessage from '../components/ErrorMessage.jsx'

// F1 Upload + F2 Processing state + F3 Result view. See src/locales for copy.

const MAX_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024))

// Read a File into base64 with no data-URL prefix (CONTRACT.md §1: file_base64).
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// Returns null, or an i18n key + params describing the client-side rejection.
function validate(file) {
  if (!ACCEPTED_TYPES[file.type]) {
    return { key: 'upload.errUnsupported' }
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      key: 'upload.errTooBig',
      params: { size: (file.size / 1024 / 1024).toFixed(1), max: MAX_MB },
    }
  }
  return null
}

export default function Upload() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { upsertProcessed } = useDocuments()
  const inputRef = useRef(null)

  const [file, setFile] = useState(null)
  const [localError, setLocalError] = useState(null) // { key, params } | null
  const [dragging, setDragging] = useState(false)

  const [phase, setPhase] = useState('idle') // idle | processing | done | error
  const [result, setResult] = useState(null)
  const [apiError, setApiError] = useState(null) // { code } or Error

  function pick(nextFile) {
    setApiError(null)
    setResult(null)
    setPhase('idle')
    if (!nextFile) return
    const problem = validate(nextFile)
    if (problem) {
      setFile(null)
      setLocalError(problem)
      return
    }
    setLocalError(null)
    setFile(nextFile)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    pick(e.dataTransfer.files?.[0])
  }

  async function onSend() {
    if (!file || phase === 'processing') return
    setPhase('processing')
    setApiError(null)
    try {
      const payload = {
        file_name: file.name,
        mime_type: file.type,
        file_base64: await toBase64(file),
        submitted_by: user?.username || 'app-user',
      }
      const res = await processDocument(payload)
      if (res.status === 'error') {
        // CONTRACT.md §3 error envelope.
        setApiError({ code: res.error_code })
        setPhase('error')
        return
      }
      setResult(res)
      upsertProcessed(res)
      setPhase('done')
    } catch (err) {
      setApiError(err)
      setPhase('error')
    }
  }

  function reset() {
    setFile(null)
    setResult(null)
    setApiError(null)
    setLocalError(null)
    setPhase('idle')
    if (inputRef.current) inputRef.current.value = ''
  }

  // ---- Result view (F3) ----
  if (phase === 'done' && result) {
    return (
      <section className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl">{t('upload.doneTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.notification_sent
              ? t('upload.doneNotified')
              : t('upload.doneNotNotified')}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle dir="auto" className="truncate">
              {result.file_name}
            </CardTitle>
            <CardDescription>
              <a
                href={result.file_link}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t('common.openFile')}
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldList fields={result.fields} />
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() =>
              navigate(
                `/document/${encodeURIComponent(result.document_id || result.file_name)}`,
              )
            }
          >
            {t('upload.openDetail')}
          </Button>
          <Button type="button" variant="outline" onClick={reset}>
            {t('upload.uploadAnother')}
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl">{t('upload.title')}</h1>

      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 p-10 text-center transition-colors',
          'hover:border-primary/50 hover:bg-accent/40',
          'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
          dragging && 'border-primary bg-accent/60',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      >
        <CloudUpload aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">{t('upload.dropzone')}</p>
        <p className="text-xs text-muted-foreground">
          <span dir="ltr">PDF, DOCX, TXT</span> · {t('upload.hintSize', { mb: MAX_MB })}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={Object.values(ACCEPTED_TYPES).join(',')}
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      {localError && (
        <Alert variant="destructive">
          <AlertTitle>{t('upload.rejectedTitle')}</AlertTitle>
          <AlertDescription>{t(localError.key, localError.params)}</AlertDescription>
        </Alert>
      )}

      {file && (
        <p className="text-sm text-muted-foreground">
          {t('upload.selectedLabel')}{' '}
          <span dir="auto" className="font-medium text-foreground">
            {file.name}
          </span>{' '}
          <span dir="ltr" className="tabular-nums">
            ({(file.size / 1024).toFixed(0)} KB)
          </span>
        </p>
      )}

      {phase === 'processing' && (
        <Alert role="status" aria-live="polite">
          <Spinner />
          <AlertTitle>{t('upload.processingTitle')}</AlertTitle>
          <AlertDescription>{t('upload.processingBody')}</AlertDescription>
        </Alert>
      )}

      {phase === 'error' && (
        <ErrorMessage
          code={apiError?.code}
          error={apiError instanceof Error ? apiError : undefined}
          onRetry={onSend}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={onSend} disabled={!file || phase === 'processing'}>
          {phase === 'processing' ? t('common.processing') : t('upload.send')}
        </Button>
        {(file || phase === 'error') && (
          <Button
            type="button"
            variant="outline"
            onClick={reset}
            disabled={phase === 'processing'}
          >
            {t('common.clear')}
          </Button>
        )}
      </div>
    </section>
  )
}
