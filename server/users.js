// User store for login + RBAC, backed by Postgres (see db.js for why).
//
// Table `users`: id, username, email, password_hash (NULL until the user sets a
// password), role, created_at. A user with no password yet is "Pending"; once a
// password exists they are "Active". Status is derived, there is no status column.
//
// Passwords are bcrypt-hashed before they reach the database and never stored,
// logged, or returned in plaintext. `publicUser()` is the ONLY shape that leaves
// this module toward API responses, and it never includes the hash.

import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { query, withTransaction } from './db.js'
import { consumeTokenAndSetPassword } from './tokens.js'

const BCRYPT_ROUNDS = 10

export const ROLES = ['Admin', 'Submitter', 'Viewer']
// An Admin's role is set only by the env seed. Through the app, a user's role can
// only move between these two.
export const ASSIGNABLE_ROLES = ['Submitter', 'Viewer']

// Seeds that have no real email get `<username>@seed.invalid` so a missing env var
// cannot stop a deploy. `.invalid` is a reserved TLD that can never receive mail;
// the UI flags it and the API refuses it for real users.
const PLACEHOLDER_SUFFIX = '.invalid'
export const isPlaceholderEmail = (email) =>
  String(email || '').toLowerCase().endsWith(PLACEHOLDER_SUFFIX)
export const placeholderEmailFor = (username) => `${username}@seed${PLACEHOLDER_SUFFIX}`

// typed errors: index.js reads .status / .code to build the HTTP response
function httpError(status, code, message) {
  const e = new Error(message)
  e.status = status
  e.code = code
  return e
}
const badRequest = (m, code = 'INVALID_INPUT') => httpError(400, code, m)
const usernameTaken = () => httpError(409, 'USERNAME_TAKEN', 'A user with that username already exists.')
const emailTaken = () => httpError(409, 'EMAIL_TAKEN', 'A user with that email already exists.')
const userNotFound = () => httpError(404, 'USER_NOT_FOUND', 'No user with that id.')
const forbidden = (m) => httpError(403, 'FORBIDDEN', m)
const conflict = (code, m) => httpError(409, code, m)

// Turn a Postgres unique violation into the matching typed error.
function mapDbError(err) {
  if (err?.code === '23505') {
    if (String(err.constraint).includes('username')) return usernameTaken()
    if (String(err.constraint).includes('email')) return emailTaken()
  }
  return err
}

function rowToUser(r) {
  if (!r) return null
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    passwordHash: r.password_hash,
    passwordChangedAt: r.password_changed_at,
    role: r.role,
    createdAt: r.created_at,
  }
}

// The only user shape that leaves this module: no passwordHash, ever.
export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    status: u.passwordHash ? 'Active' : 'Pending',
    emailIsPlaceholder: isPlaceholderEmail(u.email),
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
  }
}

// ---- validation ------------------------------------------------------------

function validateUsername(name) {
  if (!name) throw badRequest('A username is required.')
  if (!/^[\w.\-@ ]{2,64}$/.test(name)) {
    throw badRequest('Username must be 2 to 64 characters: letters, digits, and . - _ @ space.')
  }
}

// `allowPlaceholder` is true only for env seeds.
function normalizeEmail(raw, { allowPlaceholder = false } = {}) {
  const email = String(raw || '').trim()
  if (!email) throw badRequest('An email address is required.', 'INVALID_EMAIL')
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw badRequest('Enter a valid email address.', 'INVALID_EMAIL')
  }
  if (!allowPlaceholder && isPlaceholderEmail(email)) {
    throw badRequest('Enter a real email address.', 'INVALID_EMAIL')
  }
  return email
}

// bcrypt only reads the first 72 bytes, so refuse longer passwords instead of
// silently truncating them.
export function validateNewPassword(password) {
  const pw = typeof password === 'string' ? password : ''
  if (pw.length < 8) throw badRequest('Password must be at least 8 characters.', 'PASSWORD_TOO_SHORT')
  if (Buffer.byteLength(pw, 'utf8') > 72) {
    throw badRequest('Password must be at most 72 bytes.', 'PASSWORD_TOO_LONG')
  }
}

// ---- reads -----------------------------------------------------------------

export async function listUsers() {
  const { rows } = await query('SELECT * FROM users ORDER BY created_at, username')
  return rows.map((r) => publicUser(rowToUser(r)))
}

export async function findById(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [String(id || '')])
  return rowToUser(rows[0])
}

