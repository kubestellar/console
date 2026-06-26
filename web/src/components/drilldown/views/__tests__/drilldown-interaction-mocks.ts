/**
 * Shared vi.mock registrations for drill-down RTL interaction tests (#15406).
 * Import this module first in each interaction test file (before the view under test).
 */
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import {
  mockRunHelm,
  mockRunKubectl,
  mockUseTranslation,
} from './drilldown-interaction-helpers'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => false,
  getDemoMode: () => false,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => false,
  default: () => false,
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => true,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => false,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(),
  emitLogin: vi.fn(),
  emitEvent: vi.fn(),
  analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(),
  emitCardExpanded: vi.fn(),
  emitCardRefreshed: vi.fn(),
  emitDrillDownOpened: vi.fn(),
  emitDrillDownClosed: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => mockUseTranslation(),
  Trans: ({
    children,
    defaults,
    i18nKey,
  }: {
    children?: ReactNode
    defaults?: string
    i18nKey?: string
  }) => children ?? defaults ?? i18nKey ?? null,
}))

vi.mock('../../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: true }),
}))

vi.mock('../../../../hooks/useDrillDownWebSocket', () => ({
  useDrillDownWebSocket: () => ({ runKubectl: mockRunKubectl, runHelm: mockRunHelm }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' '),
}))

vi.mock('../../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))
