import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from 'cn'
import {
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleX,
  Loader2,
  RotateCcw,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import FieldList from './FieldList.jsx'

// One row in the multi-file upload queue. Every file in a batch is always
// visible with its own state — Queued / Processing / Done / Failed / Invalid —
// and never collapsed into a single overall bar.
//
// - Failed rows carry their own Retry (re-runs just this file).
// - Queued / Invalid rows carry Remove (only meaningful before/while the batch
//   runs; a file mid-flight or already done can't be pulled out).
// - Done rows are a disclosure: expand to the full F3 result (7 fields + urgency
//   badge + file link + a link to the detail view), so multi-upload keeps the
//   same result detail the single-file flow has.

const META = {
  queued: { Icon: CircleDashed, tone: 'text-muted-foreground', label: 'upload.state_queued' },
  processing: { Icon: Loader2, tone: 'text-primary', label: 'upload.state_processing', spin: true },
  success: { Icon: CircleCheck, tone: 'text-emerald-600', label: 'upload.state_success' },
  failed: { Icon: CircleX, tone: 'text-destructive', label: 'upload.state_failed' },
  invalid: { Icon: TriangleAlert, tone: 'text-destructive', label: 'upload.state_invalid' },
}

function failureText(t, error) {
  if (!error) return t('errors.generic')
  if (error.code) return t(`errors.${error.code}`, { defaultValue: error.message || t('errors.generic') })
  return error.message || t('errors.generic')
}

export default function UploadItem({ item, onRetry, onRemove }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const meta = META[item.status] ?? META.queued
  const { Icon } = meta
  const sizeKb = `${(item.file.size / 1024).toFixed(0)} KB`
  const canExpand = item.status === 'success'
  const canRemove = item.status === 'queued' || item.status === 'invalid'

  const rowInner = (
    <>
      <Icon
        aria-hidden="true"
        className={cn('size-4 shrink-0', meta.tone, meta.spin && 'animate-spin')}
      />
      <span dir="auto" className="min-w-0 flex-1 truncate text-start text-sm font-medium">
        {item.file.name}
      </span>
      <span dir="ltr" className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {sizeKb}
      </span>
      <span className={cn('shrink-0 text-xs font-medium', meta.tone)}>{t(meta.label)}</span>
      {canExpand && (
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      )}
    </>
  )

  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {canExpand ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-start focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {rowInner}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{rowInner}</div>
        )}

        {item.status === 'failed' && (
          <Button type="button" variant="outline" size="xs" onClick={() => onRetry(item.id)}>
            <RotateCcw aria-hidden="true" />
            {t('upload.retry')}
          </Button>
        )}
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={() => onRemove(item.id)}
            aria-label={t('upload.removeFile', { name: item.file.name })}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Client-side rejection reason */}
      {item.status === 'invalid' && (
        <p className="mt-1 ps-7 text-xs text-destructive">
          {t(item.error.key, item.error.params)}
        </p>
      )}

      {/* Server / network failure */}
      {item.status === 'failed' && (
        <p className="mt-1 ps-7 text-xs text-destructive">{failureText(t, item.error)}</p>
      )}

      {/* Expanded F3 result for a successful file */}
      {canExpand && open && (
        <div id={panelId} className="mt-3 flex flex-col gap-3 ps-7">
          <a
            href={item.result.file_link}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('common.openFile')}
          </a>
          <FieldList fields={item.result.fields} />
          <Link
            to={`/document/${encodeURIComponent(item.result.document_id || item.result.file_name)}`}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('upload.openDetail')}
          </Link>
        </div>
      )}
    </li>
  )
}
