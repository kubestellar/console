import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import translations
import commonDE from '../locales/de/common.json'
import cardsDE from '../locales/de/cards.json'
import statusDE from '../locales/de/status.json'
import errorsDE from '../locales/de/errors.json'
import commonEN from '../locales/en/common.json'
import cardsEN from '../locales/en/cards.json'
import statusEN from '../locales/en/status.json'
import errorsEN from '../locales/en/errors.json'
import commonES from '../locales/es/common.json'
import cardsES from '../locales/es/cards.json'
import statusES from '../locales/es/status.json'
import errorsES from '../locales/es/errors.json'
import commonFR from '../locales/fr/common.json'
import cardsFR from '../locales/fr/cards.json'
import statusFR from '../locales/fr/status.json'
import errorsFR from '../locales/fr/errors.json'
import commonHI from '../locales/hi/common.json'
import cardsHI from '../locales/hi/cards.json'
import statusHI from '../locales/hi/status.json'
import errorsHI from '../locales/hi/errors.json'
import commonIT from '../locales/it/common.json'
import cardsIT from '../locales/it/cards.json'
import statusIT from '../locales/it/status.json'
import errorsIT from '../locales/it/errors.json'
import commonJA from '../locales/ja/common.json'
import cardsJA from '../locales/ja/cards.json'
import statusJA from '../locales/ja/status.json'
import errorsJA from '../locales/ja/errors.json'
import commonPT from '../locales/pt/common.json'
import cardsPT from '../locales/pt/cards.json'
import statusPT from '../locales/pt/status.json'
import errorsPT from '../locales/pt/errors.json'
import commonZH from '../locales/zh/common.json'
import cardsZH from '../locales/zh/cards.json'
import statusZH from '../locales/zh/status.json'
import errorsZH from '../locales/zh/errors.json'

export const LANGUAGE_STORAGE_KEY = 'i18nextLng'

export const resources = {
  en: {
    common: commonEN,
    cards: cardsEN,
    status: statusEN,
    errors: errorsEN,
  },
  es: {
    common: commonES,
    cards: cardsES,
    status: statusES,
    errors: errorsES,
  },
  fr: {
    common: commonFR,
    cards: cardsFR,
    status: statusFR,
    errors: errorsFR,
  },
  de: {
    common: commonDE,
    cards: cardsDE,
    status: statusDE,
    errors: errorsDE,
  },
  ja: {
    common: commonJA,
    cards: cardsJA,
    status: statusJA,
    errors: errorsJA,
  },
  zh: {
    common: commonZH,
    cards: cardsZH,
    status: statusZH,
    errors: errorsZH,
  },
  it: {
    common: commonIT,
    cards: cardsIT,
    status: statusIT,
    errors: errorsIT,
  },
  pt: {
    common: commonPT,
    cards: cardsPT,
    status: statusPT,
    errors: errorsPT,
  },
  hi: {
    common: commonHI,
    cards: cardsHI,
    status: statusHI,
    errors: errorsHI,
  },
  'zh-TW': {
    common: commonZH,
    cards: cardsZH,
    status: statusZH,
    errors: errorsZH,
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

// Guard against test environments where react-i18next is mocked without
// exporting initReactI18next. Without this check, .use(undefined) throws
// and any test file that imports a component using i18n will "fail to load".
const configuredI18n = i18n.use(LanguageDetector)
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (initReactI18next) {
  configuredI18n.use(initReactI18next)
}
configuredI18n.init({
  resources,
  defaultNS,
  ns: namespaces,
  fallbackLng: 'en',
  supportedLngs: ['en', 'es', 'fr', 'de', 'ja', 'zh', 'it', 'pt', 'hi', 'zh-TW'],
  nonExplicitSupportedLngs: true,

  interpolation: {
    escapeValue: false, // React already escapes values
  },

  detection: {
    // Prefer persisted user choice before browser defaults.
    order: ['localStorage', 'navigator', 'htmlTag'],
    lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    caches: ['localStorage'],
  },

  react: {
    useSuspense: false, // Disable suspense to avoid loading states
  },
})

export default i18n

// Type-safe translation namespaces.
//
// IMPORTANT: `resources` is intentionally typed via a recursive,
// non-literal `LooseTranslationNamespace` shape instead of
// `typeof resources['en']`. Deriving the literal `typeof` type of our
// translation JSON (common.json + cards.json are ~10k lines combined) and
// feeding it into i18next's heavily-overloaded `t()` signature triggers a
// known TypeScript compiler crash once the resource type crosses a certain
// scale: `Error: Debug Failure. No error for last overload signature`
// (see https://github.com/microsoft/TypeScript/issues/63195). This is a
// real internal `tsc` assertion failure, not a type error in our code, and
// it aborts the whole build (`tsc -b`) rather than reporting a diagnostic.
//
// Widening only the leaf *values* to `string` (keeping the full recursive
// key union) still crashes at the same scale, because the crash is driven
// by the size of the derived key/overload space, not the value types. The
// only reliable fix is to stop deriving a large literal type from the JSON
// at all.
//
// `LooseTranslationNamespace` is a self-referential index signature
// (`[key: string]: string | LooseTranslationNamespace`) rather than an
// enumeration of every real key, so it can never trigger the scale-based
// crash regardless of how large the JSON grows. Because it still models
// "an object whose leaves are eventually strings" at arbitrary nesting
// depth, i18next's key-path utilities correctly resolve any `t('a.b.c')`
// call to a `string` return type (so `t(key).toLowerCase()` etc. keep
// working), unlike a flat `Record<string, unknown>` which caused spurious
// `never`/`{}` return types for nested and namespaced (`ns:a.b`) keys.
// Individual key strings passed to `t()` are no longer compile-time
// validated against the real JSON — invalid keys are caught by the
// i18n-compliance lint/test scripts and code review instead.
interface LooseTranslationNamespace {
  [key: string]: string | LooseTranslationNamespace
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: Record<(typeof namespaces)[number], LooseTranslationNamespace>
  }
}
