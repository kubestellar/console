import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../useChaosMeshStatus', () => ({
  useChaosMeshStatus: () => ({
    data: {
      summary: { totalExperiments: 1, running: 1, finished: 0, failed: 0 },
      experiments: [{ name: 'demo-experiment', namespace: 'default', kind: 'PodChaos', phase: 'Running', startTime: '' }],
      workflows: [],
      health: 'healthy',
    },
    isRefreshing: false,
    error: false,
    consecutiveFailures: 0,
    showSkeleton: false,
    showEmptyState: false,
    isDemoData: false,
  }),
}))

import ChaosMeshStatus from '../index'

describe('ChaosMeshStatus', () => {
  it('renders without crashing and shows key status UI', () => {
    render(<ChaosMeshStatus />)
    expect(screen.getByText('chaosMeshStatus.totalExperiments')).toBeInTheDocument()
    expect(screen.getByText('chaosMeshStatus.sectionExperiments')).toBeInTheDocument()
    expect(screen.getByText('demo-experiment')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
  })
})
