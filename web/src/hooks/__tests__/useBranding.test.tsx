import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'

const mockMergeBranding = vi.fn((overrides: Record<string, unknown>) => ({
  appName: 'KubeStellar Console',
  appShortName: 'KubeStellar',
  tagline: 'multi-cluster first, saving time and tokens',
  logoUrl: '/kubestellar-logo.svg',
  faviconUrl: '/favicon.ico',
  themeColor: '#7c3aed',
  showStarDecoration: true,
  docsUrl: 'https://kubestellar.io/docs/console/readme',
  communityUrl: 'https://kubestellar.io/community',
  websiteUrl: 'https://kubestellar.io',
  issuesUrl: 'https://github.com/kubestellar/kubestellar/issues/new',
  repoUrl: 'https://github.com/kubestellar/console',
  installCommand: 'curl -sSL https://raw.githubusercontent.com/kubestellar/console/refs/heads/main/start.sh | bash',
  hostedDomain: 'console.kubestellar.io',
  ga4MeasurementId: '',
  umamiWebsiteId: '',
  showAdopterNudge: true,
  showDemoToLocalCTA: true,
  showRewards: true,
  showLinkedInShare: true,
  ...overrides,
}))

vi.mock('../../lib/branding', () => ({
  DEFAULT_BRANDING: {
    appName: 'KubeStellar Console',
    appShortName: 'KubeStellar',
    tagline: 'multi-cluster first, saving time and tokens',
    logoUrl: '/kubestellar-logo.svg',
    faviconUrl: '/favicon.ico',
    themeColor: '#7c3aed',
    showStarDecoration: true,
    docsUrl: 'https://kubestellar.io/docs/console/readme',
    communityUrl: 'https://kubestellar.io/community',
    websiteUrl: 'https://kubestellar.io',
    issuesUrl: 'https://github.com/kubestellar/kubestellar/issues/new',
    repoUrl: 'https://github.com/kubestellar/console',
    installCommand: 'curl -sSL https://raw.githubusercontent.com/kubestellar/console/refs/heads/main/start.sh | bash',
    hostedDomain: 'console.kubestellar.io',
    ga4MeasurementId: '',
    umamiWebsiteId: '',
    showAdopterNudge: true,
    showDemoToLocalCTA: true,
    showRewards: true,
    showLinkedInShare: true,
  },
  mergeBranding: (...args: unknown[]) => mockMergeBranding(...(args as [Record<string, unknown>])),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
} })

const mockUpdateAnalyticsIds = vi.fn()
vi.mock('../../lib/analytics', () => ({
  updateAnalyticsIds: (...args: unknown[]) => mockUpdateAnalyticsIds(...args),
}))

import { useBranding, BrandingProvider } from '../useBranding'

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <BrandingProvider>{children}</BrandingProvider>
  )
}

