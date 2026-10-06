// Review requests: "please look at this document", sent by email to chosen users.
//
// This module only RECORDS requests and sends the emails. It never changes a
// document's status: the client flags the document through the existing
// POST /api/review (the Sheet stays the source of truth) and then creates the
// request here. Email content is built from the document as the Sheet holds it
// (documents.js), never from fields the browser sends.
//
// Nothing here returns or logs an email address, email body, token or password.

import { randomUUID } from 'node:crypto'
import { query, withTransaction } from './db.js'
import { findById, findManyByIds, isPlaceholderEmail } from './users.js'
import { fetchDocumentById } from './documents.js'
import { sendEmail, buildReviewRequestEmail, documentLink } from './email.js'

export const MAX_RECIPIENTS = 20
export const MESSAGE_MAX = 1000
const DUPLICATE_WINDOW_SECONDS = 10
const SEND_CONCURRENCY = 5

function typedError(status, code, message) {
  const e = new Error(message)
  e.status = status
  e.code = code
  return e
}

// ---- shaping ---------------------------------------------------------------

// What leaves the server. Roles are the snapshot taken at request time. A NULL
// user_id means the account was deleted afterwards ("removed"). No emails.
function shapeRequest(r, recipients) {
  return {
    id: r.id,
    documentId: r.document_id,
    fileName: r.file_name,
    requestedBy: { username: r.requested_by_username, removed: r.requested_by_user_id === null },
    message: r.message,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    recipients: recipients.map((x) => ({
      id: x.id,
      username: x.username,
      role: x.role,
      emailStatus: x.email_status,
      emailedAt: x.emailed_at instanceof Date ? x.emailed_at.toISOString() : x.emailed_at,
      removed: x.user_id === null,
    })),
  }
}

async function loadRecipients(requestIds) {
  if (!requestIds.length) return new Map()
  const { rows } = await query(
    `SELECT * FROM review_request_recipients
      WHERE request_id = ANY($1::text[]) ORDER BY lower(username), id`,
    [requestIds],
  )
  const byRequest = new Map()
  for (const row of rows) {
    if (!byRequest.has(row.request_id)) byRequest.set(row.request_id, [])
    byRequest.get(row.request_id).push(row)
  }
  return byRequest
}

async function loadShaped(requestId) {
  const { rows } = await query('SELECT * FROM review_requests WHERE id = $1', [requestId])
  if (!rows[0]) return null
  const recipients = await loadRecipients([requestId])
  return shapeRequest(rows[0], recipients.get(requestId) || [])
}

// ---- sending ---------------------------------------------------------------

// Send one email to each recipient row and record the outcome. Role and pending
// wording come from the user's CURRENT state (a Viewer promoted since still gets
// the right email on a resend). A recipient who is gone or whose address is a
// placeholder is marked 'skipped' and nothing is sent.
async function deliver({ request, recipientRows, doc, contact }) {
  const users = new Map(
    (await findManyByIds(recipientRows.map((r) => r.user_id).filter(Boolean))).map((u) => [u.id, u]),
  )
  const link = documentLink(doc.document_id)

  async function one(row) {
    const user = row.user_id ? users.get(row.user_id) : null
    let status = 'skipped'
    if (user && !isPlaceholderEmail(user.email)) {
      const { subject, html } = buildReviewRequestEmail({
        role: user.role,
        pending: !user.passwordHash,
        requester: { username: request.requested_by_username },
        contact: { username: contact.username },
        message: request.message,
        doc,
        link,
      })
      try {
        await sendEmail({
          to: user.email,
          subject,
          html,
          replyTo: contact.email,
          consoleNote: `review link for "${user.username}" (${user.role}): ${link}`,
        })
        status = 'sent'
      } catch (err) {
        // The code is enough to diagnose; the message could echo request content.
        console.error(`[review] email to "${user.username}" failed: ${err.code || 'EMAIL_FAILED'}`)
        status = 'failed'
      }
    }
    await query(
      `UPDATE review_request_recipients
          SET email_status = $1,
              emailed_at = CASE WHEN $1 = 'sent' THEN now() ELSE emailed_at END,
              email = COALESCE($3, email), role = COALESCE($4, role)
        WHERE id = $2`,
      [status, row.id, user ? user.email : null, user ? user.role : null],
    )
  }

  // A few at a time: 20 sequential sends through n8n would be far too slow.
  for (let i = 0; i < recipientRows.length; i += SEND_CONCURRENCY) {
    await Promise.all(recipientRows.slice(i, i + SEND_CONCURRENCY).map(one))
  }
}

// ---- create ----------------------------------------------------------------

