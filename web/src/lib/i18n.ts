import i18n from 'i18next'
import * as ReactI18next from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

const initReactI18next = 'initReactI18next' in ReactI18next
  ? ReactI18next.initReactI18next
  : undefined

// Import translations
import commonEN from '../locales/en/common.json'
import cardsEN from '../locales/en/cards.json'
import statusEN from '../locales/en/status.json'
import errorsEN from '../locales/en/errors.json'

export const resources = {
  en: {
    common: commonEN,
    cards: cardsEN,
    status: statusEN,
    errors: errorsEN,
  },
  // Placeholder for future translations - will fall back to English
  es: {
    common: commonEN,
    cards: cardsEN,
    status: statusEN,
    errors: errorsEN,
  },
  fr: {
    common: commonEN,
    cards: cardsEN,
    status: statusEN,
    errors: errorsEN,
  },
  de: {
    common: commonEN,
    cards: cardsEN,
    status: statusEN,
    errors: errorsEN,
  },
  ja: {
    common: commonEN,
    cards: cardsEN,
    status: statusEN,
    errors: errorsEN,
  },
  zh: {
    common: commonEN,
    cards: cardsEN,
    status: statusEN,
    errors: errorsEN,
  },
  // New languages
  it: {
    common: commonEN,
    cards: cardsEN,
    status: statusEN,
    errors: errorsEN,
  },
  pt: {
    common: commonEN,
    cards: cardsEN,
    status: statusEN,
    errors: errorsEN,
  },
  hi: {
    common: commonEN,
    cards: cardsEN,
    status: statusEN,
    errors: errorsEN,
  },
  'zh-TW': {
    common: commonEN,
    cards: cardsEN,
    status: statusEN,
    errors: errorsEN,
  },
} as const

// Available languages with display names
export const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文 (简体)', flag: '🇨🇳' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
  { code: 'zh-TW', name: '中文 (繁體)', flag: '🇹🇼' },
] as const

// Namespaces for organizing translations
export const defaultNS = 'common'
export const namespaces = ['common', 'cards', 'status', 'errors'] as const

const configuredI18n = i18n.use(LanguageDetector)

if (initReactI18next) {
  configuredI18n.use(initReactI18next)
}

configuredI18n.init({
    resources,
    defaultNS,
    ns: namespaces,
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'fr', 'de', 'ja', 'zh', 'it', 'pt', 'hi', 'zh-TW'],

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    detection: {
      // Auto-detect from browser first, then check localStorage
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },

    react: {
      useSuspense: false, // Disable suspense to avoid loading states
    },
  })

export default i18n

// Type-safe translation keys
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: typeof resources['en']
  }
}
