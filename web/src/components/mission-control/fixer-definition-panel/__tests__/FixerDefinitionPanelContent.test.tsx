import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode, HTMLAttributes } from 'react'
import type { MissionControlState } from '../../types'

const mockShowToast = vi.fn()

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}))

vi.mock('../../../../lib/kubara', () => ({
  fetchKubaraCatalog: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../useMissionControl', () => ({
  getAssistantContentSinceLastUser: () => '',
}))

vi.mock('../fixerDefinitionPanel.constants', () => {
  const manualOption = {
    name: 'falco',
    displayName: 'Falco',
    reason: 'Runtime security',
    category: 'Security',
    priority: 'recommended' as const,
    dependencies: [] as string[],
  }

  return {
    buildStaticManualWorkloadOptions: () => [manualOption],
    findManualWorkloadOption: (options: typeof manualOption[], query: string) => options.find((option) => option.name === query.trim().toLowerCase()) ?? null,
    humanizeWorkloadName: (name: string) => name,
    MANUAL_WORKLOAD_SUGGESTION_LIMIT: 5,
    matchesManualWorkloadQuery: (option: typeof manualOption, query: string) => option.name.includes(query.trim().toLowerCase()),
    mergeManualWorkloadOptions: <T,>(previous: T[], next: T[]) => [...previous, ...next],
    PLACEHOLDER_EXAMPLES: ['Describe the fix'],
    TITLE_PLACEHOLDER_EXAMPLES: ['Suggested title'],
  }
})

vi.mock('../MissionSummarySidebar', () => ({
  MissionSummarySidebar: () => <div data-testid="mission-summary-sidebar" />,
}))

vi.mock('../ProjectDetailPanel', () => ({
  ProjectDetailPanel: () => <div data-testid="project-detail-panel" />,
}))

vi.mock('../FixerDefinitionForm', () => ({
  FixerDefinitionForm: ({
    onManualNameChange,
    onManualAdd,
    manualAddDisabled,
  }: {
    onManualNameChange: (value: string) => void
    onManualAdd: () => void
    manualAddDisabled: boolean
  }) => (
    <div>
      <button onClick={() => onManualNameChange('falco')}>set-manual-name</button>
      <button onClick={onManualAdd} disabled={manualAddDisabled}>manual-add</button>
    </div>
  ),
}))

vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { FixerDefinitionPanel } from '../FixerDefinitionPanelContent'

const baseState: MissionControlState = {
  phase: 'define',
  description: 'Investigate runtime security',
  title: 'Runtime security',
  projects: [],
  assignments: [],
  phases: [],
  overlay: 'architecture',
  deployMode: 'phased',
  targetClusters: [],
  aiStreaming: false,
  launchProgress: [],
}

describe('FixerDefinitionPanel', () => {
  beforeEach(() => {
    mockShowToast.mockReset()
  })

  it('shows a success toast after manually adding a project suggestion', () => {
    const onAddProject = vi.fn()

    render(
      <FixerDefinitionPanel
        state={baseState}
        onDescriptionChange={vi.fn()}
        onTitleChange={vi.fn()}
        onTargetClustersChange={vi.fn()}
        onAskAI={vi.fn()}
        onAddProject={onAddProject}
        onRemoveProject={vi.fn()}
        onUpdatePriority={vi.fn()}
        aiStreaming={false}
        planningMission={null}
        installedProjects={new Set()}
      />,
    )

    fireEvent.click(screen.getByText('set-manual-name'))
    fireEvent.click(screen.getByText('manual-add'))

    expect(onAddProject).toHaveBeenCalledWith(expect.objectContaining({
      name: 'falco',
      displayName: 'Falco',
      reason: 'Runtime security',
      category: 'Security',
      priority: 'recommended',
    }))
    expect(mockShowToast).toHaveBeenCalledWith('missionControl.projectAdded', 'success')
  })
})
