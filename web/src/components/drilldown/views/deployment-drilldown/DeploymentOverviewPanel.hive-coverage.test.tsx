import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeploymentOverviewPanel, type DeploymentOverviewPanelProps } from './DeploymentOverviewPanel'
import { MAX_SCALE_REPLICAS } from './types'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

function props(overrides: Partial<DeploymentOverviewPanelProps> = {}): DeploymentOverviewPanelProps {
  return {
    isHealthy: true,
    healthColors: { bg: 'bg-green', border: 'border-green' },
    replicas: 3,
    readyReplicas: 2,
    canScale: true,
    isScaling: false,
    scaleError: null,
    replicaSets: [],
    labels: null,
    onScaleDown: vi.fn(),
    onScaleUp: vi.fn(),
    onDrillToReplicaSet: vi.fn(),
    ...overrides,
  }
}

describe('DeploymentOverviewPanel', () => {
  it('shows health, readiness, reasons and scaling errors', () => {
    render(<DeploymentOverviewPanel {...props({ isHealthy: false, liveReason: 'Unavailable', liveMessage: 'Waiting for pods', scaleError: 'Scale failed' })} />)
    expect(screen.getByText('Degraded')).toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.getByText('Waiting for pods')).toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()
    expect(screen.getByText('67')).toHaveTextContent('67%')
    expect(screen.getByText('Scale failed')).toBeInTheDocument()
  })

  it('calls the appropriate scale actions when permitted', async () => {
    const p = props()
    render(<DeploymentOverviewPanel {...p} />)
    await userEvent.click(screen.getByTitle('Scale down to 2 replicas'))
    await userEvent.click(screen.getByTitle('Scale up to 4 replicas'))
    expect(p.onScaleDown).toHaveBeenCalledOnce()
    expect(p.onScaleUp).toHaveBeenCalledOnce()
  })

  it('disables scaling at the minimum and maximum replica counts', () => {
    const { rerender } = render(<DeploymentOverviewPanel {...props({ replicas: 0, readyReplicas: 0 })} />)
    expect(screen.getByTitle('Already at minimum (0 replicas)')).toBeDisabled()
    expect(screen.getByTitle('Scale up to 1 replica')).toBeEnabled()
    expect(screen.getByText('0', { selector: 'span' })).toHaveTextContent('0%')
    rerender(<DeploymentOverviewPanel {...props({ replicas: MAX_SCALE_REPLICAS })} />)
    expect(screen.getByTitle(`Maximum is ${MAX_SCALE_REPLICAS} replicas`)).toBeDisabled()
    expect(screen.getByTitle(`Scale down to ${MAX_SCALE_REPLICAS - 1} replicas`)).toBeEnabled()
  })

  it('disables both actions while checking permissions, denied, or scaling', () => {
    const { rerender } = render(<DeploymentOverviewPanel {...props({ canScale: null })} />)
    expect(screen.getByText('Checking permissions...')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(2)
    screen.getAllByRole('button').forEach(button => expect(button).toBeDisabled())
    rerender(<DeploymentOverviewPanel {...props({ canScale: false })} />)
    expect(screen.getByText('No permission to scale deployments in this namespace')).toBeInTheDocument()
    screen.getAllByRole('button').forEach(button => expect(button).toBeDisabled())
    rerender(<DeploymentOverviewPanel {...props({ isScaling: true })} />)
    expect(screen.getByText('Scaling deployment...')).toBeInTheDocument()
    screen.getAllByRole('button').forEach(button => expect(button).toBeDisabled())
  })

  it('opens the selected replica set and limits the displayed labels', async () => {
    const p = props({
      replicaSets: [{ name: 'app-old', ready: 0, replicas: 1 }, { name: 'app-new', ready: 2, replicas: 3 }],
      labels: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`key${i}`, `value${i}`])),
    })
    render(<DeploymentOverviewPanel {...p} />)
    expect(screen.getByText('2/3 ready')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /app-new/ }))
    expect(p.onDrillToReplicaSet).toHaveBeenCalledWith('app-new')
    expect(screen.getByText('key7=value7')).toBeInTheDocument()
    expect(screen.queryByText('key8=value8')).not.toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('omits empty replica sets and labels', () => {
    render(<DeploymentOverviewPanel {...props({ labels: {} })} />)
    expect(screen.queryByText('drilldown.fields.replicaSets')).not.toBeInTheDocument()
    expect(screen.queryByText('Labels')).not.toBeInTheDocument()
  })
})
