import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from 'cn'
import { CloudUpload } from 'lucide-react'
import { processDocument } from '../api/index.js'
import { ACCEPTED_TYPES, MAX_FILE_BYTES } from '../constants.js'
import { useDocuments } from '../store.jsx'
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

// F1 Upload + F2 Processing state + F3 Result view.
// - file picker + drag-drop; only PDF/DOCX/TXT; oversized rejected BEFORE any request
// - unmistakable in-progress state, Send disabled for the whole request (~90s safe)
// - result: all 7 fields + file_link + coloured urgency badge, "Not found" shown literally

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

function validate(file) {
  if (!ACCEPTED_TYPES[file.type]) {
    return 'Only PDF, DOCX and TXT files can be processed.'
  }
  if (file.size > MAX_FILE_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_MB} MB.`
  }
  return null
}

export default function Upload() {
  const navigate = useNavigate()
  const { upsertProcessed } = useDocuments()
  const inputRef = useRef(null)

  const [file, setFile] = useState(null)
  const [localError, setLocalError] = useState(null) // client-side rejection
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
        submitted_by: 'app-user',
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
          <h1 className="text-2xl">Processed</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.notification_sent
              ? 'Document processed and a notification was sent.'
              : 'Document processed. No notification was sent.'}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="truncate">{result.file_name}</CardTitle>
            <CardDescription>
              <a
                href={result.file_link}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Open file
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
                // Same identifier convention as DocumentCard: document_id when
                // present, file_name as the pre-Workflow-A fallback.
                `/document/${encodeURIComponent(result.document_id || result.file_name)}`,
              )
            }
          >
            Open detail view
          </Button>
          <Button type="button" variant="outline" onClick={reset}>
            Upload another
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl">Upload a document</h1>

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
        <p className="text-sm font-medium">Drag a file here, or click to choose one.</p>
        <p className="text-xs text-muted-foreground">
          PDF, DOCX or TXT, up to {MAX_MB} MB
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
          <AlertTitle>File not accepted</AlertTitle>
          <AlertDescription>{localError}</AlertDescription>
        </Alert>
      )}

      {file && (
        <p className="text-sm text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{file.name}</span>{' '}
          <span className="tabular-nums">({(file.size / 1024).toFixed(0)} KB)</span>
        </p>
      )}

      {phase === 'processing' && (
        <Alert role="status" aria-live="polite">
          <Spinner />
          <AlertTitle>Processing…</AlertTitle>
          <AlertDescription>
            This can take up to 90 seconds. Please keep this tab open.
          </AlertDescription>
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
          {phase === 'processing' ? 'Processing…' : 'Send for processing'}
        </Button>
        {(file || phase === 'error') && (
          <Button
            type="button"
            variant="outline"
            onClick={reset}
            disabled={phase === 'processing'}
          >
            Clear
          </Button>
        )}
      </div>
    </section>
  )
}
