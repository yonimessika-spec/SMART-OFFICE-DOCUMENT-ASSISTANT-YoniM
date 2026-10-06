// Thin Express proxy between the browser and the n8n webhooks (SPEC.md §2).
//
// It holds N8N_SECRET and the webhook URLs. The browser never sees the secret.
// There is NO business logic here for documents: this process only forwards
// requests, attaches the x-api-key header, and (Section 15) enforces login + role
// before forwarding. No AI calls, no Google API calls, no urgency logic, no
// reshaping of the payload.
//
// Proxy routes (all require a valid session):
//   GET  /api/documents  ->  {N8N_BASE_URL}{N8N_DOCUMENTS_PATH}   any role
//   POST /api/process    ->  {N8N_BASE_URL}{N8N_PROCESS_PATH}     Admin | Submitter
//   POST /api/review     ->  {N8N_BASE_URL}{N8N_REVIEW_PATH}      Admin | Submitter
//   POST|GET /api/review-requests, POST /api/review-requests/:id/resend   (reviewRoutes.js)
//
// Auth routes:
//   POST /auth/login     POST /auth/logout     GET /auth/me
//   POST /auth/change-password                                    any signed-in user
//   GET  /auth/set-password/validate   POST /auth/set-password    public (token link)
//   GET/POST /auth/users   PATCH/DELETE /auth/users/:id           Admin only
//   GET  /auth/users/directory                                    Admin | Submitter
//   POST /auth/users/:id/resend-invite  POST /auth/users/:id/reset-password   Admin only
//
// Users live in Postgres (db.js / users.js); emails go out through an n8n webhook
// (email.js). Env is loaded by `node --env-file-if-exists=.env` (see package.json).

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import {
  COOKIE_NAME,
  signSession,
  sessionCookieOptions,
  clearCookieOptions,
  authRequired,
  requireRole,
} from './auth.js'
import {
  ASSIGNABLE_ROLES,
  publicUser,
  listUsers,
  listDirectory,
  findByUsername,
  verifyPassword,
  createPendingUser,
  deleteUser,
  updateUser,
  requirePending,
  requireActiveForReset,
  completePasswordSet,
  changePassword,
  findById,
  isPlaceholderEmail,
  listPlaceholderEmailUsers,
  seedOnBoot,
} from './users.js'
import { initDb } from './db.js'
import { issueToken, peekToken } from './tokens.js'
import { sendEmail, buildPasswordEmail, setPasswordLink, emailMode } from './email.js'
import { rateLimit, clientIp, bodyUsername } from './rateLimit.js'
import reviewRequestsRouter from './reviewRoutes.js'

const {
  N8N_BASE_URL,
  N8N_DOCUMENTS_PATH,
  N8N_PROCESS_PATH,
  N8N_REVIEW_PATH,
  N8N_SECRET,
  JWT_SECRET,
  CLIENT_ORIGIN,
  DATABASE_URL,
  SEED_ADMIN_USERNAME,
  SEED_ADMIN_PASSWORD,
  SEED_ADMIN_EMAIL,
  SEED_SUBMITTER_USERNAME,
  SEED_SUBMITTER_PASSWORD,
  SEED_SUBMITTER_EMAIL,
  SEED_VIEWER_USERNAME,
  SEED_VIEWER_PASSWORD,
  SEED_VIEWER_EMAIL,
  TRUST_PROXY_HOPS,
  NODE_ENV,
  REQUEST_TIMEOUT_MS = '90000',
  PORT = '3001',
} = process.env

// Fail fast with a readable message if the operator forgot to copy .env.example.
const REQUIRED = {
  N8N_BASE_URL,
  N8N_DOCUMENTS_PATH,
  N8N_PROCESS_PATH,
  N8N_REVIEW_PATH,
  N8N_SECRET,
  JWT_SECRET,
  CLIENT_ORIGIN,
  DATABASE_URL,
}
const missing = Object.entries(REQUIRED)
  .filter(([, value]) => !value)
  .map(([key]) => key)
if (missing.length > 0) {
  console.error(
    `[server] missing required env var(s): ${missing.join(', ')}\n` +
      '[server] copy server/.env.example to server/.env and fill in the values.',
  )
  process.exit(1)
}

