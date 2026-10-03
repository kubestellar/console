import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import translations. Only English is bundled eagerly -- it's the
// fallbackLng and must be available synchronously. The other 9 languages
// (40 more JSON files) were previously all statically imported here, which
// inflated the main app-routes chunk by ~2MB of raw JSON. They're now
// lazy-loaded on demand via `ensureLanguageLoaded()` below, either when the
// detected/persisted language isn't English or when the user switches
// languages in the profile menu.
import commonEN from '../locales/en/common.json'
import cardsEN from '../locales/en/cards.json'
import statusEN from '../locales/en/status.json'
import errorsEN from '../locales/en/errors.json'

export const LANGUAGE_STORAGE_KEY = 'i18nextLng'

export const resources = {
  en: {
    common: commonEN,
    cards: cardsEN,
    status: statusEN,
    errors: errorsEN,
  },
} as const

type LazyLoadedLanguage = 'es' | 'fr' | 'de' | 'ja' | 'zh' | 'it' | 'pt' | 'hi' | 'zh-TW'
type NamespaceBundle = Record<(typeof namespaces)[number], object>

// One dynamic import() per locale directory keeps each language in its own
// chunk, fetched only when actually needed.
const LOCALE_LOADERS: Record<Exclude<LazyLoadedLanguage, 'zh-TW'>, () => Promise<NamespaceBundle>> = {
  es: async () => ({
    common: (await import('../locales/es/common.json')).default,
    cards: (await import('../locales/es/cards.json')).default,
    status: (await import('../locales/es/status.json')).default,
    errors: (await import('../locales/es/errors.json')).default,
  }),
  fr: async () => ({
    common: (await import('../locales/fr/common.json')).default,
    cards: (await import('../locales/fr/cards.json')).default,
    status: (await import('../locales/fr/status.json')).default,
    errors: (await import('../locales/fr/errors.json')).default,
  }),
  de: async () => ({
    common: (await import('../locales/de/common.json')).default,
    cards: (await import('../locales/de/cards.json')).default,
    status: (await import('../locales/de/status.json')).default,
    errors: (await import('../locales/de/errors.json')).default,
  }),
  ja: async () => ({
    common: (await import('../locales/ja/common.json')).default,
    cards: (await import('../locales/ja/cards.json')).default,
    status: (await import('../locales/ja/status.json')).default,
    errors: (await import('../locales/ja/errors.json')).default,
  }),
  zh: async () => ({
    common: (await import('../locales/zh/common.json')).default,
    cards: (await import('../locales/zh/cards.json')).default,
    status: (await import('../locales/zh/status.json')).default,
    errors: (await import('../locales/zh/errors.json')).default,
  }),
  it: async () => ({
    common: (await import('../locales/it/common.json')).default,
    cards: (await import('../locales/it/cards.json')).default,
    status: (await import('../locales/it/status.json')).default,
    errors: (await import('../locales/it/errors.json')).default,
  }),
  pt: async () => ({
    common: (await import('../locales/pt/common.json')).default,
    cards: (await import('../locales/pt/cards.json')).default,
    status: (await import('../locales/pt/status.json')).default,
    errors: (await import('../locales/pt/errors.json')).default,
  }),
  hi: async () => ({
    common: (await import('../locales/hi/common.json')).default,
    cards: (await import('../locales/hi/cards.json')).default,
    status: (await import('../locales/hi/status.json')).default,
    errors: (await import('../locales/hi/errors.json')).default,
  }),
}

const loadedLanguages = new Set<string>(['en'])
const inFlightLoads = new Map<string, Promise<void>>()

/**
 * Loads (and registers with i18next) the resource bundle for `lng` the
 * first time it's needed. Safe to call repeatedly -- subsequent calls for
 * an already-loaded language resolve immediately. `zh-TW` shares the `zh`
 * bundle, matching the prior statically-bundled behavior.
 */
export function ensureLanguageLoaded(lng: string): Promise<void> {
  const loaderKey = (lng === 'zh-TW' ? 'zh' : lng) as keyof typeof LOCALE_LOADERS
  if (loadedLanguages.has(lng) || !(loaderKey in LOCALE_LOADERS)) return Promise.resolve()
  const existing = inFlightLoads.get(lng)
  if (existing) return existing
  const promise = LOCALE_LOADERS[loaderKey]().then(bundle => {
    for (const ns of namespaces) {
      i18n.addResourceBundle(lng, ns, bundle[ns], true, true)
    }
    loadedLanguages.add(lng)
  })
  inFlightLoads.set(lng, promise)
  return promise
}

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

// The detector above may resolve a persisted/browser language other than
// English before its bundle has been lazy-loaded; fetch it now so returning
// non-English users don't see an English flash. `i18n.changeLanguage` with
// the already-resolved language still emits 'languageChanged', which
// react-i18next listens for to re-render bound components once the bundle
// lands.
const initialLng = i18n.resolvedLanguage || i18n.language
if (initialLng && initialLng !== 'en') {
  void ensureLanguageLoaded(initialLng).then(() => i18n.changeLanguage(initialLng))
}

export default i18n

// Type-safe translation keys
//
// NOTE: We intentionally do NOT augment `CustomTypeOptions.resources` with
// `typeof resources['en']`. Doing so makes `tsc -b` crash with an internal
// compiler assertion failure (not a normal type error):
//
//   Error: Debug Failure. No error for last overload signature
//     at resolveCall / resolveCallExpression / resolveSignature / ...
//
// This is a known upstream TypeScript bug (microsoft/TypeScript#63195):
// react-i18next's heavily-overloaded `t()` function crashes the overload
// resolver when checked against a `resources` type this large -- our
// `common.json` + `cards.json` combined are ~10,000 lines / 4800+ leaf keys,
// well past the threshold that trips it. Narrowing only the leaf *value*
// types to `string` (instead of removing the augmentation) does not avoid
// the crash, since the blow-up comes from the size of the *key* union, not
// the value types.
//
// Omitting the `resources` augmentation falls back to i18next's default
// (untyped) resource typing, which avoids the crash entirely. This loses
// `t()` key autocompletion/dot-path validation, but is a developer-experience
// trade-off only -- it does not change any runtime translation behavior.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
  }
}