describe('useBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    )
  })

  // ── Default branding without provider ─────────────────────────────────

  it('returns default branding outside provider', () => {
    const { result } = renderHook(() => useBranding())
    expect(result.current.appName).toBe('KubeStellar Console')
    expect(result.current.appShortName).toBe('KubeStellar')
    expect(result.current.logoUrl).toBe('/kubestellar-logo.svg')
  })

  // ── Default branding values include all required fields ───────────────

  it('provides all BrandingConfig fields via default context', () => {
    const { result } = renderHook(() => useBranding())
    expect(result.current.themeColor).toBe('#7c3aed')
    expect(result.current.showStarDecoration).toBe(true)
    expect(result.current.docsUrl).toContain('kubestellar.io')
    expect(result.current.communityUrl).toContain('kubestellar.io')
    expect(result.current.websiteUrl).toBe('https://kubestellar.io')
    expect(result.current.issuesUrl).toContain('github.com')
    expect(result.current.repoUrl).toContain('github.com')
    expect(result.current.hostedDomain).toBe('console.kubestellar.io')
  })

  // ── Branding from /health endpoint ────────────────────────────────────

  it('fetches and applies branding from /health endpoint', async () => {
    const customBranding = { appName: 'Custom Console', themeColor: '#ff0000' }
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ branding: customBranding }), { status: 200 })
    )

    const { result } = renderHook(() => useBranding(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(mockMergeBranding).toHaveBeenCalledWith(customBranding)
    })
    expect(result.current.appName).toBe('Custom Console')
    expect(result.current.themeColor).toBe('#ff0000')
  })

  // ── Updates analytics IDs from branding ───────────────────────────────

  it('calls updateAnalyticsIds with merged branding values', async () => {
    const customBranding = {
      appName: 'Analytics Test',
      ga4MeasurementId: 'G-TEST123',
      umamiWebsiteId: 'umami-456',
    }
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ branding: customBranding }), { status: 200 })
    )

    renderHook(() => useBranding(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(mockUpdateAnalyticsIds).toHaveBeenCalledWith(
        expect.objectContaining({
          ga4MeasurementId: 'G-TEST123',
          umamiWebsiteId: 'umami-456',
        })
      )
    })
  })

  // ── Handles fetch failure gracefully ──────────────────────────────────

  it('falls back to defaults on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useBranding(), { wrapper: createWrapper() })

    // Should fall back to defaults, not throw
    expect(result.current.appName).toBe('KubeStellar Console')
    // Wait a tick to ensure the catch path ran without throwing
    await waitFor(() => {
      expect(result.current.appName).toBe('KubeStellar Console')
    })
  })

  // ── Handles non-branding health response ──────────────────────────────

  it('uses defaults when /health response has no branding field', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    )

    const { result } = renderHook(() => useBranding(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.appName).toBe('KubeStellar Console')
    })
    // mergeBranding should NOT have been called since there's no branding object
    expect(mockMergeBranding).not.toHaveBeenCalled()
  })

  // ── Handles branding that is not an object ────────────────────────────

  it('ignores branding field if it is not an object (e.g., string)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ branding: 'not-an-object' }), { status: 200 })
    )

    const { result } = renderHook(() => useBranding(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.appName).toBe('KubeStellar Console')
    })
    expect(mockMergeBranding).not.toHaveBeenCalled()
  })

  it('ignores branding field if it is null', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ branding: null }), { status: 200 })
    )

    const { result } = renderHook(() => useBranding(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.appName).toBe('KubeStellar Console')
    })
    expect(mockMergeBranding).not.toHaveBeenCalled()
  })

  // ── Cancellation on unmount ───────────────────────────────────────────

  it('does not update state after unmount (cancelled flag)', async () => {
    let resolvePromise: (value: Response) => void
    const fetchPromise = new Promise<Response>((resolve) => {
      resolvePromise = resolve
    })
    vi.mocked(fetch).mockReturnValue(fetchPromise)

    const { result, unmount } = renderHook(() => useBranding(), { wrapper: createWrapper() })

    // Unmount before the fetch resolves
    unmount()

    // Now resolve the fetch — the cancelled flag should prevent setState
    resolvePromise!(
      new Response(JSON.stringify({
        branding: { appName: 'Should Not Apply' },
      }), { status: 200 })
    )

    // The branding should still be defaults (no update after unmount)
    expect(result.current.appName).toBe('KubeStellar Console')
  })

  // ── BrandingProvider renders children immediately ─────────────────────

  it('renders children immediately without waiting for fetch', () => {
    // Use a slow fetch that never resolves
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))

    const _testId = 'child-rendered'
    const { result } = renderHook(() => useBranding(), { wrapper: createWrapper() })

    // Even though fetch hasn't resolved, we should have default branding
    expect(result.current.appName).toBe('KubeStellar Console')
  })

  // ── Feature flags are included in branding ────────────────────────────

  it('includes feature flags from default branding', () => {
    const { result } = renderHook(() => useBranding())
    expect(result.current.showAdopterNudge).toBe(true)
    expect(result.current.showDemoToLocalCTA).toBe(true)
    expect(result.current.showRewards).toBe(true)
    expect(result.current.showLinkedInShare).toBe(true)
  })

  // ── Partial branding overrides only specified fields ──────────────────

  it('merges partial branding without losing default fields', async () => {
    const partialBranding = { appName: 'Partial Override' }
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ branding: partialBranding }), { status: 200 })
    )

    const { result } = renderHook(() => useBranding(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(mockMergeBranding).toHaveBeenCalledWith(partialBranding)
    })
    // The merged result should have the override plus defaults
    expect(result.current.appName).toBe('Partial Override')
    // Default fields should be preserved (via the mock's spread of defaults)
    expect(result.current.logoUrl).toBe('/kubestellar-logo.svg')
  })

  // ── Fetch is called with correct arguments ─────────────────────────────

  it('fetches /health with abort signal timeout', async () => {
    const customBranding = { appName: 'Fetch Check' }
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ branding: customBranding }), { status: 200 })
    )

    renderHook(() => useBranding(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/health', expect.objectContaining({
        signal: expect.any(AbortSignal),
      }))
    })
  })
})
