import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import * as authApi from '../api/auth.js'
import { errorText } from '../api/errorText.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'

const MIN_LENGTH = 8

// Public page (no login): /set-password?token=...  Reached from an invite or a
// password-reset email. The token is checked first so a dead link shows one clear
// message instead of an empty form; the same generic wording is used for unknown,
// expired and already-used links.
export default function SetPassword() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  const [check, setCheck] = useState('checking') // checking | valid | invalid | unreachable
  const [info, setInfo] = useState(null) // { username, purpose }
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [phase, setPhase] = useState('idle') // idle | submitting | error
  const [error, setError] = useState(null)

  const current = i18n.resolvedLanguage === 'he' ? 'he' : 'en'
  const other = current === 'he' ? 'en' : 'he'

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setCheck('invalid')
      return undefined
    }
    authApi
      .validateSetPasswordToken(token)
      .then((d) => {
        if (cancelled) return
        setInfo({ username: d.username, purpose: d.purpose })
        setCheck('valid')
      })
      .catch((err) => {
        if (cancelled) return
        setCheck(err?.status === 400 ? 'invalid' : 'unreachable')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const tooShort = password.length > 0 && password.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== password
  const canSubmit =
    password.length >= MIN_LENGTH && confirm === password && phase !== 'submitting'

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setPhase('submitting')
    setError(null)
    try {
      await authApi.setPassword(token, password)
      navigate('/', { replace: true, state: { passwordSet: true } })
    } catch (err) {
      if (err?.code === 'INVALID_TOKEN') {
        setCheck('invalid')
      } else {
        setError(errorText(t, err))
        setPhase('error')
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
          {t('nav.brand')}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={() => i18n.changeLanguage(other)}
          aria-label={t('lang.ariaLabel')}
        >
          <Languages aria-hidden="true" />
          {t(`lang.${other}`)}
        </Button>
      </div>

      {check === 'checking' && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner /> {t('setPassword.checking')}
        </div>
      )}

      {check === 'invalid' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('setPassword.invalidTitle')}</CardTitle>
            <CardDescription>{t('setPassword.invalidBody')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" onClick={() => navigate('/', { replace: true })}>
              {t('setPassword.goToSignIn')}
            </Button>
          </CardContent>
        </Card>
      )}

      {check === 'unreachable' && (
        <Alert variant="destructive">
          <AlertDescription>{t('errors.generic')}</AlertDescription>
        </Alert>
      )}

      {check === 'valid' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {t(info.purpose === 'reset' ? 'setPassword.titleReset' : 'setPassword.titleInvite')}
            </CardTitle>
            <CardDescription>
              {t('setPassword.subtitle')}{' '}
              <span dir="auto" className="font-medium text-foreground">
                {info.username}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} noValidate>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="sp-password">{t('setPassword.newPassword')}</FieldLabel>
                  <Input
                    id="sp-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={tooShort}
                    required
                    autoFocus
                  />
                  <p className={`text-xs ${tooShort ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {t('setPassword.hint')}
                  </p>
                </Field>

                <Field>
                  <FieldLabel htmlFor="sp-confirm">{t('setPassword.confirmPassword')}</FieldLabel>
                  <Input
                    id="sp-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    aria-invalid={mismatch}
                    required
                  />
                  {mismatch && (
                    <p className="text-xs text-destructive">{t('setPassword.mismatch')}</p>
                  )}
                </Field>

                {phase === 'error' && error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" disabled={!canSubmit}>
                  {phase === 'submitting' && <Spinner />}
                  {phase === 'submitting' ? t('common.saving') : t('setPassword.submit')}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
