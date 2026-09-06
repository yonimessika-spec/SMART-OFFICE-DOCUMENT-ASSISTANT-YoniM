// Single entry point for every HTTP call in the app.
//
// Screens and components import from here ONLY — never from mock.js or client.js
// directly — so the mock flags are honoured everywhere.
//
// Each endpoint is switched independently by its own flag in client/.env:
//
//   VITE_USE_MOCK_DOCUMENTS   getDocuments   -> mock.js | client.js
//   VITE_USE_MOCK_PROCESS     processDocument-> mock.js | client.js
//   VITE_USE_MOCK_REVIEW      reviewDocument -> mock.js | client.js
//
// Default for each: mock. Only the exact string "false" selects the real call.

import * as mock from './mock.js'
import * as real from './client.js'

// Vite exposes env vars as strings; treat anything but "false" as "use the mock".
const isMock = (value) => value !== 'false'

export const USE_MOCK_DOCUMENTS = isMock(import.meta.env.VITE_USE_MOCK_DOCUMENTS)
export const USE_MOCK_PROCESS = isMock(import.meta.env.VITE_USE_MOCK_PROCESS)
export const USE_MOCK_REVIEW = isMock(import.meta.env.VITE_USE_MOCK_REVIEW)

export const getDocuments = USE_MOCK_DOCUMENTS ? mock.getDocuments : real.getDocuments
export const processDocument = USE_MOCK_PROCESS ? mock.processDocument : real.processDocument
export const reviewDocument = USE_MOCK_REVIEW ? mock.reviewDocument : real.reviewDocument

if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info(
    `[api] documents=${USE_MOCK_DOCUMENTS ? 'mock' : 'real'} ` +
      `process=${USE_MOCK_PROCESS ? 'mock' : 'real'} ` +
      `review=${USE_MOCK_REVIEW ? 'mock' : 'real'}`,
  )
}
