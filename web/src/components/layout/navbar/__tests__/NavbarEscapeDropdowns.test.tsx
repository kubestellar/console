import React from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TokenUsageWidget } from '../TokenUsageWidget'
import { AgentStatusIndicator } from '../AgentStatusIndicator'

const mockNavigate = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({
    usage: {
      used: 250,
      limit: 1000,
      byCategory: {
        missions: 100,
        diagnose: 50,
        insights: 25,
        predictions: 25,
        other: 50,
      },
    },
    alertLevel: 'normal',
    percentage: 25,
    remaining: 750,
    isDemoData: false,
  }),
}))

vi.mock('../../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({
    status: 'connected',
    health: { version: '1.0.0' },
    connectionEvents: [],
    isConnected: true,
    isDegraded: false,
    isAuthError: false,
    dataErrorCount: 0,
    lastDataError: null,
  }),
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({
    selectedAgent: 'none',
    agents: [],
  }),
}))

vi.mock('../../../../hooks/useBackendHealth', () => ({
  useBackendHealth: () => ({
    status: 'connected',
    isConnected: true,
    isInClusterMode: false,
  }),
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({
    isDemoMode: false,
    toggleDemoMode: vi.fn(),
  }),
  isDemoModeForced: false,
  getDemoMode: () => false,
}))

vi.mock('../../../../hooks/useDashboardHealth', () => ({
  useDashboardHealth: () => ({
    status: 'healthy',
    message: 'Healthy',
    details: [],
  }),
}))

vi.mock('../../../../hooks/mcp/shared', () => ({
  agentFetch: vi.fn(),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}))

vi.mock('../../../ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('../../../ui/StatusBadge', () => ({
  StatusBadge: ({ children, ...props }: HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
}))

vi.mock('../../../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: () => null,
}))

vi.mock('../../../agent/AgentApprovalDialog', () => ({
  AgentApprovalDialog: () => null,
  hasApprovedAgents: () => true,
}))

describe('navbar dropdown Escape handling', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
  })

  it('closes Token Usage dropdown on Escape', () => {
    render(<TokenUsageWidget />)

    fireEvent.click(screen.getByTestId('navbar-token-usage-btn'))
    expect(screen.getByTestId('navbar-token-usage-dropdown')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('navbar-token-usage-dropdown')).not.toBeInTheDocument()
  })

  it('closes Agent Status dropdown on Escape', () => {
    render(<AgentStatusIndicator />)

    fireEvent.click(screen.getByTestId('navbar-agent-status-btn'))
    expect(screen.getByTestId('navbar-agent-status-dropdown')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('navbar-agent-status-dropdown')).not.toBeInTheDocument()
  })
})
