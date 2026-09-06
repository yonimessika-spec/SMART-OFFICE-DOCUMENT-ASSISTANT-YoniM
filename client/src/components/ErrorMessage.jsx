import { ERROR_MESSAGES, GENERIC_ERROR } from '../constants.js'

// Turns any failure into one plain-language sentence (SPEC.md F7).
// Accepts either an error_code string (CONTRACT.md §3) or an Error object.
export function messageFor(errorOrCode) {
  if (typeof errorOrCode === 'string') {
    return ERROR_MESSAGES[errorOrCode] || GENERIC_ERROR
  }
  if (errorOrCode && errorOrCode.status === 404) {
    return 'That document could not be found on the server.'
  }
  return GENERIC_ERROR
}

export default function ErrorMessage({ code, error, onRetry }) {
  return (
    <div className="error-message" role="alert">
      <p>{messageFor(code ?? error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