// Shape checks that need no database. Also run before the rate limiter, so a
// request that is going to be rejected anyway does not use up the sender's quota.
export function validateShape(body) {
  const documentId = String(body?.document_id || '').trim()
  if (!documentId) throw typedError(400, 'INVALID_INPUT', 'A document_id is required.')

  if (!Array.isArray(body?.recipient_user_ids)) {
    throw typedError(400, 'INVALID_INPUT', 'recipient_user_ids must be a list.')
  }
  const ids = [...new Set(body.recipient_user_ids.map((x) => String(x)))]
  if (ids.length === 0) throw typedError(400, 'NO_RECIPIENTS', 'Pick at least one recipient.')
  if (ids.length > MAX_RECIPIENTS) {
    throw typedError(400, 'TOO_MANY_RECIPIENTS', `At most ${MAX_RECIPIENTS} recipients per request.`)
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if ([...message].length > MESSAGE_MAX) {
    throw typedError(400, 'MESSAGE_TOO_LONG', `The message can be at most ${MESSAGE_MAX} characters.`)
  }
  return { documentId, ids, message }
}

export async function createReviewRequest(actingUser, body) {
  const { documentId, ids, message } = validateShape(body)

  const requester = await findById(actingUser.id)
  if (!requester) throw typedError(401, 'UNAUTHENTICATED', 'Your account is no longer available.')
  if (isPlaceholderEmail(requester.email)) {
    throw typedError(
      400,
      'REQUESTER_EMAIL_MISSING',
      'Your account has no real email address, so replies could not reach you. Ask an Admin to set it.',
    )
  }

  const recipients = await findManyByIds(ids)
  if (recipients.length !== ids.length) {
    throw typedError(400, 'RECIPIENT_NOT_FOUND', 'One or more recipients no longer exist.')
  }
  if (recipients.some((u) => u.id === requester.id) || recipients.some((u) => isPlaceholderEmail(u.email))) {
    throw typedError(
      400,
      'RECIPIENT_NOT_ELIGIBLE',
      'You cannot pick yourself or a user without a real email address.',
    )
  }

  // The email is built from the Sheet's version of the document.
  const doc = await fetchDocumentById(documentId)

  const requestId = `rr_${randomUUID().slice(0, 12)}`
  const sortedIds = [...ids].sort()
  await withTransaction(async (client) => {
    // Serialises double clicks from the same person on the same document.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`rr:${requester.id}:${doc.document_id}`])
    const dup = await client.query(
      `SELECT r.id
         FROM review_requests r
        WHERE r.requested_by_user_id = $1 AND r.document_id = $2
          AND r.created_at > now() - make_interval(secs => $3)
          AND (SELECT COALESCE(array_agg(x.user_id ORDER BY x.user_id), ARRAY[]::text[])
                 FROM review_request_recipients x WHERE x.request_id = r.id) = $4::text[]`,
      [requester.id, doc.document_id, DUPLICATE_WINDOW_SECONDS, sortedIds],
    )
    if (dup.rows[0]) {
      throw typedError(409, 'DUPLICATE_REQUEST', 'The same request was just sent. Wait a few seconds.')
    }
    await client.query(
      `INSERT INTO review_requests
         (id, document_id, file_name, requested_by_user_id, requested_by_username, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [requestId, doc.document_id, doc.file_name, requester.id, requester.username, message],
    )
    for (const u of recipients) {
      // 'failed' until the send succeeds: a crash mid-send leaves a resendable row.
      await client.query(
        `INSERT INTO review_request_recipients
           (id, request_id, user_id, username, email, role, email_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'failed')`,
        [`rrr_${randomUUID().slice(0, 12)}`, requestId, u.id, u.username, u.email, u.role],
      )
    }
  })

  const { rows } = await query('SELECT * FROM review_requests WHERE id = $1', [requestId])
  const recipientRows = (await loadRecipients([requestId])).get(requestId) || []
  await deliver({ request: rows[0], recipientRows, doc, contact: requester })
  return loadShaped(requestId)
}

// ---- read ------------------------------------------------------------------

export async function listForDocument(documentId) {
  const id = String(documentId || '').trim()
  if (!id) throw typedError(400, 'INVALID_INPUT', 'A document_id is required.')
  const { rows } = await query(
    'SELECT * FROM review_requests WHERE document_id = $1 ORDER BY created_at DESC, id DESC',
    [id],
  )
  const recipients = await loadRecipients(rows.map((r) => r.id))
  return rows.map((r) => shapeRequest(r, recipients.get(r.id) || []))
}

// ---- resend ----------------------------------------------------------------

const resending = new Set() // request ids currently being resent (per process)

export async function resendFailed(actingUser, requestId) {
  if (resending.has(requestId)) {
    throw typedError(409, 'RESEND_IN_PROGRESS', 'This request is already being resent.')
  }
  resending.add(requestId)
  try {
    const { rows } = await query('SELECT * FROM review_requests WHERE id = $1', [requestId])
    const request = rows[0]
    if (!request) throw typedError(404, 'REQUEST_NOT_FOUND', 'No review request with that id.')

    const all = (await loadRecipients([requestId])).get(requestId) || []
    const failed = all.filter((x) => x.email_status === 'failed')
    if (failed.length === 0) {
      throw typedError(409, 'NOTHING_TO_RESEND', 'No recipient is waiting for a resend.')
    }

    // Replies go to the original requester; if that account is gone, to whoever resends.
    const original = request.requested_by_user_id ? await findById(request.requested_by_user_id) : null
    const contact = original && !isPlaceholderEmail(original.email) ? original : await findById(actingUser.id)
    if (!contact || isPlaceholderEmail(contact.email)) {
      throw typedError(
        400,
        'REQUESTER_EMAIL_MISSING',
        'Your account has no real email address, so replies could not reach you. Ask an Admin to set it.',
      )
    }

    const doc = await fetchDocumentById(request.document_id)
    await deliver({ request, recipientRows: failed, doc, contact })
    return await loadShaped(requestId)
  } finally {
    resending.delete(requestId)
  }
}
