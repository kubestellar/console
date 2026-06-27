import React from 'react'
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | { defaultValue?: string }) =>
      typeof options === 'string' ? options : options?.defaultValue || key,
  }),
}))

vi.mock('../../lib/modals', () => ({
  BaseModal: Object.assign(
    ({ children, isOpen }: { children: ReactNode; isOpen?: boolean }) =>
      isOpen ? <div data-testid="base-modal">{children}</div> : null,
    {
      Header: ({ title }: { title?: string }) => <div>{title}</div>,
      Tabs: () => null,
      Content: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    },
  ),
  ConfirmDialog: () => null,
}))

vi.mock('../../lib/cn', () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}))

vi.mock('../../lib/dynamic-cards', () => ({
  saveDynamicStatsDefinition: vi.fn(),
  deleteDynamicStatsDefinition: vi.fn(),
  getAllDynamicStats: vi.fn(() => []),
}))

vi.mock('./AiGenerationPanel', () => ({
  AiGenerationPanel: () => null,
}))

vi.mock('./InlineAIAssist', () => ({
  InlineAIAssist: () => null,
}))

vi.mock('../../hooks/useAIMode', () => ({
  useAIMode: () => ({ isFeatureEnabled: () => false }),
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock('lucide-react', () => {
  const Icon = () => <span />

  return {
    Plus: Icon,
    X: Icon,
    Save: Icon,
    Trash2: Icon,
    Activity: Icon,
    Sparkles: Icon,
    CheckCircle: Icon,
    GripVertical: Icon,
    Eye: Icon,
    EyeOff: Icon,
    Maximize2: Icon,
    Minimize2: Icon,
    Server: Icon,
    Database: Icon,
    Cpu: Icon,
    MemoryStick: Icon,
    HardDrive: Icon,
    Zap: Icon,
    CheckCircle2: Icon,
    XCircle: Icon,
    AlertTriangle: Icon,
    BarChart3: Icon,
    Layers: Icon,
    Box: Icon,
    Shield: Icon,
    Lock: Icon,
    Globe: Icon,
    Cloud: Icon,
    GitBranch: Icon,
    Terminal: Icon,
    Code: Icon,
    Wifi: Icon,
    WifiOff: Icon,
    Clock: Icon,
    Users: Icon,
    Gauge: Icon,
    TrendingUp: Icon,
    TrendingDown: Icon,
    ArrowUpRight: Icon,
    Flame: Icon,
    HelpCircle: Icon,
  }
})

import * as StatBlockFactoryModalModule from './StatBlockFactoryModal'

describe('StatBlockFactoryModal Component', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_735_689_600_000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports StatBlockFactoryModal component', () => {
    expect(StatBlockFactoryModalModule.StatBlockFactoryModal).toBeDefined()
    expect(typeof StatBlockFactoryModalModule.StatBlockFactoryModal).toBe('function')
  })

  it('keeps the preview card count stable when editing a stat block label', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<StatBlockFactoryModalModule.StatBlockFactoryModal isOpen={true} onClose={vi.fn()} />)

    expect(screen.getAllByText('42')).toHaveLength(3)

    fireEvent.change(screen.getByDisplayValue('Total'), { target: { value: 'Totalav' } })

    expect(screen.getAllByText('42')).toHaveLength(3)
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('same key')
  })
})
