// Outgoing email, sent through one generic n8n webhook ("Document Assistant -
// Send Email", POST {N8N_BASE_URL}{N8N_EMAIL_PATH}) that holds the Gmail
// credential. This server never talks to Gmail itself.
//
// Mode:
//   n8n      real send through the webhook
//   console  no send; the message (including the link) is logged to THIS server's
//            console only. Used in local dev so the flow is testable without email.
// Default: n8n only when NODE_ENV=production AND N8N_EMAIL_PATH is set, otherwise
// console. EMAIL_MODE=n8n|console overrides that (EMAIL_MODE=n8n with no
// N8N_EMAIL_PATH uses /send-email).
//
// A token or link is never returned to an API caller; it exists only in the email
// body (or, in console mode, the server log).

const {
  N8N_BASE_URL,
  N8N_SECRET,
  N8N_EMAIL_PATH,
  EMAIL_MODE,
  NODE_ENV,
  APP_BASE_URL,
  CLIENT_ORIGIN,
  REQUEST_TIMEOUT_MS = '90000',
} = process.env

const timeoutMs = Number(REQUEST_TIMEOUT_MS) || 90000

export function emailMode() {
  const forced = String(EMAIL_MODE || '').toLowerCase()
  if (forced === 'n8n' || forced === 'console') return forced
  return NODE_ENV === 'production' && N8N_EMAIL_PATH ? 'n8n' : 'console'
}

// Base URL used to build links in emails. APP_BASE_URL wins; otherwise the client
// origin the server already trusts for CORS.
export function appBaseUrl() {
  return String(APP_BASE_URL || CLIENT_ORIGIN || '').replace(/\/+$/, '')
}

export function setPasswordLink(rawToken) {
  return `${appBaseUrl()}/set-password?token=${encodeURIComponent(rawToken)}`
}

function emailError(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

// Send one message. Resolves { mode } or throws an error with .code:
// EMAIL_FAILED (n8n said no), EMAIL_TIMEOUT, EMAIL_UNREACHABLE.
// `consoleNote` is what console mode prints (so the dev can click the link).
export async function sendEmail({ to, subject, html, replyTo, consoleNote }) {
  const mode = emailMode()
  if (mode === 'console') {
    console.log(`[email:console] To: ${to} | Subject: ${subject}`)
    if (consoleNote) console.log(`[email:console] ${consoleNote}`)
    return { mode }
  }

  if (!N8N_BASE_URL || !N8N_SECRET) {
    throw emailError('EMAIL_FAILED', 'Email is not configured on the server.')
  }
  const target = `${N8N_BASE_URL}${N8N_EMAIL_PATH || '/send-email'}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'x-api-key': N8N_SECRET,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ to, subject, html, ...(replyTo ? { replyTo } : {}) }),
      signal: controller.signal,
    })
    if (!res.ok) {
      // Log the status only: the response could echo the message body.
      console.error(`[email] n8n send-email returned HTTP ${res.status}`)
      throw emailError('EMAIL_FAILED', `The email service answered HTTP ${res.status}.`)
    }
    return { mode }
  } catch (err) {
    if (err.code === 'EMAIL_FAILED') throw err
    if (err.name === 'AbortError') {
      throw emailError('EMAIL_TIMEOUT', 'The email service took too long to respond.')
    }
    throw emailError('EMAIL_UNREACHABLE', 'Could not reach the email service.')
  } finally {
    clearTimeout(timer)
  }
}

// ---- templates (English, plain clean HTML, never contain a password) -------

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function layout(title, bodyHtml) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:8px;padding:28px;">
<h2 style="margin:0 0 16px 0;font-size:20px;">${esc(title)}</h2>
${bodyHtml}
<p style="color:#888888;font-size:12px;margin:24px 0 0 0;">Smart Office Document Assistant. If you were not expecting this email you can ignore it; nothing changes until the link is used.</p>
</div></body></html>`
}

function button(link, label) {
  return `<p style="margin:20px 0;"><a href="${esc(link)}" style="display:inline-block;background:#1f4fd8;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:15px;">${esc(label)}</a></p>
<p style="font-size:13px;color:#555555;margin:0;">Or paste this link into your browser:<br><span style="word-break:break-all;">${esc(link)}</span></p>`
}

// purpose: 'invite' | 'reset'
export function buildPasswordEmail({ purpose, username, link, hours }) {
  const appUrl = appBaseUrl()
  if (purpose === 'invite') {
    const subject = 'You have been invited to the Smart Office Document Assistant'
    const html = layout(
      'Set your password',
      `<p>An account has been created for you on the Smart Office Document Assistant.</p>
<p>Your username: <strong>${esc(username)}</strong></p>
<p>Use the button below to choose your password. The link works once and expires in ${hours} hours.</p>
${button(link, 'Set your password')}
<p style="font-size:13px;color:#555555;">The app is at <a href="${esc(appUrl)}">${esc(appUrl)}</a>.</p>`,
    )
    return { subject, html }
  }
  const subject = 'Reset your Smart Office Document Assistant password'
  const html = layout(
    'Reset your password',
    `<p>An administrator started a password reset for your account.</p>
<p>Your username: <strong>${esc(username)}</strong></p>
<p>Use the button below to choose a new password. The link works once and expires in ${hours} hours. Your current password keeps working until you use it.</p>
${button(link, 'Choose a new password')}
<p style="font-size:13px;color:#555555;">The app is at <a href="${esc(appUrl)}">${esc(appUrl)}</a>.</p>`,
  )
  return { subject, html }
}