export async function findByUsername(username) {
  const key = String(username || '').trim()
  if (!key) return null
  const { rows } = await query('SELECT * FROM users WHERE lower(username) = lower($1)', [key])
  return rowToUser(rows[0])
}

export async function countUsers() {
  const { rows } = await query('SELECT count(*)::int AS n FROM users')
  return rows[0].n
}

export async function countAdmins() {
  const { rows } = await query("SELECT count(*)::int AS n FROM users WHERE role = 'Admin'")
  return rows[0].n
}

// Users whose email is still a seed placeholder (drives the boot warning).
export async function listPlaceholderEmailUsers() {
  const { rows } = await query(
    "SELECT username, role FROM users WHERE lower(email) LIKE '%.invalid' ORDER BY created_at",
  )
  return rows
}

// A fixed hash to compare against when the user does not exist or has no password
// yet, so a login attempt costs the same either way.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_ROUNDS)

export async function verifyPassword(user, password) {
  const hash = user?.passwordHash || DUMMY_HASH
  const ok = await bcrypt.compare(String(password ?? ''), hash)
  return Boolean(user?.passwordHash) && ok
}

// ---- writes ----------------------------------------------------------------

// Admin-created user: no password yet (Pending); they set one via the invite link.
export async function createPendingUser({ username, email, role }) {
  const name = String(username || '').trim()
  validateUsername(name)
  const mail = normalizeEmail(email)
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw badRequest(`Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`)
  }
  try {
    const { rows } = await query(
      `INSERT INTO users (id, username, email, password_hash, role)
       VALUES ($1, $2, $3, NULL, $4) RETURNING *`,
      [`u_${randomUUID().slice(0, 8)}`, name, mail, role],
    )
    return rowToUser(rows[0])
  } catch (err) {
    throw mapDbError(err)
  }
}

