import { describe, it, expect } from 'vitest'
import { DEFAULT_BRANDING, mergeBranding } from '../branding'

describe('DEFAULT_BRANDING', () => {
  it('has all required fields', () => {
    expect(DEFAULT_BRANDING.appName).toBe('KubeStellar Console')
    expect(DEFAULT_BRANDING.appShortName).toBe('KubeStellar')
    expect(DEFAULT_BRANDING.tagline).toBeTruthy()
    expect(DEFAULT_BRANDING.logoUrl).toBeTruthy()
    expect(DEFAULT_BRANDING.faviconUrl).toBeTruthy()
    expect(DEFAULT_BRANDING.themeColor).toBeTruthy()
    expect(DEFAULT_BRANDING.docsUrl).toBeTruthy()
    expect(DEFAULT_BRANDING.repoUrl).toBeTruthy()
    expect(DEFAULT_BRANDING.installCommand).toBeTruthy()
  })

  it('has boolean feature flags', () => {
    expect(typeof DEFAULT_BRANDING.showAdopterNudge).toBe('boolean')
    expect(typeof DEFAULT_BRANDING.showDemoToLocalCTA).toBe('boolean')
    expect(typeof DEFAULT_BRANDING.showRewards).toBe('boolean')
    expect(typeof DEFAULT_BRANDING.showLinkedInShare).toBe('boolean')
  })
})

describe('mergeBranding', () => {
  it('returns defaults when given empty object', () => {
    const result = mergeBranding({})
    expect(result).toEqual(DEFAULT_BRANDING)
  })

  it('overrides string values', () => {
    const result = mergeBranding({ appName: 'My Console' })
    expect(result.appName).toBe('My Console')
    expect(result.appShortName).toBe('KubeStellar') // unchanged
  })

  it('overrides boolean values', () => {
    const result = mergeBranding({ showAdopterNudge: false })
    expect(result.showAdopterNudge).toBe(false)
  })

  it('ignores empty string values', () => {
    const result = mergeBranding({ appName: '' })
    expect(result.appName).toBe('KubeStellar Console')
  })

  it('ignores null values', () => {
    const result = mergeBranding({ appName: null })
    expect(result.appName).toBe('KubeStellar Console')
  })

  it('ignores undefined values', () => {
    const result = mergeBranding({ appName: undefined })
    expect(result.appName).toBe('KubeStellar Console')
  })

  it('ignores values with wrong type', () => {
    const result = mergeBranding({ appName: 42 as unknown as string })
    expect(result.appName).toBe('KubeStellar Console')
  })

  it('ignores unknown keys', () => {
    const result = mergeBranding({ unknownKey: 'value' })
    expect(result).toEqual(DEFAULT_BRANDING)
  })

  it('handles multiple overrides', () => {
    const result = mergeBranding({
      appName: 'Custom App',
      appShortName: 'Custom',
      themeColor: '#ff0000',
      showRewards: false,
    })
    expect(result.appName).toBe('Custom App')
    expect(result.appShortName).toBe('Custom')
    expect(result.themeColor).toBe('#ff0000')
    expect(result.showRewards).toBe(false)
  })

  it('does not mutate DEFAULT_BRANDING', () => {
    const originalName = DEFAULT_BRANDING.appName
    mergeBranding({ appName: 'Mutated' })
    expect(DEFAULT_BRANDING.appName).toBe(originalName)
  })

  it('returns a new object (not the same reference as DEFAULT_BRANDING)', () => {
    const result = mergeBranding({})
    expect(result).not.toBe(DEFAULT_BRANDING)
    expect(result).toEqual(DEFAULT_BRANDING)
  })

  it('ignores boolean passed as string for a boolean field', () => {
    const result = mergeBranding({ showRewards: 'true' as unknown as boolean })
    expect(result.showRewards).toBe(true) // default stays
  })

  it('ignores number 0 for a boolean field (type mismatch)', () => {
    const result = mergeBranding({ showStarDecoration: 0 as unknown as boolean })
    expect(result.showStarDecoration).toBe(true) // default stays
  })

  it('accepts false for a boolean field (false is valid, not empty)', () => {
    const result = mergeBranding({ showLinkedInShare: false })
    expect(result.showLinkedInShare).toBe(false)
  })

  it('overrides all string fields when valid values provided', () => {
    const allStringOverrides: Partial<Record<string, unknown>> = {
      appName: 'A',
      appShortName: 'B',
      tagline: 'C',
      logoUrl: '/custom.svg',
      faviconUrl: '/custom.ico',
      themeColor: '#000',
      docsUrl: 'https://docs.example.com',
      communityUrl: 'https://community.example.com',
      websiteUrl: 'https://example.com',
      issuesUrl: 'https://issues.example.com',
      repoUrl: 'https://repo.example.com',
      installCommand: 'curl http://example.com | bash',
      hostedDomain: 'example.com',
      ga4MeasurementId: 'G-TEST',
      umamiWebsiteId: 'test-id',
    }
    const result = mergeBranding(allStringOverrides)
    expect(result.appName).toBe('A')
    expect(result.appShortName).toBe('B')
    expect(result.tagline).toBe('C')
    expect(result.logoUrl).toBe('/custom.svg')
    expect(result.faviconUrl).toBe('/custom.ico')
    expect(result.themeColor).toBe('#000')
    expect(result.docsUrl).toBe('https://docs.example.com')
    expect(result.communityUrl).toBe('https://community.example.com')
    expect(result.websiteUrl).toBe('https://example.com')
    expect(result.issuesUrl).toBe('https://issues.example.com')
    expect(result.repoUrl).toBe('https://repo.example.com')
    expect(result.installCommand).toBe('curl http://example.com | bash')
    expect(result.hostedDomain).toBe('example.com')
    expect(result.ga4MeasurementId).toBe('G-TEST')
    expect(result.umamiWebsiteId).toBe('test-id')
  })

  it('ignores array value for a string field (type mismatch)', () => {
    const result = mergeBranding({ appName: ['not', 'a', 'string'] as unknown as string })
    expect(result.appName).toBe('KubeStellar Console')
  })

  it('ignores object value for a string field (type mismatch)', () => {
    const result = mergeBranding({ tagline: { nested: true } as unknown as string })
    expect(result.tagline).toBe(DEFAULT_BRANDING.tagline)
  })

  it('handles mix of valid, invalid, null, and unknown keys', () => {
    const result = mergeBranding({
      appName: 'Valid',
      appShortName: null,
      tagline: undefined,
      logoUrl: '',
      faviconUrl: 42,
      unknownField: 'ignored',
      showRewards: false,
    })
    expect(result.appName).toBe('Valid')
    expect(result.appShortName).toBe('KubeStellar') // null ignored
    expect(result.tagline).toBe(DEFAULT_BRANDING.tagline) // undefined ignored
    expect(result.logoUrl).toBe(DEFAULT_BRANDING.logoUrl) // empty string ignored
    expect(result.faviconUrl).toBe(DEFAULT_BRANDING.faviconUrl) // wrong type ignored
    expect(result.showRewards).toBe(false) // valid boolean override
  })
})
