import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getDocuments } from './api/index.js'

// Small in-memory store for the document list. Loads once from the API layer
// (mock or real, per VITE_USE_MOCK) and lets screens read/refresh it and apply
// local updates after a successful review (SPEC.md F6: "updates local state on
// success"). No persistence — n8n / the Sheet remain the source of truth.

const DocumentsContext = createContext(null)

export function DocumentsProvider({ children }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDocuments(await getDocuments())
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Merge a successful /process result into the list as a document row.
  const upsertProcessed = useCallback((result) => {
    const row = {
      document_id: result.document_id,
      received_at: result.received_at,
      file_name: result.file_name,
      file_link: result.file_link,
      ...result.fields,
      status: 'Processed',
    }
    setDocuments((prev) => {
      const rest = prev.filter((d) => d.document_id !== row.document_id)
      return [row, ...rest]
    })
    return row
  }, [])

  // Apply a review locally after /api/review returns { status: "updated" }.
  const applyReview = useCallback((documentId, { status, review_note, reviewed_by }) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.document_id === documentId
          ? { ...d, status, review_note: review_note || '', reviewed_by: reviewed_by || '' }
          : d,
      ),
    )
  }, [])

  // Flip a document back to unreviewed after a successful reopen call
  // (/api/review with status "Processed"). Same local state shape as a review;
  // the backend has already cleared reviewed_by / review_note server-side.
  const reopenDocument = useCallback(
    (documentId) =>
      applyReview(documentId, { status: 'Processed', review_note: '', reviewed_by: '' }),
    [applyReview],
  )

  const value = {
    documents,
    loading,
    error,
    refresh,
    upsertProcessed,
    applyReview,
    reopenDocument,
  }
  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>
}

export function useDocuments() {
  const ctx = useContext(DocumentsContext)
  if (!ctx) throw new Error('useDocuments must be used inside <DocumentsProvider>')
  return ctx
}
