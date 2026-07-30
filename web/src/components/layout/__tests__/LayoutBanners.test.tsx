import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderHook } from '@testing-library/react'
import { useLayoutBanners } from '../LayoutBanners'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; [k: string]: unknown }) => {
    // Check if link is external (starts with http:// or https://)
    const isExternal = typeof to === 'string' && (to.startsWith('http://') || to.startsWith('https://'))
    const externalProps = isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}
    return <a href={to} {...externalProps} {...props}>{children}</a>
  },
}))

vi.mock('@/hooks/useModal', () => ({
  useModal: () => ({ isOpen: false, open: vi.fn(), close: vi.fn(), toggle: vi.fn() }),
}))

const baseOptions = {
  autonomousBannerDismissed: true,
  hasInClusterAIBackend: false,
  isAuthenticatedNoAgent: false,
  isDemoMode: false,
  isDemoModeForced: false,
  isInClusterMode: false,
  isMobile: false,
  isOnline: true,
  demoBannerDismissed: false,
  offlineBannerDismissed: false,
  wasOffline: false,
  backendStatus: 'connected',
  agentStatus: 'connected',
  onDismissAutonomous: vi.fn(),
  onDismissOffline: vi.fn(),
  onOpenInClusterSetup: vi.fn(),
  onOpenSetup: vi.fn(),
  onToggleDemoMode: vi.fn(),
  onToggleDemoOrDismiss: vi.fn(),
}

function renderBanners(overrides: Partial<typeof baseOptions> = {}) {
  const opts = { ...baseOptions, ...overrides }
  const { result } = renderHook(() => useLayoutBanners(opts))
  const banners = result.current.visibleBanners
  // Render all banners
  const { container } = render(<>{banners.map(b => <div key={b.id}>{b.content}</div>)}</>)
  return { banners, container }
}

describe('useLayoutBanners', () => {
  it('demo banner dismiss button uses Button component with aria-label', () => {
    renderBanners({ isDemoMode: true, isDemoModeForced: true })

    const dismissBtn = screen.getByRole('button', { name: 'buttons.dismissBanner' })
    expect(dismissBtn).toBeInTheDocument()
    expect(dismissBtn).toHaveAttribute('title', 'buttons.dismissBanner')
  })

  it('demo banner dismiss calls onToggleDemoOrDismiss on click', async () => {
    const user = userEvent.setup()
    const onToggleDemoOrDismiss = vi.fn()
    renderBanners({ isDemoMode: true, isDemoModeForced: true, onToggleDemoOrDismiss })

    await user.click(screen.getByRole('button', { name: 'buttons.dismissBanner' }))
    expect(onToggleDemoOrDismiss).toHaveBeenCalledTimes(1)
  })

  it('offline banner dismiss button has accessible aria-label', () => {
    renderBanners({
      isDemoMode: false,
      agentStatus: 'disconnected',
      backendStatus: 'disconnected',
      offlineBannerDismissed: false,
    })

    const dismissBtn = screen.getByRole('button', { name: 'actions.dismiss' })
    expect(dismissBtn).toBeInTheDocument()
    expect(dismissBtn).toHaveAttribute('aria-label', 'actions.dismiss')
  })

  it('offline banner dismiss calls onDismissOffline on click', async () => {
    const user = userEvent.setup()
    const onDismissOffline = vi.fn()
    renderBanners({
      isDemoMode: false,
      agentStatus: 'disconnected',
      backendStatus: 'disconnected',
      offlineBannerDismissed: false,
      onDismissOffline,
    })

    await user.click(screen.getByRole('button', { name: 'actions.dismiss' }))
    expect(onDismissOffline).toHaveBeenCalledTimes(1)
  })

  it('does not render demo banner when demoBannerDismissed is true', () => {
    const { banners } = renderBanners({ isDemoMode: true, demoBannerDismissed: true })
    expect(banners.find(b => b.id === 'demo')).toBeUndefined()
  })

  it('does not render offline banner when offlineBannerDismissed is true', () => {
    const { banners } = renderBanners({
      agentStatus: 'disconnected',
      backendStatus: 'disconnected',
      offlineBannerDismissed: true,
    })
    expect(banners.find(b => b.id === 'offline')).toBeUndefined()
  })
})
