import { describe, it, expect } from 'vitest'
import { resources, languages, defaultNS, namespaces } from '../i18n'

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

    it('supports Spanish locale', () => {
      expect(resources.es).toBeDefined()
      expect(resources.es.common).toBeDefined()
    })

    it('supports French locale', () => {
      expect(resources.fr).toBeDefined()
    })

    it('supports German locale', () => {
      expect(resources.de).toBeDefined()
    })

    it('supports Japanese locale', () => {
      expect(resources.ja).toBeDefined()
    })

    it('supports Simplified Chinese locale', () => {
      expect(resources.zh).toBeDefined()
    })

    it('loads non-English resource bundles instead of English placeholders', () => {
      expect(resources.zh.common.navigation.dashboard).toBe('仪表板')
      expect(resources.zh.cards.titles.cluster_health).toBe('集群健康')
      expect(resources.zh.status.cluster.healthy).toBe('健康')
      expect(resources.zh.common.navigation.dashboard).not.toBe(resources.en.common.navigation.dashboard)
    })

    it('supports Traditional Chinese locale', () => {
      expect(resources['zh-TW']).toBeDefined()
    })

    it('supports Italian locale', () => {
      expect(resources.it).toBeDefined()
    })

    it('supports Portuguese locale', () => {
      expect(resources.pt).toBeDefined()
    })

    it('supports Hindi locale', () => {
      expect(resources.hi).toBeDefined()
    })

    it('all locales have the same namespace structure as English', () => {
      const enKeys = Object.keys(resources.en).sort()
      for (const [lang, langResources] of Object.entries(resources)) {
        if (lang === 'en') continue
        const langKeys = Object.keys(langResources).sort()
        expect(langKeys).toEqual(enKeys)
      }
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

    it('every language code has a corresponding resource entry', () => {
      for (const lang of languages) {
        expect((resources as Record<string, unknown>)[lang.code]).toBeDefined()
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
