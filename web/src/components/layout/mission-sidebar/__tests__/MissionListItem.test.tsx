import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Mission } from '../../../../hooks/useMissions'
import { MissionListItem } from '../MissionListItem'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; progress?: number }) => {
      if (options?.defaultValue) {
        return options.defaultValue.replace('{{progress}}', String(options.progress ?? ''))
      }
      return key
    },
  }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}))

vi.mock('../../../../lib/modals', () => ({
  ConfirmDialog: ({ isOpen, title, confirmLabel, onConfirm }: { isOpen: boolean; title: string; confirmLabel: string; onConfirm: () => void }) => (
    isOpen ? (
      <div>
        <span>{title}</span>
        <button type="button" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    ) : null
  ),
}))

function createMission(overrides: Partial<Mission> = {}): Mission {
  const now = new Date('2026-01-01T10:00:00Z')

  return {
    id: 'mission-1',
    title: 'Fix cluster policies',
    description: 'Resolve conflicting admission rules',
    type: 'repair',
    status: 'running',
    progress: 42,
    cluster: 'cluster-a',
    currentStep: 'Validating policies',
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const baseProps = {
  mission: createMission(),
  isActive: false,
  onClick: vi.fn(),
  onDismiss: vi.fn(),
  onExpand: vi.fn(),
  onTerminate: vi.fn(),
  onRollback: vi.fn(),
  isCollapsed: false,
  onToggleCollapse: vi.fn(),
}

describe('MissionListItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders mission details and invokes selection and expand controls', () => {
    render(<MissionListItem {...baseProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'Fix cluster policies' }))
    fireEvent.click(screen.getByTitle('layout.missionSidebar.expandToFullScreen'))

    expect(screen.getByText('Resolve conflicting admission rules')).toBeInTheDocument()
    expect(screen.getByText('Validating policies')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByText('@cluster-a')).toBeInTheDocument()
    expect(baseProps.onClick).toHaveBeenCalled()
    expect(baseProps.onExpand).toHaveBeenCalled()
  })

  it('toggles collapsed state and hides the detail panel when collapsed', () => {
    const { rerender } = render(<MissionListItem {...baseProps} />)

    fireEvent.click(screen.getByTitle('common.collapse'))
    expect(baseProps.onToggleCollapse).toHaveBeenCalledTimes(1)

    rerender(<MissionListItem {...baseProps} isCollapsed />)
    expect(screen.queryByText('Resolve conflicting admission rules')).not.toBeInTheDocument()
    expect(screen.getByTitle('common.expand')).toBeInTheDocument()
  })

  it('shows terminate control for active missions', () => {
    render(<MissionListItem {...baseProps} mission={createMission({ status: 'blocked' })} />)

    fireEvent.click(screen.getByTestId('terminate-session-list-btn'))

    expect(baseProps.onTerminate).toHaveBeenCalledTimes(1)
  })

  it('confirms rollback for failed missions with history', () => {
    const failedMission = createMission({
      status: 'failed',
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Rollback needed',
          timestamp: new Date('2026-01-01T10:05:00Z'),
        },
      ],
    })

    render(<MissionListItem {...baseProps} mission={failedMission} onTerminate={undefined} />)

    fireEvent.click(screen.getByTestId('rollback-mission-btn'))
    fireEvent.click(screen.getByRole('button', { name: 'Rollback' }))

    expect(baseProps.onRollback).toHaveBeenCalledWith(failedMission)
  })
})
