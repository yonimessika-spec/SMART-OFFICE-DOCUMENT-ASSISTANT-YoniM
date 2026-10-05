// One-time password tokens (account invites and admin-triggered resets).
//
// Only a SHA-256 hash of each token is stored, never the raw value, so a database
// leak does not hand out usable links. The raw token exists only in the email
// (or, in dev, the server console). Tokens are 32 random bytes, single use, and
// expire. Looking a token up is an equality match on its hash inside Postgres;
// the hash of a 256-bit random value gives an attacker nothing to time-attack, so
// there is no application-level string compare to make constant-time.

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { query, withTransaction } from './db.js'

export const TOKEN_TTL_HOURS = 48

export function newRawToken() {
  return randomBytes(32).toString('base64url')
}

export function hashToken(raw) {
  return createHash('sha256').update(String(raw)).digest('hex')
}

// A raw token from a URL can be anything; reject obviously wrong shapes before
// they reach the database.
function looksLikeToken(raw) {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{20,128}$/.test(raw)
}

// Create a fresh token for `userId`. Any older unused token for that user (invite
// or reset) is invalidated in the same transaction, so only the newest link works.
export async function issueToken(userId, purpose, hours = TOKEN_TTL_HOURS) {
  const raw = newRawToken()
  const expiresAt = await withTransaction(async (client) => {
    await client.query(
      'UPDATE password_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [userId],
    )
    const { rows } = await client.query(
      `INSERT INTO password_tokens (id, user_id, token_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))
       RETURNING expires_at`,
      [`t_${randomUUID()}`, userId, hashToken(raw), purpose, hours],
    )
    return rows[0].expires_at
  })
  return { token: raw, expiresAt, hours }
}

// Read-only check used by the set-password page: is this token still usable?
export async function peekToken(raw) {
  if (!looksLikeToken(raw)) return null
  const { rows } = await query(
    `SELECT t.purpose, u.id AS user_id, u.username
       FROM password_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()`,
    [hashToken(raw)],
  )
  if (!rows[0]) return null
  return { purpose: rows[0].purpose, userId: rows[0].user_id, username: rows[0].username }
}

// Atomically spend the token and store the new password hash. The UPDATE ... WHERE
// used_at IS NULL means two simultaneous requests cannot both succeed. Returns
// null when the token is unusable (unknown, expired, or already used).
export async function consumeTokenAndSetPassword(raw, passwordHash) {
  if (!looksLikeToken(raw)) return null
  return withTransaction(async (client) => {
    const spent = await client.query(
      `UPDATE password_tokens SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id, purpose`,
      [hashToken(raw)],
    )
    if (!spent.rows[0]) return null
    const { user_id: userId, purpose } = spent.rows[0]
    // The timestamp comes from this process's clock, the same clock that stamps
    // a session's iat, so a fresh session is never judged against a skewed DB clock.
    await client.query(
      'UPDATE users SET password_hash = $1, password_changed_at = $2 WHERE id = $3',
      [passwordHash, new Date(), userId],
    )
    // The password is set; any other outstanding link for this user is now moot.
    await client.query(
      'UPDATE password_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [userId],
    )
    return { userId, purpose }
  })
}
