// Review requests: ask other users to look at a document, by email.
//
// Same session-cookie transport as the auth calls (api/auth.js). The server builds
// the email from the document as the Sheet holds it, so only the document id, the
// recipients and the message are sent.

import { request } from './auth.js'

// Users the signed-in Admin/Submitter can pick. No email addresses are returned.
// -> { users: [ { id, username, role, hasEmail, pending } ] }
export const getUserDirectory = () => request('/auth/users/directory')

// -> { request: { id, documentId, fileName, requestedBy, message, createdAt, recipients: [...] } }
// Each recipient: { id, username, role, emailStatus: 'sent'|'failed'|'skipped', emailedAt, removed }
export const createReviewRequest = ({ documentId, recipientUserIds, message }) =>
  request('/api/review-requests', {
    method: 'POST',
    body: { document_id: documentId, recipient_user_ids: recipientUserIds, message },
  })

// -> { requests: [ ...same shape... ] } newest first. Readable by every signed-in role.
export const listReviewRequests = (documentId) =>
  request(`/api/review-requests?document_id=${encodeURIComponent(documentId)}`)

// Resends only the recipients whose email failed. -> { request }
export const resendReviewRequest = (id) =>
  request(`/api/review-requests/${encodeURIComponent(id)}/resend`, { method: 'POST' })