const timeoutMs = Number(REQUEST_TIMEOUT_MS) || 90000

const app = express()
const jsonBody = express.json()

// Hops between the browser and this process, used for req.ip (rate limiting).
// Production path: browser -> Netlify redirect -> Render's proxy -> here. The
// exact hop count there has not been verified end to end; see persistent-users.md.
const hopsFromEnv = TRUST_PROXY_HOPS === undefined || TRUST_PROXY_HOPS === '' ? NaN : Number(TRUST_PROXY_HOPS)
const proxyHops = Number.isInteger(hopsFromEnv) && hopsFromEnv >= 0
  ? hopsFromEnv
  : NODE_ENV === 'production' ? 2 : 0
app.set('trust proxy', proxyHops)

// --- CORS -------------------------------------------------------------------
// The session cookie is sent cross-origin from the Vite dev server, so CORS must
// run WITH credentials — which forbids the "*" origin. Lock it to the configured
// client origin. In a same-origin deployment this is a no-op.
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }))
app.use(cookieParser())

// Turn a thrown typed error from users.js into its HTTP response.
function sendError(res, err) {
  const status = err.status || 500
  const body = { error_code: err.code || 'SERVER_ERROR', error: err.message }
  if (status >= 500) {
    console.error('[server] request error:', err.message)
    body.error = 'Something went wrong on the server.'
  }
  return res.status(status).json(body)
}

// ===========================================================================
// Rate limits (in memory, per instance)
// ===========================================================================
// IP-level limits are deliberately generous: if the proxy hop count is wrong, all
// users share one "IP" bucket. The tight limit is keyed on IP + username.
const TEN_MIN = 10 * 60 * 1000
const loginIpLimit = rateLimit({
  windowMs: TEN_MIN,
  max: 100,
  key: (req) => `login-ip:${clientIp(req)}`,
  message: 'Too many sign-in attempts. Wait a few minutes and try again.',
})
const loginUserLimit = rateLimit({
  windowMs: TEN_MIN,
  max: 8,
  key: (req) => `login-user:${clientIp(req)}|${bodyUsername(req)}`,
  message: 'Too many sign-in attempts for this account. Wait a few minutes and try again.',
})
const tokenIpLimit = rateLimit({
  windowMs: TEN_MIN,
  max: 60,
  key: (req) => `token-ip:${clientIp(req)}`,
  message: 'Too many attempts. Wait a few minutes and try again.',
})
const changePasswordLimit = rateLimit({
  windowMs: TEN_MIN,
  max: 8,
  key: (req) => `chpw:${req.user?.id}`,
  message: 'Too many attempts. Wait a few minutes and try again.',
})

// ===========================================================================
// Auth
// ===========================================================================

// POST /auth/login  { username, password }  ->  200 { user }  (sets cookie)
//                                               401 { error_code: BAD_CREDENTIALS }
app.post('/auth/login', jsonBody, loginIpLimit, loginUserLimit, async (req, res) => {
  try {
    const { username, password } = req.body || {}
    const user = await findByUsername(username)
    const ok = await verifyPassword(user, password)
    if (!user || !ok) {
      // Same message + timing shape whether the username exists, is pending, or
      // the password is wrong.
      return res.status(401).json({
        error_code: 'BAD_CREDENTIALS',
        error: 'That username and password do not match.',
      })
    }
    res.cookie(COOKIE_NAME, signSession(user), sessionCookieOptions())
    return res.json({ user: publicUser(user) })
  } catch (err) {
    return sendError(res, err)
  }
})

// POST /auth/logout  ->  200 { ok: true }  (clears cookie)
app.post('/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, clearCookieOptions())
  return res.json({ ok: true })
})

// GET /auth/me  ->  200 { user }  |  401 (not signed in / expired)
app.get('/auth/me', authRequired, (req, res) => {
  return res.json({ user: req.user })
})

