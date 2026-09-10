import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import he from './locales/he.json'

export const SUPPORTED_LANGS = ['en', 'he']

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGS,
    nonExplicitSupportedLngs: true, // he-IL -> he
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'lang',
    },
  })

// Keep the document root <html dir/lang> in sync with the active language so
// RTL, font fallback and screen readers all follow the UI language. i18next's
// dir() already knows Hebrew (and Arabic, Farsi, …) are RTL.
function applyDocumentDir(lng) {
  const resolved = lng || i18n.resolvedLanguage || 'en'
  document.documentElement.setAttribute('dir', i18n.dir(resolved))
  document.documentElement.setAttribute('lang', resolved)
  const title = i18n.t('app.title')
  if (title) document.title = title
}

applyDocumentDir(i18n.resolvedLanguage)
i18n.on('languageChanged', applyDocumentDir)

export default i18n
