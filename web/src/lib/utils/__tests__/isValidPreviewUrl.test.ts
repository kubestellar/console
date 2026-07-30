import { describe, it, expect } from 'vitest'
import { isValidPreviewUrl } from '../isValidPreviewUrl'

describe('isValidPreviewUrl', () => {
  it('accepts Netlify deploy-preview URLs', () => {
    expect(isValidPreviewUrl('https://deploy-preview-1234--kubestellar-console.netlify.app')).toBe(true)
    expect(isValidPreviewUrl('https://abc123.netlify.app')).toBe(true)
    expect(isValidPreviewUrl('https://main--kubestellar-console.netlify.app/settings')).toBe(true)
  })

  it('accepts production console URL', () => {
    expect(isValidPreviewUrl('https://console.kubestellar.io')).toBe(true)
    expect(isValidPreviewUrl('https://console.kubestellar.io/dashboard')).toBe(true)
  })

  it('accepts deploy-preview subdomain', () => {
    expect(isValidPreviewUrl('https://pr-42.console-deploy-preview.kubestellar.io')).toBe(true)
  })

  it('rejects arbitrary URLs', () => {
    expect(isValidPreviewUrl('https://evil.com')).toBe(false)
    expect(isValidPreviewUrl('https://phishing.netlify.app.evil.com')).toBe(false)
    expect(isValidPreviewUrl('https://fake-netlify.app')).toBe(false)
  })

  it('rejects non-https schemes', () => {
    expect(isValidPreviewUrl('http://deploy-preview-1.netlify.app')).toBe(false)
    expect(isValidPreviewUrl('javascript:alert(1)')).toBe(false)
    expect(isValidPreviewUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isValidPreviewUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejects null/undefined/empty', () => {
    expect(isValidPreviewUrl(null)).toBe(false)
    expect(isValidPreviewUrl(undefined)).toBe(false)
    expect(isValidPreviewUrl('')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isValidPreviewUrl('not-a-url')).toBe(false)
    expect(isValidPreviewUrl('://missing-scheme')).toBe(false)
  })
})
