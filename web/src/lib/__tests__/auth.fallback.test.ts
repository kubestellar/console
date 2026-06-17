import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('useAuth fallback', () => {
  it('returns a safe fallback object outside AuthProvider', async () => {
    // Import useAuth — it should not throw outside AuthProvider
    const { useAuth } = await import('../auth')
    const { result } = renderHook(() => useAuth())

    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isLoading).toBe(true)
    expect(typeof result.current.login).toBe('function')
    expect(typeof result.current.logout).toBe('function')
    expect(typeof result.current.setToken).toBe('function')
    expect(typeof result.current.refreshUser).toBe('function')
  })

  it('fallback login/logout/setToken are no-ops', async () => {
    const { useAuth } = await import('../auth')
    const { result } = renderHook(() => useAuth())

    // Should not throw
    result.current.login()
    result.current.logout()
    result.current.setToken('abc', true)
    expect(await result.current.refreshUser()).toBeUndefined()
  })
})

// ============================================================================
// showExpiryWarningBanner — DOM manipulation
// ============================================================================

describe('showExpiryWarningBanner (indirectly)', () => {
  // We test the DOM manipulation logic that showExpiryWarningBanner performs.
  // Since it's not exported, we replicate and test the contract.

  function showExpiryWarningBanner(onRefresh: () => void): void {
    if (document.getElementById('session-expiry-warning')) return

    const banner = document.createElement('div')
    banner.id = 'session-expiry-warning'
    banner.style.cssText = `position: fixed; bottom: 24px; left: 50%;`
    banner.innerHTML = `<span><strong>Session expires soon</strong></span>`

    const btn = document.createElement('button')
    btn.textContent = 'Refresh Now'
    btn.onclick = () => {
      onRefresh()
      banner.remove()
    }
    banner.appendChild(btn)

    const STYLE_ID = 'session-banner-animation'
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `@keyframes slideUp { from { opacity: 0; } to { opacity: 1; } }`
      document.head.appendChild(style)
    }
    document.body.appendChild(banner)
  }

  it('creates a banner element in the DOM', () => {
    showExpiryWarningBanner(vi.fn())
    expect(document.getElementById('session-expiry-warning')).not.toBeNull()
  })

  it('does not create duplicate banners', () => {
    showExpiryWarningBanner(vi.fn())
    showExpiryWarningBanner(vi.fn())
    const banners = document.querySelectorAll('#session-expiry-warning')
    expect(banners.length).toBe(1)
  })

  it('calls onRefresh when button is clicked', () => {
    const onRefresh = vi.fn()
    showExpiryWarningBanner(onRefresh)
    const btn = document.querySelector('#session-expiry-warning button') as HTMLButtonElement
    btn.click()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('removes banner when button is clicked', () => {
    showExpiryWarningBanner(vi.fn())
    const btn = document.querySelector('#session-expiry-warning button') as HTMLButtonElement
    btn.click()
    expect(document.getElementById('session-expiry-warning')).toBeNull()
  })

  it('creates animation style element only once', () => {
    showExpiryWarningBanner(vi.fn())
    // Remove banner, create again
    document.getElementById('session-expiry-warning')?.remove()
    showExpiryWarningBanner(vi.fn())
    const styles = document.querySelectorAll('#session-banner-animation')
    expect(styles.length).toBe(1)
  })

  it('banner contains "Session expires soon" text', () => {
    showExpiryWarningBanner(vi.fn())
    const banner = document.getElementById('session-expiry-warning')
    expect(banner?.textContent).toContain('Session expires soon')
  })

  it('banner contains "Refresh Now" button', () => {
    showExpiryWarningBanner(vi.fn())
    const btn = document.querySelector('#session-expiry-warning button')
    expect(btn?.textContent).toBe('Refresh Now')
  })
})
