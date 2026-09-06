import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { processDocument } from '../api/index.js'
import { ACCEPTED_TYPES, MAX_FILE_BYTES } from '../constants.js'
import { useDocuments } from '../store.jsx'
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
      <section>
        <h1>Processed</h1>
        <p className="state state--ok">
          {result.notification_sent
            ? 'Document processed and a notification was sent.'
            : 'Document processed. No notification was sent.'}
        </p>
        <p>
          <strong>{result.file_name}</strong> ·{' '}
          <a href={result.file_link} target="_blank" rel="noreferrer">
            Open file
          </a>
        </p>
        <FieldList fields={result.fields} />
        <div className="row-actions">
          <button type="button" onClick={() => navigate(`/document/${result.document_id}`)}>
            Open detail view
          </button>
          <button type="button" onClick={reset}>
            Upload another
          </button>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h1>Upload a document</h1>

      <div
        className={`dropzone${dragging ? ' dropzone--active' : ''}`}
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
        <p>Drag a file here, or click to choose one.</p>
        <p className="dropzone__hint">PDF, DOCX or TXT · up to {MAX_MB} MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={Object.values(ACCEPTED_TYPES).join(',')}
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      {localError && (
        <p className="error-message" role="alert">
          {localError}
        </p>
      )}

      {file && (
        <p className="selected-file">
          Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(0)} KB)
        </p>
      )}

      {phase === 'processing' && (
        <p className="state state--busy" aria-live="polite">
          <span className="spinner" aria-hidden="true" /> Processing… this can take up to 90 seconds.
          Please keep this tab open.
        </p>
      )}

      {phase === 'error' && (
        <ErrorMessage
          code={apiError?.code}
          error={apiError instanceof Error ? apiError : undefined}
          onRetry={onSend}
        />
      )}

      <div className="row-actions">
        <button type="button" onClick={onSend} disabled={!file || phase === 'processing'}>
          {phase === 'processing' ? 'Processing…' : 'Send for processing'}
        </button>
        {(file || phase === 'error') && (
          <button type="button" onClick={reset} disabled={phase === 'processing'}>
            Clear
          </button>
        )}
      </div>
    </section>
  )
}
