import React from 'react'
/**
 * Render tests for MissionBrowser and MissionBrowserSidebar
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
}))

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('./browser', () => ({
  BROWSER_TABS: [
    { id: 'recommended', label: 'Recommended', icon: '⭐' },
    { id: 'installers', label: 'Installers', icon: '📦' },
  ],
  missionCache: { installersDone: true, fixesDone: true },
  resetMissionCache: vi.fn(),
}))

describe('MissionBrowser', () => {
  it('renders without errors', async () => {
    const { MissionBrowser } = await import('./MissionBrowser')
    const { container } = render(
      <MissionBrowser
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })

  it('does not render when closed', async () => {
    const { MissionBrowser } = await import('./MissionBrowser')
    const { container } = render(
      <MissionBrowser
        isOpen={false}
        onClose={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('MissionBrowserSidebar', () => {
  it('renders without errors', async () => {
    const { MissionBrowserSidebar } = await import('./MissionBrowserSidebar')
    const { container } = render(
      <MissionBrowserSidebar
        onNavigate={vi.fn()}
        selectedPath=""
      />
    )
    expect(container).toBeTruthy()
  })
})
