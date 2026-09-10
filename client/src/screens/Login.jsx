import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext.jsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'

// The whole app is behind this screen — no anonymous access. On success the
// AuthContext gets the user and App swaps in the real routes.
export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [phase, setPhase] = useState('idle') // idle | submitting | error
  const [errorKey, setErrorKey] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    if (phase === 'submitting') return
    setPhase('submitting')
    setErrorKey(null)
    try {
      await login(username.trim(), password)
      // AuthContext now has the user; App re-renders into the app.
    } catch (err) {
      setErrorKey(err?.code === 'BAD_CREDENTIALS' ? 'auth.badCredentials' : 'errors.generic')
      setPhase('error')
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2 font-semibold tracking-tight">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
        {t('nav.brand')}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('auth.title')}</CardTitle>
          <CardDescription>{t('auth.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="login-username">{t('auth.username')}</FieldLabel>
                <Input
                  id="login-username"
                  name="username"
                  autoComplete="username"
                  dir="auto"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="login-password">{t('auth.password')}</FieldLabel>
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>

              {phase === 'error' && errorKey && (
                <Alert variant="destructive">
                  <AlertDescription>{t(errorKey)}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={phase === 'submitting' || !username.trim() || !password}>
                {phase === 'submitting' && <Spinner />}
                {phase === 'submitting' ? t('auth.signingIn') : t('auth.signIn')}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
