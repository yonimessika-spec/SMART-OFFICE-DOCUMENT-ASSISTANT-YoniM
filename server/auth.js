// Session auth for the proxy (Section 15).
//
// Login issues a JWT that lives ONLY in an httpOnly cookie — never in the
// response body, never in localStorage. Every protected request re-verifies the
// cookie and then re-loads the user from the store, so the role is always read
// fresh: an Admin can change someone's role and it takes effect on that user's
// very next request, with no forced logout.

import jwt from 'jsonwebtoken'
import { findById } from './users.js'

const { JWT_SECRET, NODE_ENV } = process.env
const SESSION_HOURS = 8

export const COOKIE_NAME = 'so_session'

// Cookie flags. `secure` (HTTPS-only) is on only in production, so local http
// dev still works; sameSite 'lax' is enough here because the only state-changing
// requests are same-site XHR from our own client origin.
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  }
}

export function signSession(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: `${SESSION_HOURS}h` },
  )
}

function unauthenticated(res, message) {
  res.clearCookie(COOKIE_NAME, sessionCookieOptions())
  return res.status(401).json({ error_code: 'UNAUTHENTICATED', error: message })
}

// Gate: valid session cookie required. Attaches req.user = { id, username, role }
// with the role taken from the store on THIS request (not from the token).
export function authRequired(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) {
    return res
      .status(401)
      .json({ error_code: 'UNAUTHENTICATED', error: 'Sign in to continue.' })
  }

  let payload
  try {
    payload = jwt.verify(token, JWT_SECRET)
  } catch {
    // expired or tampered
    return unauthenticated(res, 'Your session has expired. Please sign in again.')
  }

  const user = findById(payload.sub)
  if (!user) {
    return unauthenticated(res, 'Your account is no longer available.')
  }

  req.user = { id: user.id, username: user.username, role: user.role }
  next()
}

// Gate: current role must be one of `allowed`. Use AFTER authRequired.
// A logged-in user who lacks the role gets a clear 403, not a silent failure.
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ error_code: 'UNAUTHENTICATED', error: 'Sign in to continue.' })
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error_code: 'FORBIDDEN',
        error: `Your role (${req.user.role}) is not allowed to perform this action.`,
      })
    }
    next()
  }
}
