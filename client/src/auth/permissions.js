// What each role may do. The server enforces the same rules — this table only
// drives which controls are shown/enabled in the UI (client-side hiding is
// convenience, never the security boundary).
//
// - Admin:     everything, plus user management
// - Submitter: every document action the app has (upload, review, flag, notes)
// - Viewer:    read-only — Dashboard, Archive, detail, search/filter, CSV export

export const ROLES = ['Admin', 'Submitter', 'Viewer']

// Roles an Admin can assign through the user-management screen. An account's
// Admin role is set only by the server seed or by editing server/users.json —
// it can't be granted or removed from the UI (mirrors the proxy).
export const ASSIGNABLE_ROLES = ['Submitter', 'Viewer']

const CAPABILITIES = {
  Admin: { upload: true, review: true, manageUsers: true },
  Submitter: { upload: true, review: true, manageUsers: false },
  Viewer: { upload: false, review: false, manageUsers: false },
}

// action: 'upload' | 'review' | 'manageUsers'
export function can(role, action) {
  return Boolean(CAPABILITIES[role]?.[action])
}
