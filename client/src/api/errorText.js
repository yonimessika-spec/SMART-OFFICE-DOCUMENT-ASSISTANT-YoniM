// One translated sentence for a failed auth/user call. Uses errors.<error_code>
// when the UI has a translation for it, otherwise the generic message. The server's
// own English text is deliberately not shown, so the UI language always wins.
export function errorText(t, err) {
  const code = err?.code
  if (code) {
    const key = `errors.${code}`
    const text = t(key, { defaultValue: '' })
    if (text) return text
  }
  return t('errors.generic')
}
