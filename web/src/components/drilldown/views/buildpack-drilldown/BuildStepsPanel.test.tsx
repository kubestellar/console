import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BuildStepsPanel } from './BuildStepsPanel'
import type { KpackBuild } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const makeBuild = (name: string, ts: string, status?: 'True' | 'False' | 'Unknown', reason?: string): KpackBuild => ({
  metadata: { name, creationTimestamp: ts },
  status: status ? { conditions: [{ type: 'Succeeded', status, reason }] } : undefined,
})

describe('BuildStepsPanel', () => {
  it('renders a spinner while loading', () => {
    const { container } = render(<BuildStepsPanel buildsLoading builds={[]} />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('drilldown.buildpack.noBuilds')).not.toBeInTheDocument()
  })

  it('renders the empty state when there are no builds', () => {
    render(<BuildStepsPanel buildsLoading={false} builds={[]} />)
    expect(screen.getByText('drilldown.buildpack.noBuilds')).toBeInTheDocument()
    expect(screen.getByText('drilldown.buildpack.connectAgentBuilds')).toBeInTheDocument()
  })

  it('sorts builds newest first and maps statuses', () => {
    const builds = [
      makeBuild('build-old', '2024-01-01T00:00:00Z', 'False', 'StepFailed'),
      makeBuild('build-new', '2024-03-01T00:00:00Z', 'True', 'AllGood'),
      makeBuild('build-mid', '2024-02-01T00:00:00Z', 'Unknown'),
      makeBuild('build-none', '2023-01-01T00:00:00Z'),
    ]
    render(<BuildStepsPanel buildsLoading={false} builds={builds} />)
    const names = screen.getAllByText(/^build-/).map(el => el.textContent)
    expect(names).toEqual(['build-new', 'build-mid', 'build-old', 'build-none'])
    expect(screen.getByText('Success')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getAllByText('Building')).toHaveLength(2)
    expect(screen.getByText('AllGood')).toBeInTheDocument()
    expect(screen.getByText('StepFailed')).toBeInTheDocument()
    expect(screen.getAllByText('Build triggered')).toHaveLength(2)
    expect(screen.getByText('4')).toBeInTheDocument()
  })
})
