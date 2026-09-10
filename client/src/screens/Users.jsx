import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import * as authApi from '../api/auth.js'
import { ASSIGNABLE_ROLES } from '../auth/permissions.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
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
// here hits an Admin-only endpoint — the server is the real check.
export default function Users() {
  const { t } = useTranslation()
  const { user: me } = useAuth()

  const [users, setUsers] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [notice, setNotice] = useState(null) // { key, params } transient success line
  const [rowError, setRowError] = useState(null) // { id, message }
  const [confirmingId, setConfirmingId] = useState(null)
  const [busyId, setBusyId] = useState(null)

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
  }, [refresh])

  // --- add user form ---
  const [form, setForm] = useState({ username: '', password: '', role: 'Submitter' })
  const [addPhase, setAddPhase] = useState('idle') // idle | submitting | error
  const [addError, setAddError] = useState(null)

  const canSubmitAdd = form.username.trim() && form.password.length >= 8 && addPhase !== 'submitting'

  async function onAdd(e) {
    e.preventDefault()
    if (!canSubmitAdd) return
    setAddPhase('submitting')
    setAddError(null)
    try {
      const d = await authApi.createUser({
        username: form.username.trim(),
        password: form.password,
        role: form.role,
      })
      setForm({ username: '', password: '', role: 'Submitter' })
      setAddPhase('idle')
      flash({ key: 'users.added', params: { username: d.user.username } })
      refresh()
    } catch (err) {
      setAddError(err?.message || t('errors.generic'))
      setAddPhase('error')
    }
  }

  function flash(msg) {
    setNotice(msg)
    window.clearTimeout(flash._t)
    flash._t = window.setTimeout(() => setNotice(null), 4000)
  }

  async function changeRole(u, role) {
    if (role === u.role) return
    setBusyId(u.id)
    setRowError(null)
    try {
      await authApi.setUserRole(u.id, role)
      flash({ key: 'users.roleChanged', params: { username: u.username, role: roleLabel(role) } })
      refresh()
    } catch (err) {
      setRowError({ id: u.id, message: err?.message || t('errors.generic') })
    } finally {
      setBusyId(null)
    }
  }

  async function removeUser(u) {
    setBusyId(u.id)
    setRowError(null)
    try {
      await authApi.deleteUser(u.id)
      setConfirmingId(null)
      flash({ key: 'users.removed', params: { username: u.username } })
      refresh()
    } catch (err) {
      setRowError({ id: u.id, message: err?.message || t('errors.generic') })
    } finally {
      setBusyId(null)
    }
  }

  const sorted = useMemo(
    () =>
      (users || [])
        .slice()
        .sort((a, b) => a.username.localeCompare(b.username)),
    [users],
  )

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl">{t('users.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('users.subtitle')}</p>
      </div>

      {notice && (
        <Alert>
          <AlertDescription>{t(notice.key, notice.params)}</AlertDescription>
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
                  <FieldLabel htmlFor="new-password">{t('users.tempPassword')}</FieldLabel>
                  <Input
                    id="new-password"
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    autoComplete="off"
                    placeholder={t('users.tempPasswordHint')}
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
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {sorted.map((u) => {
                const isSelf = u.id === me?.id
                const isAdmin = u.role === 'Admin'
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p dir="auto" className="truncate text-sm font-medium">
                        {u.username}
                        {isSelf && (
                          <span className="ms-2 text-xs font-normal text-muted-foreground">
                            {t('users.you')}
                          </span>
                        )}
                      </p>
                      {rowError?.id === u.id && (
                        <p className="mt-0.5 text-xs text-destructive">{rowError.message}</p>
                      )}
                    </div>

                    {/* Role: editable only for non-self, non-Admin rows */}
                    {isSelf || isAdmin ? (
                      <span className="text-sm text-muted-foreground">{roleLabel(u.role)}</span>
                    ) : (
                      <Select
                        value={u.role}
                        onValueChange={(v) => changeRole(u, v)}
                        disabled={busyId === u.id}
                      >
                        <SelectTrigger className="w-36" aria-label={t('users.role')}>
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

                    {/* Remove: never for self */}
                    {isSelf ? (
                      <span className="w-24" />
                    ) : confirmingId === u.id ? (
                      <span className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => removeUser(u)}
                          disabled={busyId === u.id}
                        >
                          {busyId === u.id ? <Spinner /> : t('users.confirmRemove')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingId(null)}
                        >
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
                          setConfirmingId(u.id)
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                        {t('users.remove')}
                      </Button>
                    )}
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
