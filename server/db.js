// Postgres access for the user store (Neon free tier, via the `pg` package).
//
// Why a database: Render's free tier has no persistent disk, so the old
// server/users.json was wiped on every redeploy and after idle spin-down. Users
// now live in Postgres, which survives both.
//
// Neon notes: the free tier suspends the compute after a few idle minutes, so the
// first connection after a quiet period can be slow or can hit a stale pooled
// socket. The pool is therefore tuned with a generous connect timeout, a short
// idle timeout, and query() retries once on the specific "connection was dead"
// errors (never on statement errors, so a write is not applied twice).

import pg from 'pg'

const { Pool } = pg

let pool = null

function isLocalHost(connectionString) {
  try {
    const { hostname } = new URL(connectionString)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

export function getPool() {
  if (pool) return pool
  const { DATABASE_URL } = process.env
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set.')
  pool = new Pool({
    connectionString: DATABASE_URL,
    // SSL is required by Neon. A plain local Postgres (if ever used) is allowed
    // without it. There is deliberately no other fallback.
    ssl: isLocalHost(DATABASE_URL) ? false : { rejectUnauthorized: true },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  })
  // An idle client dying (Neon suspend, network blip) must not crash the process.
  pool.on('error', (err) => {
    console.error(`[db] idle client error: ${err.message}`)
  })
  return pool
}

// Errors that mean "the socket was dead before the statement ran". Safe to retry
// once on a fresh connection.
function isStaleConnectionError(err) {
  const msg = String(err?.message || '')
  return (
    /Connection terminated/i.test(msg) ||
    /timeout exceeded when trying to connect/i.test(msg) ||
    ['ECONNRESET', 'EPIPE', 'ECONNREFUSED'].includes(err?.code)
  )
}

export async function query(text, params) {
  try {
    return await getPool().query(text, params)
  } catch (err) {
    if (!isStaleConnectionError(err)) throw err
    return getPool().query(text, params)
  }
}

// Run `fn(client)` inside a transaction. No retry: a half-applied transaction
// must surface as an error, not be silently repeated.
export async function withTransaction(fn) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* the original error is the one that matters */
    }
    throw err
  } finally {
    client.release()
  }
}

// Idempotent schema. The advisory lock stops two instances that overlap during a
// redeploy from racing each other through CREATE ... IF NOT EXISTS.
const MIGRATION_LOCK_KEY = 727274

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
     id            text PRIMARY KEY,
     username      text NOT NULL,
     email         text NOT NULL,
     password_hash text,
     role          text NOT NULL CHECK (role IN ('Admin', 'Submitter', 'Viewer')),
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email))`,
  `CREATE TABLE IF NOT EXISTS password_tokens (
     id          text PRIMARY KEY,
     user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash  text NOT NULL UNIQUE,
     purpose     text NOT NULL CHECK (purpose IN ('invite', 'reset')),
     expires_at  timestamptz NOT NULL,
     used_at     timestamptz,
     created_at  timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS password_tokens_user_idx ON password_tokens (user_id)`,
  // Sessions issued before this moment are rejected (see authRequired). NULL means
  // the password was never changed through the app, so every session is accepted.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz`,
  // Review requests: who asked whom to look at which document. The document's own
  // status stays in the Sheet; these tables only record the requests. The users
  // FKs are SET NULL so deleting an account keeps the history (shown as removed).
  `CREATE TABLE IF NOT EXISTS review_requests (
     id                    text PRIMARY KEY,
     document_id           text NOT NULL,
     file_name             text NOT NULL,
     requested_by_user_id  text REFERENCES users(id) ON DELETE SET NULL,
     requested_by_username text NOT NULL,
     message               text NOT NULL DEFAULT '' CHECK (char_length(message) <= 1000),
     created_at            timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS review_requests_document_idx ON review_requests (document_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS review_request_recipients (
     id           text PRIMARY KEY,
     request_id   text NOT NULL REFERENCES review_requests(id) ON DELETE CASCADE,
     user_id      text REFERENCES users(id) ON DELETE SET NULL,
     username     text NOT NULL,
     email        text NOT NULL,
     role         text NOT NULL,
     email_status text NOT NULL CHECK (email_status IN ('sent', 'failed', 'skipped')),
     emailed_at   timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS review_request_recipients_request_idx ON review_request_recipients (request_id)`,
]

export async function migrate() {
  await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY])
    for (const sql of MIGRATIONS) await client.query(sql)
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Connect + migrate, retrying while Neon wakes up. Throws after the last attempt;
// the caller logs and exits. There is no fallback store.
export async function initDb({ attempts = 5, delayMs = 4000 } = {}) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      await migrate()
      return
    } catch (err) {
      lastErr = err
      console.error(`[db] connect/migrate attempt ${i}/${attempts} failed: ${err.message}`)
      if (i < attempts) await sleep(delayMs)
    }
  }
  throw lastErr
}

export async function closeDb() {
  if (pool) {
    await pool.end()
    pool = null
  }
}
