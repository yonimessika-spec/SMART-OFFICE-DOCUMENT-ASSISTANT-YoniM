// Thin Express proxy between the browser and the n8n webhooks (SPEC.md §2).
//
// It holds N8N_SECRET and the webhook URLs. The browser never sees the secret.
// There is NO business logic here — this process only forwards requests and
// attaches the x-api-key header. No AI calls, no Google API calls, no urgency
// logic, no reshaping of the payload (SPEC.md §5).
//
// Routes implemented so far:
//   GET /api/documents  ->  {N8N_BASE_URL}{N8N_DOCUMENTS_PATH}
//
// /api/process and /api/review come in later milestones; their n8n paths are
// already in .env.example so the config file won't need restructuring then.
//
// Env is loaded by `node --env-file-if-exists=.env` (see package.json scripts).

import express from 'express'
import cors from 'cors'

const {
  N8N_BASE_URL,
  N8N_DOCUMENTS_PATH,
  N8N_SECRET,
  REQUEST_TIMEOUT_MS = '90000',
  PORT = '3001',
} = process.env

// Fail fast with a readable message if the operator forgot to copy .env.example.
const REQUIRED = { N8N_BASE_URL, N8N_DOCUMENTS_PATH, N8N_SECRET }
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

// --- CORS: permissive — LOCAL DEV ONLY -----------------------------------
// The Vite dev server (http://localhost:5173) is a different origin, so the
// browser needs CORS headers to read responses from this proxy. In a real
// deployment the client is served from the same origin (or behind one reverse
// proxy) and this line should be removed or locked to the real client origin.
app.use(cors())

// GET /api/documents  ->  n8n GET {N8N_BASE_URL}{N8N_DOCUMENTS_PATH}
// Forwards n8n's JSON body and status on success; converts every failure into a
// clean JSON error the client can turn into a sentence (SPEC.md F7).
app.get('/api/documents', async (_req, res) => {
  const target = `${N8N_BASE_URL}${N8N_DOCUMENTS_PATH}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        'x-api-key': N8N_SECRET, // attached server-side; never sent to the browser
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    const raw = await upstream.text()
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return res.status(502).json({
        error: 'The automation service returned a response that was not valid JSON.',
      })
    }

    if (!upstream.ok) {
      // Pass the upstream status through with a clean shape.
      const payload =
        body && typeof body === 'object' ? body : { error: String(body) }
      return res.status(upstream.status).json(payload)
    }

    return res.status(200).json(body)
  } catch (err) {
    if (err.name === 'AbortError') {
      return res
        .status(504)
        .json({ error: 'The automation service took too long to respond.' })
    }
    return res
      .status(502)
      .json({ error: 'Could not reach the automation service.' })
  } finally {
    clearTimeout(timer)
  }
})

// Lightweight liveness check for local dev.
app.get('/health', (_req, res) => res.json({ ok: true }))

app.listen(Number(PORT), () => {
  console.log(`[server] proxy listening on http://localhost:${PORT}`)
  console.log(`[server] GET /api/documents -> ${N8N_BASE_URL}${N8N_DOCUMENTS_PATH}`)
})