// POST /auth/change-password  { currentPassword, newPassword }  ->  200 { ok }
app.post('/auth/change-password', authRequired, jsonBody, changePasswordLimit, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {}
    const updated = await changePassword(req.user.id, currentPassword, newPassword)
    // Every older session (including a stolen one) is now invalid; give this tab a
    // fresh cookie so the user who just changed the password stays signed in.
    res.cookie(COOKIE_NAME, signSession(updated), sessionCookieOptions())
    return res.json({ ok: true })
  } catch (err) {
    return sendError(res, err)
  }
})

// --- Set password via emailed link (public) ---------------------------------

const invalidToken = (res) =>
  res.status(400).json({
    error_code: 'INVALID_TOKEN',
    error: 'This link is invalid or has expired. Ask an administrator for a new one.',
  })

// GET /auth/set-password/validate?token=...  ->  200 { valid, username, purpose }
app.get('/auth/set-password/validate', tokenIpLimit, async (req, res) => {
  try {
    const info = await peekToken(String(req.query.token || ''))
    if (!info) return invalidToken(res)
    return res.json({ valid: true, username: info.username, purpose: info.purpose })
  } catch (err) {
    return sendError(res, err)
  }
})

// POST /auth/set-password  { token, password }  ->  200 { ok, purpose }
app.post('/auth/set-password', jsonBody, tokenIpLimit, async (req, res) => {
  try {
    const { token, password } = req.body || {}
    const done = await completePasswordSet(String(token || ''), password)
    if (!done) return invalidToken(res)
    return res.json({ ok: true, purpose: done.purpose })
  } catch (err) {
    return sendError(res, err)
  }
})

// --- User management (Admin only) ------------------------------------------

const adminOnly = [authRequired, requireRole('Admin')]

// Issue a fresh token for `user` and email it. Never throws for email problems:
// the user (or reset) exists either way, so the caller gets a status to show.
//   { status: 'sent' }                       real email went out
//   { status: 'logged' }                     dev mode: link is in the server console
//   { status: 'failed', code, message }      user kept, email did not go out
async function deliverPasswordLink(user, purpose) {
  if (isPlaceholderEmail(user.email)) {
    return {
      status: 'failed',
      code: 'PLACEHOLDER_EMAIL',
      message: 'This user has a placeholder email address. Edit it to a real address first.',
    }
  }
  try {
    const { token, hours } = await issueToken(user.id, purpose)
    const link = setPasswordLink(token)
    const { subject, html } = buildPasswordEmail({ purpose, username: user.username, link, hours })
    const { mode } = await sendEmail({
      to: user.email,
      subject,
      html,
      consoleNote: `${purpose} link for "${user.username}": ${link}`,
    })
    return { status: mode === 'console' ? 'logged' : 'sent' }
  } catch (err) {
    console.error(`[server] could not deliver ${purpose} email for "${user.username}": ${err.message}`)
    return {
      status: 'failed',
      code: err.code || 'EMAIL_FAILED',
      message: 'The email could not be sent. Use Resend invite to try again.',
    }
  }
}

// GET /auth/users/directory  ->  { users: [ { id, username, role, hasEmail, pending } ] }
// For the review-request recipient picker. Admin and Submitter only; carries no email
// address, hash or token. The full list below stays Admin-only.
app.get('/auth/users/directory', authRequired, requireRole('Admin', 'Submitter'), async (_req, res) => {
  try {
    return res.json({ users: await listDirectory() })
  } catch (err) {
    return sendError(res, err)
  }
})

// GET /auth/users  ->  { users: [ { id, username, email, role, status, ... } ] }
app.get('/auth/users', adminOnly, async (_req, res) => {
  try {
    return res.json({ users: await listUsers() })
  } catch (err) {
    return sendError(res, err)
  }
})

// POST /auth/users  { username, email, role }  ->  201 { user, email }
// The user is created Pending (no password) and gets an invite link.
app.post('/auth/users', adminOnly, jsonBody, async (req, res) => {
  try {
    const { username, email, role } = req.body || {}
    const created = await createPendingUser({ username, email, role })
    const emailResult = await deliverPasswordLink(created, 'invite')
    return res.status(201).json({ user: publicUser(created), email: emailResult })
  } catch (err) {
    return sendError(res, err)
  }
})

