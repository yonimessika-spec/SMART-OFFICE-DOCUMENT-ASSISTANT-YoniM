import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as authApi from '../api/auth.js'
import { errorText } from '../api/errorText.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'

const MIN_LENGTH = 8

// Any signed-in user changes their own password: current + new + confirm. The
// server checks the current password; nothing here is logged or stored.
export default function ChangePassword() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [phase, setPhase] = useState('idle') // idle | submitting | done | error
  const [error, setError] = useState(null)

  const tooShort = next.length > 0 && next.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== next
  const canSubmit =
    current && next.length >= MIN_LENGTH && confirm === next && phase !== 'submitting'

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setPhase('submitting')
    setError(null)
    try {
      await authApi.changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setPhase('done')
    } catch (err) {
      setError(errorText(t, err))
      setPhase('error')
    }
  }

  return (
    <section className="flex max-w-md flex-col gap-6">
      <h1 className="text-2xl">{t('changePassword.title')}</h1>

      {phase === 'done' && (
        <Alert>
          <AlertDescription>{t('changePassword.done')}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('changePassword.formTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="cp-current">{t('changePassword.current')}</FieldLabel>
                <Input
                  id="cp-current"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="cp-new">{t('setPassword.newPassword')}</FieldLabel>
                <Input
                  id="cp-new"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  aria-invalid={tooShort}
                  required
                />
                <p className={`text-xs ${tooShort ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {t('setPassword.hint')}
                </p>
              </Field>

              <Field>
                <FieldLabel htmlFor="cp-confirm">{t('setPassword.confirmPassword')}</FieldLabel>
                <Input
                  id="cp-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={mismatch}
                  required
                />
                {mismatch && <p className="text-xs text-destructive">{t('setPassword.mismatch')}</p>}
              </Field>

              {phase === 'error' && error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={!canSubmit} className="w-fit">
                {phase === 'submitting' && <Spinner />}
                {phase === 'submitting' ? t('common.saving') : t('changePassword.submit')}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
