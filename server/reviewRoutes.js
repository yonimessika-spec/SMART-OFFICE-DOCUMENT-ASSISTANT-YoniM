// Routes for review requests, mounted at /api/review-requests (see index.js).
//
//   POST /                 create a request and email the recipients   Admin | Submitter
//   GET  /?document_id=    requests for one document (no emails)        any signed-in role
//   POST /:id/resend       resend the failed recipients only            Admin | Submitter
//
// Creating a request never changes the document's status: the client flags the
// document through POST /api/review first.

import express from 'express'
import { authRequired, requireRole } from './auth.js'
import { rateLimit } from './rateLimit.js'
import { createReviewRequest, listForDocument, resendFailed, validateShape } from './reviewRequests.js'

const router = express.Router()
const jsonBody = express.json({ limit: '20kb' })
const writers = [authRequired, requireRole('Admin', 'Submitter')]

const TEN_MIN = 10 * 60 * 1000
const createLimit = rateLimit({
  windowMs: TEN_MIN,
  max: 10,
  key: (req) => `rr-create:${req.user?.id}`,
  message: 'Too many review requests. Wait a few minutes and try again.',
})
const resendLimit = rateLimit({
  windowMs: TEN_MIN,
  max: 20,
  key: (req) => `rr-resend:${req.user?.id}`,
  message: 'Too many resend attempts. Wait a few minutes and try again.',
})

function sendError(res, err) {
  const status = err.status || 500
  if (status >= 500 && !err.code) console.error('[review] request error:', err.message)
  return res.status(status).json({
    error_code: err.code || 'SERVER_ERROR',
    error: status >= 500 && !err.code ? 'Something went wrong on the server.' : err.message,
  })
}

// Malformed requests are answered before the rate limiter, so they cost no quota.
function shapeOk(req, res, next) {
  try {
    validateShape(req.body || {})
    return next()
  } catch (err) {
    return sendError(res, err)
  }
}

router.post('/', writers, jsonBody, shapeOk, createLimit, async (req, res) => {
  try {
    const request = await createReviewRequest(req.user, req.body || {})
    return res.status(201).json({ request })
  } catch (err) {
    return sendError(res, err)
  }
})

router.get('/', authRequired, async (req, res) => {
  try {
    return res.json({ requests: await listForDocument(req.query.document_id) })
  } catch (err) {
    return sendError(res, err)
  }
})

router.post('/:id/resend', writers, resendLimit, async (req, res) => {
  try {
    return res.json({ request: await resendFailed(req.user, req.params.id) })
  } catch (err) {
    return sendError(res, err)
  }
})

export default router
