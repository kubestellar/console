import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'

const modalState = vi.hoisted(() => ({
  isOpen: false,
  close: vi.fn(),
  toggle: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => modalState,
  useEscapeLayer: () => () => true,
}))

import { StatBlockModePicker } from '../StatBlockModePicker'

describe('StatBlockModePicker', () => {
  beforeEach(() => {
    modalState.isOpen = false
    modalState.close.mockReset()
    modalState.toggle.mockReset()
  })

  it('renders without crashing', () => {
    const { container } = render(<StatBlockModePicker currentMode="numeric" availableModes={["numeric"]} onModeChange={vi.fn()} />)
    expect(container).toBeTruthy()
  })

  it('repositions the popover on resize and scroll while open', async () => {
    modalState.isOpen = true
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 800,
    })

    const rect = {
      top: 50,
      bottom: 100,
      right: 300,
      left: 260,
      width: 40,
      height: 50,
      x: 260,
      y: 50,
      toJSON: () => ({}),
    }

    render(<StatBlockModePicker currentMode="numeric" availableModes={["numeric", "sparkline"]} onModeChange={vi.fn()} />)

    const trigger = screen.getByTitle('Change display mode')
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    })

    fireEvent(window, new Event('resize'))

    const menu = await screen.findByRole('menu', { name: 'Display mode' })
    await waitFor(() => {
      expect(menu).toHaveStyle({ top: '104px', left: '140px', width: '160px' })
    })

    rect.bottom = 180
    rect.right = 450
    fireEvent.scroll(window)

    await waitFor(() => {
      expect(menu).toHaveStyle({ top: '184px', left: '290px', width: '160px' })
    })
  })

  it('focuses the current mode when the menu opens', () => {
    modalState.isOpen = true

    render(
      <StatBlockModePicker
        currentMode="sparkline"
        availableModes={['numeric', 'sparkline', 'gauge']}
        onModeChange={vi.fn()}
      />,
    )

    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Sparkline' }))
  })

  it('supports arrow-key navigation between available menu items', () => {
    modalState.isOpen = true

    render(
      <StatBlockModePicker
        currentMode="numeric"
        availableModes={['numeric', 'gauge']}
        onModeChange={vi.fn()}
      />,
    )

    const menu = screen.getByRole('menu', { name: 'Display mode' })
    const numeric = screen.getByRole('menuitem', { name: 'Number' })
    const gauge = screen.getByRole('menuitem', { name: 'Gauge' })

    expect(document.activeElement).toBe(numeric)

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(gauge)

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(numeric)

    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(gauge)
  })
})
