// Thin Express proxy between the browser and the n8n webhooks (SPEC.md §2).
//
// It holds N8N_SECRET and the webhook URLs. The browser never sees the secret.
// There is NO business logic here — this process only forwards requests, attaches
// the x-api-key header, and (Section 15) enforces login + role before forwarding.
// No AI calls, no Google API calls, no urgency logic, no reshaping of the payload.
//
// Proxy routes (all require a valid session):
//   GET  /api/documents  ->  {N8N_BASE_URL}{N8N_DOCUMENTS_PATH}   any role
//   POST /api/process    ->  {N8N_BASE_URL}{N8N_PROCESS_PATH}     Admin | Submitter
//   POST /api/review     ->  {N8N_BASE_URL}{N8N_REVIEW_PATH}      Admin | Submitter
//
// Auth routes:
//   POST /auth/login     POST /auth/logout     GET /auth/me
//   GET/POST /auth/users   PATCH/DELETE /auth/users/:id           Admin only
//
// Env is loaded by `node --env-file-if-exists=.env` (see package.json scripts).

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import {
  COOKIE_NAME,
  signSession,
  sessionCookieOptions,
  authRequired,
  requireRole,
} from './auth.js'
import {
  ASSIGNABLE_ROLES,
  publicUser,
  listUsers,
  findByUsername,
  verifyPassword,
  createUser,
  deleteUser,
  setRole,
  seedAdminIfEmpty,
} from './users.js'

const {
  N8N_BASE_URL,
  N8N_DOCUMENTS_PATH,
  N8N_PROCESS_PATH,
  N8N_REVIEW_PATH,
  N8N_SECRET,
  JWT_SECRET,
  CLIENT_ORIGIN,
  SEED_ADMIN_USERNAME,
  SEED_ADMIN_PASSWORD,
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

// --- CORS -------------------------------------------------------------------
// The session cookie is sent cross-origin from the Vite dev server, so CORS must
// run WITH credentials — which forbids the "*" origin. Lock it to the configured
// client origin. In a same-origin deployment this is a no-op.
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }))
app.use(cookieParser())

// ===========================================================================
// Auth
// ===========================================================================

// POST /auth/login  { username, password }  ->  200 { user }  (sets cookie)
//                                               401 { error_code: UNAUTHENTICATED }
app.post('/auth/login', jsonBody, async (req, res) => {
  const { username, password } = req.body || {}
  const user = findByUsername(username)
  const ok = await verifyPassword(user, password)
  if (!user || !ok) {
    // Same message + timing shape whether the username exists or not.
    return res.status(401).json({
      error_code: 'BAD_CREDENTIALS',
      error: 'That username and password do not match.',
    })
  }
  res.cookie(COOKIE_NAME, signSession(user), sessionCookieOptions())
  return res.json({ user: publicUser(user) })
})

// POST /auth/logout  ->  200 { ok: true }  (clears cookie)
app.post('/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, sessionCookieOptions())
  return res.json({ ok: true })
})

// GET /auth/me  ->  200 { user }  |  401 (not signed in / expired)
app.get('/auth/me', authRequired, (req, res) => {
  return res.json({ user: req.user })
})

// --- User management (Admin only) ------------------------------------------

const adminOnly = [authRequired, requireRole('Admin')]

// Turn a thrown typed error from users.js into its HTTP response.
function sendError(res, err) {
  const status = err.status || 500
  const body = { error_code: err.code || 'SERVER_ERROR', error: err.message }
  if (status >= 500) console.error('[server] user-store error:', err)
  return res.status(status).json(body)
}

// GET /auth/users  ->  { users: [ { id, username, role, createdAt } ] }
app.get('/auth/users', adminOnly, (_req, res) => {
  return res.json({ users: listUsers() })
})

// POST /auth/users  { username, password, role }  ->  201 { user }
app.post('/auth/users', adminOnly, jsonBody, async (req, res) => {
  try {
    const { username, password, role } = req.body || {}
    const user = await createUser({ username, password, role })
    return res.status(201).json({ user })
  } catch (err) {
    return sendError(res, err)
  }
})

// PATCH /auth/users/:id  { role }  ->  200 { user }   (Submitter <-> Viewer only)
app.patch('/auth/users/:id', adminOnly, jsonBody, async (req, res) => {
  try {
    const user = await setRole(req.params.id, (req.body || {}).role, req.user.id)
    return res.json({ user })
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

// Lightweight liveness check for local dev (no auth).
app.get('/health', (_req, res) => res.json({ ok: true }))

// ===========================================================================
// Boot
// ===========================================================================

try {
  const status = await seedAdminIfEmpty({
    username: SEED_ADMIN_USERNAME,
    password: SEED_ADMIN_PASSWORD,
  })
  console.log(`[server] user store: ${status}`)
} catch (err) {
  console.error(`[server] ${err.message}`)
  process.exit(1)
}

app.listen(Number(PORT), () => {
  console.log(`[server] proxy listening on http://localhost:${PORT}`)
  console.log(`[server] CORS origin: ${CLIENT_ORIGIN} (credentials on)`)
  console.log(`[server] auth:  POST /auth/login  POST /auth/logout  GET /auth/me`)
  console.log(`[server] admin: GET|POST /auth/users  PATCH|DELETE /auth/users/:id`)
  console.log(`[server] GET  /api/documents -> ${N8N_BASE_URL}${N8N_DOCUMENTS_PATH}  (any role)`)
  console.log(`[server] POST /api/process   -> ${N8N_BASE_URL}${N8N_PROCESS_PATH}  (Admin|Submitter)`)
  console.log(`[server] POST /api/review    -> ${N8N_BASE_URL}${N8N_REVIEW_PATH}  (Admin|Submitter)`)
  console.log(`[server] roles assignable through the app: ${ASSIGNABLE_ROLES.join(', ')}`)
})
