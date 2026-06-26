/** @vitest-environment jsdom */
import type { HTMLAttributes, ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FixerDefinitionPanel } from '../FixerDefinitionPanel'
import type { MissionControlState } from '../types'

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    availableClusters: ['prod-east', 'prod-west', 'staging'],
    clusterInfoMap: {
      'prod-east': { name: 'prod-east', healthy: true, reachable: true, nodeCount: 5 },
      'prod-west': { name: 'prod-west', healthy: true, reachable: true, nodeCount: 3 },
      staging: { name: 'staging', healthy: false, reachable: true, nodeCount: 1 },
    },
    selectedClusters: [],
    toggleCluster: vi.fn(),
    selectAllClusters: vi.fn(),
    deselectAllClusters: vi.fn(),
  }),
}))

type MotionDivProps = HTMLAttributes<HTMLDivElement> & { children?: ReactNode }
type ChildrenOnlyProps = { children?: ReactNode }

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: MotionDivProps) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: ChildrenOnlyProps) => <>{children}</>,
}))

const baseState: MissionControlState = {
  phase: 'define',
  description: 'Fix failing workloads',
  title: 'Stabilize workloads',
  projects: [],
  assignments: [],
  phases: [],
  overlay: 'architecture',
  deployMode: 'phased',
  targetClusters: [],
  aiStreaming: false,
  launchProgress: [],
}

function renderPanel(stateOverrides: Partial<MissionControlState> = {}) {
  return render(
    <FixerDefinitionPanel
      state={{ ...baseState, ...stateOverrides }}
      onDescriptionChange={vi.fn()}
      onTitleChange={vi.fn()}
      onTargetClustersChange={vi.fn()}
      onAskAI={vi.fn()}
      onAddProject={vi.fn()}
      onRemoveProject={vi.fn()}
      onUpdatePriority={vi.fn()}
      aiStreaming={false}
      planningMission={null}
    />
  )
}

describe('TargetClusterSelector keyboard accessibility', () => {
  it('toggles the dropdown from the trigger with keyboard controls', () => {
    renderPanel()

    const trigger = screen.getByRole('button', { name: /select target clusters/i })
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.keyDown(trigger, { key: ' ' })

    expect(screen.getByRole('listbox', { name: /target clusters/i })).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes on escape and returns focus to the trigger', () => {
    renderPanel({ targetClusters: ['prod-east'] })

    const trigger = screen.getByRole('button', { name: /edit target clusters, 1 selected/i })
    trigger.focus()

    fireEvent.keyDown(trigger, { key: 'Enter' })

    const option = screen.getByRole('option', { name: /prod-west/i })
    option.focus()
    fireEvent.keyDown(option, { key: 'Escape' })

    expect(screen.queryByRole('listbox', { name: /target clusters/i })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(trigger)
  })
})
