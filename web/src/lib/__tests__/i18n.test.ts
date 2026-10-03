import { describe, it, expect } from 'vitest'
import { resources, languages, defaultNS, namespaces, ensureLanguageLoaded } from '../i18n'
import i18n from '../i18n'

describe('i18n', () => {
  describe('resources', () => {
    it('has English as a resource language', () => {
      expect(resources.en).toBeDefined()
    })

    it('has all four namespaces in English resources', () => {
      expect(resources.en.common).toBeDefined()
      expect(resources.en.cards).toBeDefined()
      expect(resources.en.status).toBeDefined()
      expect(resources.en.errors).toBeDefined()
    })

    it('does not statically bundle non-English resources (lazy-loaded instead)', () => {
      // Only 'en' ships eagerly; other languages are fetched on demand via
      // ensureLanguageLoaded() to keep the main bundle under the 300KB
      // chunk-size budget.
      expect(Object.keys(resources)).toEqual(['en'])
    })
  })

  describe('ensureLanguageLoaded', () => {
    it('loads and registers a non-English bundle with i18next', async () => {
      await ensureLanguageLoaded('zh')

      expect(i18n.getResourceBundle('zh', 'common')?.navigation?.dashboard).toBe('仪表板')
      expect(i18n.getResourceBundle('zh', 'cards')?.titles?.cluster_health).toBe('集群健康')
      expect(i18n.getResourceBundle('zh', 'status')?.cluster?.healthy).toBe('健康')
    })

    it('shares the zh bundle for zh-TW', async () => {
      await ensureLanguageLoaded('zh-TW')

      expect(i18n.getResourceBundle('zh-TW', 'common')?.navigation?.dashboard).toBe('仪表板')
    })

    it('is a no-op for already-loaded languages', async () => {
      await expect(ensureLanguageLoaded('en')).resolves.toBeUndefined()
    })

    it('is a no-op for unsupported language codes', async () => {
      await expect(ensureLanguageLoaded('xx')).resolves.toBeUndefined()
    })
  })

  describe('languages array', () => {
    it('contains at least 10 languages', () => {
      expect(languages.length).toBeGreaterThanOrEqual(10)
    })

    it('has English as first language', () => {
      expect(languages[0].code).toBe('en')
      expect(languages[0].name).toBe('English')
    })

    it('every language has code, name, and flag', () => {
      for (const lang of languages) {
        expect(lang.code).toBeTruthy()
        expect(lang.name).toBeTruthy()
        expect(lang.flag).toBeTruthy()
      }
    })

    it('every non-English language code can be lazy-loaded', async () => {
      for (const lang of languages) {
        if (lang.code === 'en') continue
        await expect(ensureLanguageLoaded(lang.code)).resolves.toBeUndefined()
      }
    })
  })

  describe('namespace configuration', () => {
    it('defaultNS is common', () => {
      expect(defaultNS).toBe('common')
    })

    it('namespaces includes all four required namespaces', () => {
      expect(namespaces).toContain('common')
      expect(namespaces).toContain('cards')
      expect(namespaces).toContain('status')
      expect(namespaces).toContain('errors')
    })
  })
})
