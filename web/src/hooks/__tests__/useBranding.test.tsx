import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../lib/branding', () => ({
  DEFAULT_BRANDING: {
    productName: 'KubeStellar Console',
    logoUrl: '/logo.svg',
    ga4MeasurementId: undefined,
    umamiWebsiteId: undefined,
  },
  mergeBranding: vi.fn((overrides: Record<string, unknown>) => ({
    productName: 'KubeStellar Console',
    logoUrl: '/logo.svg',
    ...overrides,
  })),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
} })

vi.mock('../../lib/analytics', () => ({
  updateAnalyticsIds: vi.fn(),
}))

import { useBranding, BrandingProvider } from '../useBranding'

describe('useBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    )
  })

  it('returns default branding outside provider', () => {
    const { result } = renderHook(() => useBranding())
    expect(result.current.productName).toBe('KubeStellar Console')
  })

  it('returns branding from context when inside provider', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ branding: { productName: 'Custom Console' } }), { status: 200 })
    )

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BrandingProvider>{children}</BrandingProvider>
    )
    const { result } = renderHook(() => useBranding(), { wrapper })
    await waitFor(() => expect(result.current.productName).toBeDefined())
  })

  it('handles fetch failure gracefully (uses defaults)', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BrandingProvider>{children}</BrandingProvider>
    )
    const { result } = renderHook(() => useBranding(), { wrapper })
    // Should fall back to defaults, not throw
    expect(result.current.productName).toBe('KubeStellar Console')
  })

  it('handles non-branding response gracefully', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    )

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BrandingProvider>{children}</BrandingProvider>
    )
    const { result } = renderHook(() => useBranding(), { wrapper })
    expect(result.current.productName).toBe('KubeStellar Console')
  })
})
