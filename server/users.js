// Local user store for login + RBAC (Section 15).
//
// Why a local JSON file and not Google Sheets: the proxy is a thin,
// single-instance layer and the user list is tiny (a handful of people). n8n —
// not this process — owns the Google integration; adding Google API credentials
// here purely for a user table would roughly double the proxy's auth surface and
// add latency to every login. So the proxy keeps its own small identity store,
// separate from n8n's document store.
//
// File: server/users.json (git-ignored). Shape:
//   { "users": [ { id, username, passwordHash, role, createdAt } ] }
// Passwords are bcrypt-hashed on the way in and never stored or returned in
// plaintext. `publicUser()` is the ONLY shape that leaves this module.

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STORE_PATH = path.join(HERE, 'users.json')
const BCRYPT_ROUNDS = 10

export const ROLES = ['Admin', 'Submitter', 'Viewer']
// An Admin's role is set only by the seed or by editing users.json directly.
// Through the app, a user's role can only move between these two.
export const ASSIGNABLE_ROLES = ['Submitter', 'Viewer']

// In-memory copy of the store + a promise chain that serialises disk writes so
// two near-simultaneous mutations can't interleave a half-written file.
let cache = null
let writeChain = Promise.resolve()

function readStore() {
  if (!existsSync(STORE_PATH)) return { users: [] }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8'))
  } catch (err) {
    throw new Error(`server/users.json exists but is not valid JSON: ${err.message}`)
  }
  if (!parsed || !Array.isArray(parsed.users)) return { users: [] }
  return parsed
}

function load() {
  if (!cache) cache = readStore()
  return cache
}

// Atomic write: temp file in the same directory, then rename over the target.
function persist() {
  const snapshot = JSON.stringify(load(), null, 2) + '\n'
  writeChain = writeChain.then(() => {
    const tmp = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmp, snapshot, 'utf8')
    renameSync(tmp, STORE_PATH)
  })
  return writeChain
}

// typed errors — index.js reads .status / .code to build the HTTP response
function httpError(status, code, message) {
  const e = new Error(message)
  e.status = status
  e.code = code
  return e
}
const badRequest = (m) => httpError(400, 'INVALID_INPUT', m)
const usernameTaken = (m) => httpError(409, 'USERNAME_TAKEN', m)
const userNotFound = (m) => httpError(404, 'USER_NOT_FOUND', m)
const forbidden = (m) => httpError(403, 'FORBIDDEN', m)

// The only user shape that leaves this module — no passwordHash, ever.
export function publicUser(u) {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt }
}

export function listUsers() {
  return load().users.map(publicUser)
}

export function findById(id) {
  return load().users.find((u) => u.id === id) || null
}

export function findByUsername(username) {
  const key = String(username || '').trim().toLowerCase()
  if (!key) return null
  return load().users.find((u) => u.username.toLowerCase() === key) || null
}

export function countAdmins() {
  return load().users.filter((u) => u.role === 'Admin').length
}

export function verifyPassword(user, password) {
  if (!user || !password) return Promise.resolve(false)
  return bcrypt.compare(String(password), user.passwordHash)
}

function validateUsername(name) {
  if (!name) throw badRequest('A username is required.')
  if (!/^[\w.\-@ ]{2,64}$/.test(name)) {
    throw badRequest('Username must be 2–64 characters: letters, digits, and . - _ @ space.')
  }
}

function validatePassword(password) {
  if (!password || String(password).length < 8) {
    throw badRequest('Password must be at least 8 characters.')
  }
}

export async function createUser({ username, password, role }) {
  const name = String(username || '').trim()
  validateUsername(name)
  if (findByUsername(name)) throw usernameTaken('A user with that username already exists.')
  validatePassword(password)
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw badRequest(`Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`)
  }
  const user = {
    id: `u_${randomUUID().slice(0, 8)}`,
    username: name,
    passwordHash: await bcrypt.hash(String(password), BCRYPT_ROUNDS),
    role,
    createdAt: new Date().toISOString(),
  }
  load().users.push(user)
  await persist()
  return publicUser(user)
}

export async function deleteUser(id, actingUserId) {
  const users = load().users
  const idx = users.findIndex((u) => u.id === id)
  if (idx === -1) throw userNotFound('No user with that id.')
  if (id === actingUserId) throw forbidden('You cannot remove your own account.')
  if (users[idx].role === 'Admin' && countAdmins() <= 1) {
    throw forbidden('This is the last Admin account — it cannot be removed.')
  }
  users.splice(idx, 1)
  await persist()
}

// Change a user's role. Blocked cases, all explicit:
//   - target does not exist               -> 404
//   - target is yourself                  -> 403 (no self-demotion / self-promotion)
//   - target is currently an Admin        -> 403 (Admins are managed via users.json)
//   - requested role is not Submitter/Viewer -> 400
export async function setRole(id, role, actingUserId) {
  const user = findById(id)
  if (!user) throw userNotFound('No user with that id.')
  if (id === actingUserId) throw forbidden('You cannot change your own role.')
  if (user.role === 'Admin') throw forbidden("An Admin's role can't be changed from here.")
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw badRequest(`Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`)
  }
  user.role = role
  await persist()
  return publicUser(user)
}

// First-boot seed: create exactly one Admin when the store has no users.
// Returns a short status string for the boot log. Throws (halts startup) if the
// store is empty AND no seed credentials are configured — otherwise there would
// be no way to sign in.
export async function seedAdminIfEmpty({ username, password }) {
  const store = load()
  if (store.users.length > 0) {
    return `users.json has ${store.users.length} user(s) — seed skipped`
  }
  const name = String(username || '').trim()
  if (!name || !password) {
    throw new Error(
      'server/users.json has no users and SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD ' +
        'are not set — cannot create the initial Admin. Add them to server/.env and restart.',
    )
  }
  validateUsername(name)
  validatePassword(password)
  store.users.push({
    id: `u_${randomUUID().slice(0, 8)}`,
    username: name,
    passwordHash: await bcrypt.hash(String(password), BCRYPT_ROUNDS),
    role: 'Admin',
    createdAt: new Date().toISOString(),
  })
  await persist()
  return `seeded initial Admin "${name}"`
}
