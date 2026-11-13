import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeploymentOverviewPanel } from './DeploymentOverviewPanel'
import type { DeploymentOverviewPanelProps } from './DeploymentOverviewPanel'
import { MAX_SCALE_REPLICAS } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../charts/StatusIndicator', () => ({
  StatusIndicator: ({ status }: { status: string }) => <span data-testid="status-indicator">{status}</span>,
}))
vi.mock('../../../charts/Gauge', () => ({
  Gauge: ({ value }: { value: number }) => <span data-testid="gauge">{value}</span>,
}))

function setup(overrides: Partial<DeploymentOverviewPanelProps> = {}) {
  const props: DeploymentOverviewPanelProps = {
    isHealthy: true,
    healthColors: { bg: 'bg-green-500/10', border: 'border-green-500/20' },
    replicas: 3,
    readyReplicas: 3,
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
  render(<DeploymentOverviewPanel {...props} />)
  return props
}

describe('DeploymentOverviewPanel', () => {
  it('renders healthy state with replica gauge', () => {
    setup()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByTestId('status-indicator')).toHaveTextContent('healthy')
    expect(screen.getByTestId('gauge')).toHaveTextContent('100')
    expect(screen.getByText('3/3')).toBeInTheDocument()
    expect(screen.getByText('Click +/- to scale (0-' + MAX_SCALE_REPLICAS + ' replicas)')).toBeInTheDocument()
  })

  it('renders degraded state with reason, message and zero gauge for zero replicas', () => {
    setup({ isHealthy: false, replicas: 0, readyReplicas: 0, liveReason: 'MinimumReplicasUnavailable', liveMessage: 'Deployment lacks replicas' })
    expect(screen.getByText('Degraded')).toBeInTheDocument()
    expect(screen.getByTestId('status-indicator')).toHaveTextContent('warning')
    expect(screen.getByTestId('gauge')).toHaveTextContent('0')
    expect(screen.getByText('MinimumReplicasUnavailable')).toBeInTheDocument()
    expect(screen.getByText('Deployment lacks replicas')).toBeInTheDocument()
  })

  it('scales up and down via buttons', async () => {
    const props = setup()
    await userEvent.click(screen.getByTitle('Scale down to 2 replicas'))
    await userEvent.click(screen.getByTitle('Scale up to 4 replicas'))
    expect(props.onScaleDown).toHaveBeenCalledTimes(1)
    expect(props.onScaleUp).toHaveBeenCalledTimes(1)
  })

  it('disables scale down at zero and scale up at the maximum', () => {
    setup({ replicas: 0, readyReplicas: 0 })
    expect(screen.getByTitle('Already at minimum (0 replicas)')).toBeDisabled()
  })

  it('disables scale up at max replicas', () => {
    setup({ replicas: MAX_SCALE_REPLICAS, readyReplicas: MAX_SCALE_REPLICAS })
    expect(screen.getByTitle('Maximum is ' + MAX_SCALE_REPLICAS + ' replicas')).toBeDisabled()
  })

  it('shows permission warning when canScale is false', () => {
    setup({ canScale: false })
    expect(screen.getAllByText('No permission to scale deployments in this namespace').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('No permission to scale deployments in this namespace')).toHaveLength(2)
  })

  it('shows permission check state when canScale is null', () => {
    setup({ canScale: null })
    expect(screen.getByText('Checking permissions...')).toBeInTheDocument()
  })

  it('shows scaling state and scale error', () => {
    setup({ isScaling: true, scaleError: 'scale failed' })
    expect(screen.getByText('Scaling deployment...')).toBeInTheDocument()
    expect(screen.getByText('scale failed')).toBeInTheDocument()
    expect(screen.getAllByTitle('Scaling in progress...')).toHaveLength(2)
  })

  it('renders replica sets and drills on click', async () => {
    const props = setup({ replicaSets: [{ name: 'web-abc', replicas: 3, ready: 2 }] })
    expect(screen.getByText('drilldown.fields.replicaSets')).toBeInTheDocument()
    expect(screen.getByText('2/3 ready')).toBeInTheDocument()
    await userEvent.click(screen.getByText('web-abc'))
    expect(props.onDrillToReplicaSet).toHaveBeenCalledWith('web-abc')
  })

  it('renders at most 8 labels with an overflow count', () => {
    const labels = Object.fromEntries(Array.from({ length: 10 }, (_, i) => ['k' + i, 'v' + i]))
    setup({ labels })
    expect(screen.getByText('k0=v0')).toBeInTheDocument()
    expect(screen.getByText('k7=v7')).toBeInTheDocument()
    expect(screen.queryByText('k8=v8')).not.toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('omits labels section when labels are null or empty', () => {
    setup({ labels: {} })
    expect(screen.queryByText('Labels')).not.toBeInTheDocument()
  })
})
