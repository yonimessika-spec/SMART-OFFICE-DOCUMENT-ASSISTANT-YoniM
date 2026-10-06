// Small in-memory rate limiter (no dependency). State lives in this process, so it
// resets on restart and is per instance; that is acceptable for a single Render
// instance and is a speed bump against guessing, not a security boundary on its own
// (passwords are bcrypt-hashed and tokens are 256-bit random).
//
// A limiter is a sliding window of timestamps per key. `key(req)` builds the key,
// so callers can limit by IP, by IP + username, or both with two limiters.

export function rateLimit({ windowMs, max, key, message = 'Too many attempts. Try again later.' }) {
  const hits = new Map() // key -> number[] of timestamps within the window

  // Drop idle keys so the map cannot grow without bound.
  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [k, stamps] of hits) {
      if (!stamps.length || stamps[stamps.length - 1] < cutoff) hits.delete(k)
    }
  }, Math.max(windowMs, 60_000))
  sweep.unref()

  return (req, res, next) => {
    const k = key(req)
    const now = Date.now()
    const stamps = (hits.get(k) || []).filter((t) => t > now - windowMs)
    if (stamps.length >= max) {
      const retryAfter = Math.ceil((stamps[0] + windowMs - now) / 1000)
      res.set('Retry-After', String(Math.max(retryAfter, 1)))
      hits.set(k, stamps)
      return res.status(429).json({ error_code: 'RATE_LIMITED', error: message })
    }
    stamps.push(now)
    hits.set(k, stamps)
    next()
  }
}

// Express's req.ip honours `trust proxy`. Normalise IPv4-mapped IPv6.
export const clientIp = (req) => String(req.ip || 'unknown').replace(/^::ffff:/, '')

// Lowercased, length-capped username from the body, for composite keys.
export const bodyUsername = (req) =>
  String(req.body?.username ?? '').trim().toLowerCase().slice(0, 64)
