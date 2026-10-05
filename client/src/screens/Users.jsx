import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus, Trash2, Pencil, Mail, KeyRound, TriangleAlert } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import * as authApi from '../api/auth.js'
import { errorText } from '../api/errorText.js'
import { ASSIGNABLE_ROLES } from '../auth/permissions.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorMessage from '../components/ErrorMessage.jsx'

// Admin-only. Route + nav are already gated (RequireRole / App), and every call
// here hits an Admin-only endpoint; the server is the real check.
export default function Users() {
  const { t } = useTranslation()
  const { user: me } = useAuth()

  const [users, setUsers] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [notice, setNotice] = useState(null) // { key, params } transient success line
  const [warning, setWarning] = useState(null) // { userId, username, purpose, code } email that did not go out
  const [rowError, setRowError] = useState(null) // { id, message }
  const [confirming, setConfirming] = useState(null) // { id, action: 'remove' | 'reset' }
  const [busyId, setBusyId] = useState(null)
  const [editing, setEditing] = useState(null) // { id, email }
  const noticeTimer = useRef(null)

  const roleLabel = useCallback((r) => t(`users.role_${r}`, { defaultValue: r }), [t])

  const refresh = useCallback(async () => {
    try {
      const d = await authApi.listUsers()
      setUsers(d.users)
      setLoadError(null)
    } catch (err) {
      setLoadError(err)
    }
  }, [])

  useEffect(() => {
    refresh()
    return () => window.clearTimeout(noticeTimer.current)
  }, [refresh])

  function flash(msg) {
    setNotice(msg)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000)
  }

  // Show the outcome of an email send. 'failed' is kept on screen (with a Resend
  // button) because the account/reset exists but the person has not been told.
  function reportEmail(u, purpose, result, successKey) {
    if (result?.status === 'failed') {
      setNotice(null)
      setWarning({ userId: u.id, username: u.username, purpose, code: result.code })
      return
    }
    setWarning(null)
    flash({
      key: result?.status === 'logged' ? 'users.emailLogged' : successKey,
      params: { username: u.username, email: u.email },
    })
  }

  // --- add user form ---
  const [form, setForm] = useState({ username: '', email: '', role: 'Submitter' })
  const [addPhase, setAddPhase] = useState('idle') // idle | submitting | error
  const [addError, setAddError] = useState(null)

  const canSubmitAdd = form.username.trim() && form.email.trim() && addPhase !== 'submitting'

  async function onAdd(e) {
    e.preventDefault()
    if (!canSubmitAdd) return
    setAddPhase('submitting')
    setAddError(null)
    try {
      const d = await authApi.createUser({
        username: form.username.trim(),
        email: form.email.trim(),
        role: form.role,
      })
      setForm({ username: '', email: '', role: 'Submitter' })
      setAddPhase('idle')
      reportEmail(d.user, 'invite', d.email, 'users.added')
      refresh()
    } catch (err) {
      setAddError(errorText(t, err))
      setAddPhase('error')
    }
  }

  async function run(u, fn) {
    setBusyId(u.id)
    setRowError(null)
    try {
      await fn()
    } catch (err) {
      setRowError({ id: u.id, message: errorText(t, err) })
    } finally {
      setBusyId(null)
    }
  }

  const changeRole = (u, role) =>
    role === u.role
      ? undefined
      : run(u, async () => {
          await authApi.setUserRole(u.id, role)
          flash({ key: 'users.roleChanged', params: { username: u.username, role: roleLabel(role) } })
          refresh()
        })

  const saveEmail = (u) =>
    run(u, async () => {
      const d = await authApi.setUserEmail(u.id, editing.email.trim())
      setEditing(null)
      if (d.email) reportEmail(d.user, 'invite', d.email, 'users.emailInvited')
      else flash({ key: 'users.emailUpdated', params: { username: u.username } })
      refresh()
    })

  const sendInvite = (u) =>
    run(u, async () => {
      const d = await authApi.resendInvite(u.id)
      reportEmail(u, 'invite', d.email, 'users.inviteSent')
    })

  const sendReset = (u) =>
    run(u, async () => {
      const d = await authApi.resetUserPassword(u.id)
      setConfirming(null)
      reportEmail(u, 'reset', d.email, 'users.resetSent')
    })

  const removeUser = (u) =>
    run(u, async () => {
      await authApi.deleteUser(u.id)
      setConfirming(null)
      flash({ key: 'users.removed', params: { username: u.username } })
      refresh()
    })

  const sorted = useMemo(
    () => (users || []).slice().sort((a, b) => a.username.localeCompare(b.username)),
    [users],
  )
  const placeholderUsers = sorted.filter((u) => u.emailIsPlaceholder)
  const warnedUser = warning && sorted.find((u) => u.id === warning.userId)

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl">{t('users.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('users.subtitle')}</p>
      </div>

      {/* Seed accounts still on a placeholder address cannot receive any link. */}
      {placeholderUsers.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            {t('users.placeholderBanner')}{' '}
            <span dir="auto" className="font-medium">
              {placeholderUsers.map((u) => u.username).join(', ')}
            </span>
          </AlertDescription>
        </Alert>
      )}

      {notice && (
        <Alert>
          <AlertDescription>{t(notice.key, notice.params)}</AlertDescription>
        </Alert>
      )}

      {warning && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription className="gap-3">
            <p>
              {warning.code === 'PLACEHOLDER_EMAIL'
                ? t('users.emailFailedPlaceholder', { username: warning.username })
                : t('users.emailFailed', { username: warning.username })}
            </p>
            {warnedUser && warning.code !== 'PLACEHOLDER_EMAIL' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyId === warnedUser.id}
                onClick={() => (warning.purpose === 'reset' ? sendReset(warnedUser) : sendInvite(warnedUser))}
              >
                {busyId === warnedUser.id && <Spinner />}
                {t(warning.purpose === 'reset' ? 'users.resendReset' : 'users.resendInvite')}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Add user */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('users.addTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onAdd} noValidate>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="new-username">{t('users.username')}</FieldLabel>
                  <Input
                    id="new-username"
                    dir="auto"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    autoComplete="off"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-email">{t('users.email')}</FieldLabel>
                  <Input
                    id="new-email"
                    type="email"
                    dir="ltr"
                    className="text-start"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    autoComplete="off"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-role">{t('users.role')}</FieldLabel>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
                  >
                    <SelectTrigger id="new-role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {roleLabel(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">{t('users.addHint')}</p>

              {addPhase === 'error' && addError && (
                <Alert variant="destructive">
                  <AlertDescription>{addError}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={!canSubmitAdd} className="w-fit">
                {addPhase === 'submitting' ? <Spinner /> : <UserPlus aria-hidden="true" />}
                {t('users.addButton')}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {/* User list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('users.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <ErrorMessage error={loadError} onRetry={refresh} />
          ) : users === null ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {sorted.map((u) => {
                const isSelf = u.id === me?.id
                const isAdmin = u.role === 'Admin'
                const pending = u.status === 'Pending'
                const busy = busyId === u.id
                const isEditing = editing?.id === u.id
                const confirmAction = confirming?.id === u.id ? confirming.action : null
                return (
                  <li key={u.id} className="flex flex-col gap-2 px-4 py-3">
                    {/* identity row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p dir="auto" className="min-w-0 truncate text-sm font-medium">
                        {u.username}
                        {isSelf && (
                          <span className="ms-2 text-xs font-normal text-muted-foreground">
                            {t('users.you')}
                          </span>
                        )}
                      </p>
                      <Badge variant={pending ? 'outline' : 'secondary'} className="font-normal">
                        {t(`users.status_${u.status}`)}
                      </Badge>
                      {(isSelf || isAdmin) && (
                        <span className="text-xs text-muted-foreground">{roleLabel(u.role)}</span>
                      )}
                    </div>

                    {/* email row (inline editor when editing) */}
                    {isEditing ? (
                      <form
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault()
                          saveEmail(u)
                        }}
                        noValidate
                      >
                        <Input
                          type="email"
                          dir="ltr"
                          className="h-8 max-w-xs text-start"
                          value={editing.email}
                          onChange={(e) => setEditing({ id: u.id, email: e.target.value })}
                          aria-label={t('users.emailFor', { username: u.username })}
                          autoComplete="off"
                          autoFocus
                        />
                        <Button type="submit" size="sm" disabled={busy || !editing.email.trim()}>
                          {busy && <Spinner />}
                          {t('users.saveEmail')}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
                          {t('common.cancel')}
                        </Button>
                      </form>
                    ) : (
                      <p className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span dir="ltr" className="text-muted-foreground">
                          {u.email}
                        </span>
                        {u.emailIsPlaceholder && (
                          <span className="text-xs font-medium text-destructive">
                            {t('users.placeholderRow')}
                          </span>
                        )}
                      </p>
                    )}

                    {rowError?.id === u.id && (
                      <p className="text-xs text-destructive">{rowError.message}</p>
                    )}

                    {/* actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Role: editable only for non-self, non-Admin rows */}
                      {!(isSelf || isAdmin) && (
                        <Select
                          value={u.role}
                          onValueChange={(v) => changeRole(u, v)}
                          disabled={busy}
                        >
                          <SelectTrigger className="h-8 w-36" aria-label={t('users.role')}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {roleLabel(r)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {!isEditing && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={() => {
                            setRowError(null)
                            setConfirming(null)
                            setEditing({ id: u.id, email: u.emailIsPlaceholder ? '' : u.email })
                          }}
                        >
                          <Pencil aria-hidden="true" />
                          {t('users.editEmail')}
                        </Button>
                      )}

                      {pending && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          disabled={busy}
                          onClick={() => sendInvite(u)}
                        >
                          {busy ? <Spinner /> : <Mail aria-hidden="true" />}
                          {t('users.resendInvite')}
                        </Button>
                      )}

                      {/* Reset: active users other than yourself (use Change password for that) */}
                      {!pending && !isSelf &&
                        (confirmAction === 'reset' ? (
                          <span className="flex items-center gap-2">
                            <Button type="button" size="sm" onClick={() => sendReset(u)} disabled={busy}>
                              {busy ? <Spinner /> : t('users.confirmReset')}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                              {t('common.cancel')}
                            </Button>
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={() => {
                              setRowError(null)
                              setConfirming({ id: u.id, action: 'reset' })
                            }}
                          >
                            <KeyRound aria-hidden="true" />
                            {t('users.resetPassword')}
                          </Button>
                        ))}

                      {/* Remove: never for self */}
                      {!isSelf &&
                        (confirmAction === 'remove' ? (
                          <span className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => removeUser(u)}
                              disabled={busy}
                            >
                              {busy ? <Spinner /> : t('users.confirmRemove')}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                              {t('common.cancel')}
                            </Button>
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={() => {
                              setRowError(null)
                              setConfirming({ id: u.id, action: 'remove' })
                            }}
                          >
                            <Trash2 aria-hidden="true" />
                            {t('users.remove')}
                          </Button>
                        ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
