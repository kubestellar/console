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
})
