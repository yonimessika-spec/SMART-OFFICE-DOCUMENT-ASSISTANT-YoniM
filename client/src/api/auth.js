// Auth + user-management calls to the Express proxy.
//
// The session lives in an httpOnly cookie the browser attaches automatically —
// this module never sees or stores a token. Every request sends credentials so
// the cookie rides along cross-origin from the Vite dev server.

import { notifySessionExpired } from './session.js'

const BASE = import.meta.env.VITE_SERVER_BASE_URL || ''

export async function request(path, { method = 'GET', body } = {}) {
 
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (cause) {
    throw new Error(`Could not reach the server at ${BASE}. Is it running?`, { cause })
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    // A 401 on anything other than the login attempt or the silent "am I logged
    // in?" probe means a live session just died — tell the auth context so the
    // app drops back to the login screen instead of showing a raw error.
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') {
      notifySessionExpired()
    }
    const err = new Error(data?.error || `Request failed (${res.status}).`)
    err.status = res.status
    err.code = data?.error_code
    throw err
  }

  return data
}

export const login = (username, password) =>
  request('/auth/login', { method: 'POST', body: { username, password } })

export const logout = () => request('/auth/logout', { method: 'POST' })

// Resolves to { user } when signed in; throws (status 401) when not.
export const fetchMe = () => request('/auth/me')

// --- Admin-only user management ---
export const listUsers = () => request('/auth/users')

// Resolves { user, email } where email is { status: 'sent' | 'logged' | 'failed', code?, message? }.
// The user is created Pending and gets an invite link; no password is chosen here.
export const createUser = ({ username, email, role }) =>
  request('/auth/users', { method: 'POST', body: { username, email, role } })

export const setUserRole = (id, role) =>
  request(`/auth/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: { role } })

// Resolves { user, email? }; `email` is present when a pending user's address
// changed and a fresh invite was sent to it.
export const setUserEmail = (id, email) =>
  request(`/auth/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: { email } })

export const resendInvite = (id) =>
  request(`/auth/users/${encodeURIComponent(id)}/resend-invite`, { method: 'POST' })

export const resetUserPassword = (id) =>
  request(`/auth/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST' })

export const deleteUser = (id) =>
  request(`/auth/users/${encodeURIComponent(id)}`, { method: 'DELETE' })

// --- Public: set a password from an emailed link ---
export const validateSetPasswordToken = (token) =>
  request(`/auth/set-password/validate?token=${encodeURIComponent(token)}`)

export const setPassword = (token, password) =>
  request('/auth/set-password', { method: 'POST', body: { token, password } })

// --- Signed-in user changes their own password ---
export const changePassword = (currentPassword, newPassword) =>
  request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } })
