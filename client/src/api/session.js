// Tiny bridge so the plain-fetch API layer can tell the React auth context that
// the session is gone (any 401 on a call that isn't login / the initial /auth/me
// probe). AuthProvider registers a handler that clears the user, which flips the
// router to the login screen.

let handler = () => {}

export function setSessionExpiredHandler(fn) {
  handler = typeof fn === 'function' ? fn : () => {}
}

export function notifySessionExpired() {
  handler()
}