// PATCH /auth/users/:id  { role?, email? }  ->  200 { user, email? }
// Role: Submitter <-> Viewer only. If a still-pending user's email changes, a new
// invite goes to the new address (the old link is invalidated by issueToken).
app.patch('/auth/users/:id', adminOnly, jsonBody, async (req, res) => {
  try {
    const { role, email } = req.body || {}
    const { user, emailChanged, wasPending } = await updateUser(
      req.params.id,
      { role, email },
      req.user.id,
    )
    const body = { user: publicUser(user) }
    if (emailChanged && wasPending) body.email = await deliverPasswordLink(user, 'invite')
    return res.json(body)
  } catch (err) {
    return sendError(res, err)
  }
})

// POST /auth/users/:id/resend-invite  ->  200 { email }   (Pending users only)
app.post('/auth/users/:id/resend-invite', adminOnly, async (req, res) => {
  try {
    const user = await requirePending(req.params.id)
    return res.json({ email: await deliverPasswordLink(user, 'invite') })
  } catch (err) {
    return sendError(res, err)
  }
})

// POST /auth/users/:id/reset-password  ->  200 { email }   (Active users only)
app.post('/auth/users/:id/reset-password', adminOnly, async (req, res) => {
  try {
    const user = await requireActiveForReset(req.params.id, req.user.id)
    return res.json({ email: await deliverPasswordLink(user, 'reset') })
  } catch (err) {
    return sendError(res, err)
  }
})

// DELETE /auth/users/:id  ->  200 { ok: true }
app.delete('/auth/users/:id', adminOnly, async (req, res) => {
  try {
    await deleteUser(req.params.id, req.user.id)
    return res.json({ ok: true })
  } catch (err) {
    return sendError(res, err)
  }
})

// ===========================================================================
// n8n proxy  (login required; write actions also require a role)
// ===========================================================================

// Forward to n8n: attach x-api-key server-side, pass the upstream status + JSON
// body straight through (success or error), convert transport failures into a
// clean JSON error the client can turn into a sentence (SPEC.md F7).
async function forwardToN8n(target, { method, body }, res) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const upstream = await fetch(target, {
      method,
      headers: {
        'x-api-key': N8N_SECRET, // attached server-side; never sent to the browser
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    })

    const raw = await upstream.text()
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return res.status(502).json({
        error: 'The automation service returned a response that was not valid JSON.',
      })
    }
    const payload =
      parsed && typeof parsed === 'object' ? parsed : { error: String(parsed) }
    return res.status(upstream.status).json(payload)
  } catch (err) {
    if (err.name === 'AbortError') {
      return res
        .status(504)
        .json({ error: 'The automation service took too long to respond.' })
    }
    return res.status(502).json({ error: 'Could not reach the automation service.' })
  } finally {
    clearTimeout(timer)
  }
}

// GET /api/documents — any signed-in role (Viewer included).
app.get('/api/documents', authRequired, (_req, res) =>
  forwardToN8n(`${N8N_BASE_URL}${N8N_DOCUMENTS_PATH}`, { method: 'GET' }, res),
)

// POST /api/process — Admin or Submitter. express.json 20 MB: file_base64 for a
// 10 MB upload is ~13.4 MB of base64.
app.post(
  '/api/process',
  authRequired,
  requireRole('Admin', 'Submitter'),
  express.json({ limit: '20mb' }),
  (req, res) =>
    forwardToN8n(`${N8N_BASE_URL}${N8N_PROCESS_PATH}`, { method: 'POST', body: req.body }, res),
)

// POST /api/review — Admin or Submitter. Small body, default limit is fine.
app.post(
  '/api/review',
  authRequired,
  requireRole('Admin', 'Submitter'),
  jsonBody,
  (req, res) =>
    forwardToN8n(`${N8N_BASE_URL}${N8N_REVIEW_PATH}`, { method: 'POST', body: req.body }, res),
)

// Review requests: emailed "please look at this document" messages (reviewRoutes.js).
app.use('/api/review-requests', reviewRequestsRouter)

// Lightweight liveness check (no auth, no database).
app.get('/health', (_req, res) => res.json({ ok: true }))