// Env-seeded user: has a password from the start (Active), any role.
async function insertSeedUser({ username, email, password, role }, client = null) {
  const name = String(username || '').trim()
  validateUsername(name)
  if (!password || String(password).length < 8) {
    throw badRequest('Seed passwords must be at least 8 characters.')
  }
  const mail = email ? normalizeEmail(email, { allowPlaceholder: true }) : placeholderEmailFor(name)
  const hash = await bcrypt.hash(String(password), BCRYPT_ROUNDS)
  const run = client ? client.query.bind(client) : query
  const { rows } = await run(
    `INSERT INTO users (id, username, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [`u_${randomUUID().slice(0, 8)}`, name, mail, hash, role],
  )
  return rowToUser(rows[0])
}

// All guarded mutations lock the whole (tiny) users table first, so two admins
// acting at once cannot race past the "last Admin" rule.
async function lockUsers(client) {
  const { rows } = await client.query('SELECT * FROM users FOR UPDATE')
  return rows.map(rowToUser)
}

export async function deleteUser(id, actingUserId) {
  await withTransaction(async (client) => {
    const all = await lockUsers(client)
    const target = all.find((u) => u.id === id)
    if (!target) throw userNotFound()
    if (id === actingUserId) throw forbidden('You cannot remove your own account.')
    if (target.role === 'Admin' && all.filter((u) => u.role === 'Admin').length <= 1) {
      throw forbidden('This is the last Admin account. It cannot be removed.')
    }
    await client.query('DELETE FROM users WHERE id = $1', [id])
  })
}

// Edit a user's role and/or email. Blocked cases, all explicit:
//   - target does not exist                  -> 404
//   - role change on yourself                -> 403 (no self-demotion / promotion)
//   - role change on an Admin                -> 403 (Admin is env-seeded only)
//   - requested role is not Submitter/Viewer -> 400
// Email can be edited on anyone, including yourself (needed to replace a seed
// placeholder). Returns what changed so the caller can re-send an invite when a
// still-pending user's address changes.
export async function updateUser(id, { role, email }, actingUserId) {
  return withTransaction(async (client) => {
    const all = await lockUsers(client)
    const target = all.find((u) => u.id === id)
    if (!target) throw userNotFound()

    let nextRole = target.role
    if (role !== undefined && role !== target.role) {
      if (id === actingUserId) throw forbidden('You cannot change your own role.')
      if (target.role === 'Admin') throw forbidden("An Admin's role can't be changed from here.")
      if (!ASSIGNABLE_ROLES.includes(role)) {
        throw badRequest(`Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`)
      }
      nextRole = role
    }

    let nextEmail = target.email
    if (email !== undefined) nextEmail = normalizeEmail(email)
    const emailChanged = nextEmail.toLowerCase() !== target.email.toLowerCase()

    try {
      const { rows } = await client.query(
        'UPDATE users SET role = $1, email = $2 WHERE id = $3 RETURNING *',
        [nextRole, nextEmail, id],
      )
      return { user: rowToUser(rows[0]), emailChanged, wasPending: !target.passwordHash }
    } catch (err) {
      throw mapDbError(err)
    }
  })
}

// Pending-only / active-only guards for the two email actions.
export async function requirePending(id) {
  const user = await findById(id)
  if (!user) throw userNotFound()
  if (user.passwordHash) {
    throw conflict('USER_NOT_PENDING', 'This user already has a password. Use Reset password instead.')
  }
  return user
}

export async function requireActiveForReset(id, actingUserId) {
  const user = await findById(id)
  if (!user) throw userNotFound()
  if (id === actingUserId) {
    throw forbidden('Use Change password for your own account.')
  }
  if (!user.passwordHash) {
    throw conflict('USER_PENDING', 'This user has not set a password yet. Use Resend invite instead.')
  }
  return user
}

// Complete an invite or reset: validate the password, hash it, then atomically
// spend the token and store the hash. Returns null for any unusable token so the
// caller can answer with one generic message.
export async function completePasswordSet(rawToken, newPassword) {
  validateNewPassword(newPassword)
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  return consumeTokenAndSetPassword(rawToken, hash)
}

// Signed-in user changes their own password. Returns the updated user so the caller
// can issue a fresh session (every older session is invalidated by the new
// password_changed_at).
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await findById(userId)
  if (!user) throw userNotFound()
  const ok = await verifyPassword(user, currentPassword)
  if (!ok) throw httpError(400, 'WRONG_CURRENT_PASSWORD', 'Your current password is not correct.')
  validateNewPassword(newPassword)
  if (newPassword === currentPassword) {
    throw badRequest('Choose a password different from the current one.', 'PASSWORD_UNCHANGED')
  }
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await query('UPDATE users SET password_hash = $1, password_changed_at = $2 WHERE id = $3', [
    hash,
    new Date(),
    userId,
  ])
  return findById(userId)
}

// ---- boot seeding ----------------------------------------------------------

// Run once at boot, after migrations.
//   - Table EMPTY  -> create every configured seed (Admin first), all Active.
//                     They are ordinary rows from then on: an Admin who deletes
//                     one will NOT see it come back, because this only runs on an
//                     empty table.
//   - Table has users but NO Admin -> recovery: re-create the env Admin (or, if
//                     that username is already taken by a non-Admin, promote it
//                     and reset its password to the env value).
// Returns { seeded: [usernames], recovered: boolean, problem?: string }.
export async function seedOnBoot({ admin, others }) {
  const result = { seeded: [], recovered: false }
  const total = await countUsers()
  const adminConfigured = Boolean(admin?.username && admin?.password)

  if (total === 0) {
    if (!adminConfigured) {
      throw new Error(
        'The users table is empty and SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD are not set. ' +
          'Cannot create the initial Admin. Set them and restart.',
      )
    }
    try {
      for (const seed of [{ ...admin, role: 'Admin' }, ...others]) {
        if (!seed.username || !seed.password) continue
        const created = await insertSeedUser(seed)
        result.seeded.push(created.username)
      }
    } catch (err) {
      // Two instances booting at once on an empty table: the loser hits a unique
      // violation. That just means the other one seeded; carry on.
      if (err?.code !== '23505') throw err
    }
    return result
  }

  if ((await countAdmins()) === 0) {
    if (!adminConfigured) {
      result.problem =
        'There is no Admin in the database and SEED_ADMIN_* is not set, so none can be restored.'
      return result
    }
    const existing = await findByUsername(admin.username)
    if (existing) {
      const hash = await bcrypt.hash(String(admin.password), BCRYPT_ROUNDS)
      await query(
        "UPDATE users SET role = 'Admin', password_hash = $1, password_changed_at = $2 WHERE id = $3",
        [hash, new Date(), existing.id],
      )
    } else {
      await insertSeedUser({ ...admin, role: 'Admin' })
    }
    result.recovered = true
    result.seeded.push(admin.username)
  }
  return result
}
