import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from 'cn'
import { CloudUpload } from 'lucide-react'
import { processDocument } from '../api/index.js'
import { ACCEPTED_TYPES, MAX_FILE_BYTES, MAX_BATCH_FILES } from '../constants.js'
import { useDocuments } from '../store.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import UploadItem from '../components/UploadItem.jsx'

// F1 Upload + F2 Processing state + F3 Result view, extended to a multi-file
// batch. Selection (picker + drag-drop) takes several files at once, capped at
// MAX_BATCH_FILES. Each file is validated individually up front; a bad file
// becomes an "invalid" row and never blocks the others. Valid files are queued
// and processed ONE AT A TIME through the existing single-file endpoint — a
// failure on one file is recorded on its row and the queue moves on. See
// src/locales for all copy; per-row UI lives in components/UploadItem.jsx.

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

// null, or an i18n key (+ params) describing why the file is rejected client-side.
function validate(file) {
  if (!ACCEPTED_TYPES[file.type]) return { key: 'upload.errUnsupported' }
  if (file.size > MAX_FILE_BYTES) {
    return {
      key: 'upload.errTooBig',
      params: { size: (file.size / 1024 / 1024).toFixed(1), max: MAX_MB },
    }
  }
  return null
}

const newId = () =>
  (crypto.randomUUID?.() ?? `f_${Date.now()}_${Math.random().toString(36).slice(2)}`)

export default function Upload() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { upsertProcessed } = useDocuments()
  const inputRef = useRef(null)

  // items: { id, file, status, error?, result? }
  //   status: 'invalid' | 'queued' | 'processing' | 'success' | 'failed'
  const [items, setItems] = useState([])
  const [started, setStarted] = useState(false) // Send clicked → the runner is live
  const [capError, setCapError] = useState(null) // { key, params } | null
  const [dragging, setDragging] = useState(false)

  const runningRef = useRef(false) // one upload in flight at a time (StrictMode-safe)

  const queuedCount = items.filter((i) => i.status === 'queued').length
  const processing = items.find((i) => i.status === 'processing') || null
  const successCount = items.filter((i) => i.status === 'success').length
  const failedCount = items.filter((i) => i.status === 'failed').length
  const settledCount = items.filter((i) =>
    ['success', 'failed', 'invalid'].includes(i.status),
  ).length
  const batchDone =
    started && items.length > 0 && !processing && queuedCount === 0

  // --- Sequential runner ---------------------------------------------------
  // Picks the first queued file, marks it processing, uploads it, records the
  // outcome, then re-runs (state change) to take the next. `runningRef` guards
  // against a parallel start (and React 18 StrictMode's double-invoke).
  useEffect(() => {
    if (!started || runningRef.current) return
    const next = items.find((i) => i.status === 'queued')
    if (!next) return

    runningRef.current = true
    setItems((s) => s.map((i) => (i.id === next.id ? { ...i, status: 'processing' } : i)))

    ;(async () => {
      let patch
      try {
        const res = await processDocument({
          file_name: next.file.name,
          mime_type: next.file.type,
          file_base64: await toBase64(next.file),
          submitted_by: user?.username || 'app-user',
        })
        if (res && res.status === 'error') {
          patch = { status: 'failed', error: { code: res.error_code } }
        } else {
          upsertProcessed(res)
          patch = { status: 'success', result: res }
        }
      } catch (err) {
        patch = { status: 'failed', error: err }
      }
      runningRef.current = false
      setItems((s) => s.map((i) => (i.id === next.id ? { ...i, ...patch } : i)))
    })()
  }, [items, started, user, upsertProcessed])

  // --- Selection ---------------------------------------------------------
  function addFiles(fileList) {
    const incoming = Array.from(fileList || [])
    if (incoming.length === 0) return
    setCapError(null)

    if (items.length + incoming.length > MAX_BATCH_FILES) {
      // Reject the whole over-limit selection rather than silently truncating —
      // no ambiguity about which files were kept.
      setCapError({ key: 'upload.capExceeded', params: { max: MAX_BATCH_FILES } })
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    const additions = incoming.map((file) => {
      const problem = validate(file)
      return {
        id: newId(),
        file,
        status: problem ? 'invalid' : 'queued',
        error: problem || null,
        result: null,
      }
    })
    setItems((s) => [...s, ...additions])
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeItem(id) {
    setItems((s) => s.filter((i) => i.id !== id))
    setCapError(null)
  }

  function retryItem(id) {
    setItems((s) =>
      s.map((i) => (i.id === id ? { ...i, status: 'queued', error: null, result: null } : i)),
    )
  }

  function start() {
    if (queuedCount === 0) return
    setStarted(true)
  }

  function reset() {
    setItems([])
    setStarted(false)
    setCapError(null)
    runningRef.current = false
    if (inputRef.current) inputRef.current.value = ''
  }

  const showClear = items.length > 0 && !processing

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl">{t('upload.title')}</h1>
        {started && items.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t('upload.batchProgress', { done: settledCount, total: items.length })}
          </p>
        )}
      </div>

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
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          addFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) =>
          (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()
        }
      >
        <CloudUpload aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">{t('upload.dropzoneMulti')}</p>
        <p className="text-xs text-muted-foreground">
          <span dir="ltr">PDF, DOCX, TXT</span>{' '}
          {t('upload.hintMulti', { mb: MAX_MB, max: MAX_BATCH_FILES })}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={Object.values(ACCEPTED_TYPES).join(',')}
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {capError && (
        <Alert variant="destructive">
          <AlertTitle>{t('upload.rejectedTitle')}</AlertTitle>
          <AlertDescription>{t(capError.key, capError.params)}</AlertDescription>
        </Alert>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((item) => (
            <UploadItem
              key={item.id}
              item={item}
              onRetry={retryItem}
              onRemove={removeItem}
            />
          ))}
        </ul>
      )}

      {processing && (
        <Alert role="status" aria-live="polite">
          <Spinner />
          <AlertTitle>{t('upload.processingTitle')}</AlertTitle>
          <AlertDescription>
            {t('upload.batchRunning', { name: processing.file.name })}{' '}
            {t('upload.processingBody')}
          </AlertDescription>
        </Alert>
      )}

      {batchDone && (
        <Alert role="status">
          <AlertTitle>{t('upload.batchDoneTitle')}</AlertTitle>
          <AlertDescription>
            {t('upload.batchDoneBody', { success: successCount, failed: failedCount })}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        {!started ? (
          <Button type="button" onClick={start} disabled={queuedCount === 0}>
            {queuedCount === 1
              ? t('upload.sendOne')
              : t('upload.sendMany', { count: queuedCount })}
          </Button>
        ) : batchDone ? (
          <Button type="button" onClick={reset}>
            {t('upload.uploadAnother')}
          </Button>
        ) : (
          <Button type="button" disabled>
            <Spinner />
            {t('common.processing')}
          </Button>
        )}

        {showClear && (
          <Button type="button" variant="outline" onClick={reset}>
            {t('common.clearAll')}
          </Button>
        )}
      </div>
    </section>
  )
}