// ===========================================================================
// Boot
// ===========================================================================

// 1. Database. Retries while Neon wakes up; if it stays unreachable there is NO
//    fallback (no file, no empty store): log clearly and exit.
try {
  await initDb()
  console.log('[server] database: connected, schema up to date')
} catch (err) {
  console.error(
    `[server] FATAL: the user database is unreachable after retries (${err.message}).\n` +
      '[server] Check DATABASE_URL and that the Neon project is up. Exiting; no fallback store is used.',
  )
  process.exit(1)
}

// 2. Seeding. Empty table -> create the env users once. Table without an Admin ->
//    restore the env Admin. Otherwise nothing: a user an Admin deleted stays gone.
try {
  const result = await seedOnBoot({
    admin: {
      username: SEED_ADMIN_USERNAME,
      password: SEED_ADMIN_PASSWORD,
      email: SEED_ADMIN_EMAIL,
    },
    others: [
      {
        username: SEED_SUBMITTER_USERNAME,
        password: SEED_SUBMITTER_PASSWORD,
        email: SEED_SUBMITTER_EMAIL,
        role: 'Submitter',
      },
      {
        username: SEED_VIEWER_USERNAME,
        password: SEED_VIEWER_PASSWORD,
        email: SEED_VIEWER_EMAIL,
        role: 'Viewer',
      },
    ],
  })
  if (result.seeded.length) {
    console.log(
      `[server] seeded ${result.recovered ? '(Admin recovery) ' : ''}users: ${result.seeded.join(', ')}`,
    )
  } else {
    console.log('[server] user store: existing users found, nothing to seed')
  }
  if (result.problem) console.error(`[server] WARNING: ${result.problem}`)
} catch (err) {
  console.error(`[server] FATAL: seeding failed: ${err.message}`)
  process.exit(1)
}

// 3. Placeholder emails. A seed with no real email gets <user>@seed.invalid so the
//    deploy cannot go down, but invites/resets cannot reach it, so shout about it:
//    at boot and every 15 minutes. The Users screen flags the same rows.
async function warnAboutPlaceholderEmails() {
  try {
    const rows = await listPlaceholderEmailUsers()
    if (!rows.length) return
    const list = rows.map((r) => `${r.username} (${r.role})`).join(', ')
    console.warn(
      `[server] WARNING: ${rows.length} user(s) have a placeholder email and cannot receive ` +
        `password links: ${list}. Set the real address on the Users screen` +
        (SEED_ADMIN_EMAIL ? '.' : ', and set SEED_ADMIN_EMAIL (and the other SEED_*_EMAIL vars) in the environment.'),
    )
  } catch (err) {
    console.error(`[server] placeholder-email check failed: ${err.message}`)
  }
}
await warnAboutPlaceholderEmails()
setInterval(warnAboutPlaceholderEmails, 15 * 60 * 1000).unref()

app.listen(Number(PORT), () => {
  console.log(`[server] proxy listening on http://localhost:${PORT}`)
  console.log(`[server] CORS origin: ${CLIENT_ORIGIN} (credentials on)`)
  console.log(`[server] email mode: ${emailMode()}   trust proxy hops: ${proxyHops}`)
  console.log(`[server] auth:  POST /auth/login  POST /auth/logout  GET /auth/me  POST /auth/change-password`)
  console.log(`[server] public: GET /auth/set-password/validate  POST /auth/set-password`)
  console.log(`[server] admin: GET|POST /auth/users  PATCH|DELETE /auth/users/:id  POST .../resend-invite|reset-password`)
  console.log(`[server] GET  /api/documents -> ${N8N_BASE_URL}${N8N_DOCUMENTS_PATH}  (any role)`)
  console.log(`[server] POST /api/process   -> ${N8N_BASE_URL}${N8N_PROCESS_PATH}  (Admin|Submitter)`)
  console.log(`[server] POST /api/review    -> ${N8N_BASE_URL}${N8N_REVIEW_PATH}  (Admin|Submitter)`)
  console.log(`[server] roles assignable through the app: ${ASSIGNABLE_ROLES.join(', ')}`)
})
