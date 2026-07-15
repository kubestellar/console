import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/hooks/useSidebarConfig', () => ({
  DEFAULT_PRIMARY_NAV: [{ id: 'home' }, { id: 'clusters' }],
  DISCOVERABLE_DASHBOARDS: [{ id: 'discover' }],
}))

vi.mock('@/config/routes', () => ({
  ROUTES: {
    HOME: '/',
    CLUSTERS: '/clusters',
    AI_ML: '/ai-ml',
    COMPLIANCE: '/compliance',
    COST: '/cost',
    GITOPS: '/gitops',
    SETTINGS: '/settings',
  },
}))

const analyticsMocks = vi.hoisted(() => ({
  emitWelcomeViewed: vi.fn(),
  emitWelcomeActioned: vi.fn(),
}))

vi.mock('@/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  emitWelcomeViewed: analyticsMocks.emitWelcomeViewed,
  emitWelcomeActioned: analyticsMocks.emitWelcomeActioned,
}))

vi.mock('@/components/cards/cardRegistry', () => ({
  getRegisteredCardTypes: vi.fn(() => Array.from({ length: 42 }, (_, i) => `card_${i}`)),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { Welcome } from './Welcome'

function renderWelcome(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/${search}`]}>
      <Welcome />
    </MemoryRouter>,
  )
}

describe('Welcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // restore title to avoid bleed between tests
    document.title = ''
  })

  it('renders the hero headline', () => {
    renderWelcome()
    expect(screen.getByText(/Your Kubernetes clusters/)).toBeInTheDocument()
  })

  it('renders the Explore the Demo CTA button', () => {
    renderWelcome()
    const buttons = screen.getAllByText('Explore the Demo')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('emits emitWelcomeViewed on mount with direct ref by default', async () => {
    await act(async () => {
      renderWelcome()
    })
    expect(analyticsMocks.emitWelcomeViewed).toHaveBeenCalledWith('direct')
  })

  it('sets document.title on mount', async () => {
    await act(async () => {
      renderWelcome()
    })
    expect(document.title).toBe('KubeStellar Console — Open Source Kubernetes Dashboard')
  })

  it('emits emitWelcomeActioned with hero_explore_demo on CTA click', async () => {
    await act(async () => {
      renderWelcome()
    })
    const cta = screen.getAllByText('Explore the Demo')[0]
    await act(async () => {
      fireEvent.click(cta)
    })
    expect(analyticsMocks.emitWelcomeActioned).toHaveBeenCalledWith('hero_explore_demo', 'direct')
  })

  it('emits emitWelcomeActioned with footer_explore_demo on footer CTA click', async () => {
    await act(async () => {
      renderWelcome()
    })
    const footerCta = screen.getAllByText('Explore the Demo')[1]
    await act(async () => {
      fireEvent.click(footerCta)
    })
    expect(analyticsMocks.emitWelcomeActioned).toHaveBeenCalledWith('footer_explore_demo', 'direct')
  })

  it('emits emitWelcomeActioned with hero_github on GitHub link click', async () => {
    await act(async () => {
      renderWelcome()
    })
    const githubLinks = screen.getAllByText('GitHub')
    await act(async () => {
      fireEvent.click(githubLinks[0])
    })
    expect(analyticsMocks.emitWelcomeActioned).toHaveBeenCalledWith('hero_github', 'direct')
  })

  it('renders differentiator pills', () => {
    renderWelcome()
    expect(screen.getByText('No account required')).toBeInTheDocument()
    expect(screen.getByText('Apache 2.0')).toBeInTheDocument()
  })

  it('renders scenarios section', () => {
    renderWelcome()
    expect(screen.getByText(/See it in/)).toBeInTheDocument()
    expect(screen.getByText('AI diagnoses a crashing pod')).toBeInTheDocument()
  })

  it('renders footer CTA section', () => {
    renderWelcome()
    expect(screen.getByText('Ready to try it?')).toBeInTheDocument()
  })
})
