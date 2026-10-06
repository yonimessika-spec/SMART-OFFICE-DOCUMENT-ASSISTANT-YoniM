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

// Cookie attributes that must match between setting and clearing the cookie for
// the browser to treat them as the same cookie. `secure` (HTTPS-only) is on only
// in production so local http dev still works; sameSite 'lax' is enough here
// because the only state-changing requests are same-site XHR from our own client
// origin.
function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  }
}

// For res.cookie() — adds the 8h lifetime.
export function sessionCookieOptions() {
  return { ...baseCookieOptions(), maxAge: SESSION_HOURS * 60 * 60 * 1000 }
}

// For res.clearCookie() — same attributes, but NO maxAge/expires: passing those
// to clearCookie is deprecated (ignored in Express 5), and clearCookie sets its
// own past expiry anyway.
export function clearCookieOptions() {
  return baseCookieOptions()
}

export function signSession(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: `${SESSION_HOURS}h` },
  )
}

function unauthenticated(res, message) {
  res.clearCookie(COOKIE_NAME, clearCookieOptions())
  return res.status(401).json({ error_code: 'UNAUTHENTICATED', error: message })
}

// Gate: valid session cookie required. Attaches req.user = { id, username, role }
// with the role taken from the store on THIS request (not from the token).
export async function authRequired(req, res, next) {
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

  let user
  try {
    user = await findById(payload.sub)
  } catch (err) {
    // Database trouble is not the user's session being bad: do not clear the
    // cookie, just tell the client to try again.
    console.error(`[auth] user lookup failed: ${err.message}`)
    return res.status(503).json({
      error_code: 'STORE_UNAVAILABLE',
      error: 'The user database is temporarily unavailable. Please try again.',
    })
  }
  if (!user) {
    return unauthenticated(res, 'Your account is no longer available.')
  }

  // A password set or changed after this session was issued kills the session.
  // Compared in whole seconds because iat has no sub-second part; the fresh session
  // issued by change-password lands in the same second and is therefore accepted.
  // NULL password_changed_at (never changed through the app) accepts every session.
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    return unauthenticated(res, 'Your session has expired. Please sign in again.')
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
