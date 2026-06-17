import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LocalClusterControls } from './LocalClusterControls'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

let mockLocalClusters = [
  { name: 'kubeflex', tool: 'kind', status: 'running' as const },
  { name: 'minikube', tool: 'minikube', status: 'stopped' as const },
]

const mockClusterLifecycle = vi.fn<(...args: [string, string, 'start' | 'stop' | 'restart']) => Promise<void>>()

vi.mock('../../../hooks/useLocalClusterTools', () => ({
  useLocalClusterTools: () => ({
    clusterLifecycle: mockClusterLifecycle,
    clusters: mockLocalClusters,
  }),
}))

describe('LocalClusterControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalClusters = [
      { name: 'kubeflex', tool: 'kind', status: 'running' },
      { name: 'minikube', tool: 'minikube', status: 'stopped' },
    ]
    mockClusterLifecycle.mockResolvedValue(undefined)
  })

  it('renders null for unsupported providers', () => {
    const { container } = render(
      <LocalClusterControls
        clusterName="unsupported-cluster"
        provider="unsupported"
        unreachable={false}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders start button for stopped or unreachable clusters', () => {
    render(
      <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={true} />,
    )

    expect(screen.getByLabelText('cluster.startCluster')).toBeInTheDocument()
    expect(screen.queryByLabelText('cluster.stopCluster')).not.toBeInTheDocument()
    expect(screen.getByLabelText('cluster.restartCluster')).toBeInTheDocument()
  })

  it('renders stop button for reachable running clusters', () => {
    render(
      <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={false} />,
    )

    expect(screen.getByLabelText('cluster.stopCluster')).toBeInTheDocument()
    expect(screen.queryByLabelText('cluster.startCluster')).not.toBeInTheDocument()
  })

  it('calls clusterLifecycle with normalized kind cluster name', async () => {
    render(
      <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={false} />,
    )

    fireEvent.click(screen.getByLabelText('cluster.stopCluster'))

    await waitFor(() => {
      expect(mockClusterLifecycle).toHaveBeenCalledWith('kind', 'kubeflex', 'stop')
    })
  })

  it('maps k3s provider to k3d when no local cluster match exists', async () => {
    mockLocalClusters = []

    render(
      <LocalClusterControls clusterName="k3s-cluster" provider="k3s" unreachable={false} />,
    )

    fireEvent.click(screen.getByLabelText('cluster.stopCluster'))

    await waitFor(() => {
      expect(mockClusterLifecycle).toHaveBeenCalledWith('k3d', 'k3s-cluster', 'stop')
    })
  })

  it('disables controls when cluster is unreachable and not locally detected', () => {
    mockLocalClusters = [{ name: 'other', tool: 'kind', status: 'running' }]

    render(
      <LocalClusterControls clusterName="kind-missing" provider="kind" unreachable={true} />,
    )

    const [startButton, restartButton] = screen.getAllByLabelText('cluster.controlsDisabledOffline')

    expect(startButton).toBeDisabled()
    expect(restartButton).toBeDisabled()
  })

  it('stops click propagation when an action button is pressed', async () => {
    const parentClick = vi.fn()

    render(
      <div onClick={parentClick}>
        <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={false} />
      </div>,
    )

    fireEvent.click(screen.getByLabelText('cluster.stopCluster'))

    expect(parentClick).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(mockClusterLifecycle).toHaveBeenCalledWith('kind', 'kubeflex', 'stop')
    })
  })

  it('disables all controls while an action is in progress', async () => {
    let resolveAction: (() => void) | undefined
    mockClusterLifecycle.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve
        }),
    )

    render(
      <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={false} />,
    )

    const stopButton = screen.getByLabelText('cluster.stopCluster')
    const restartButton = screen.getByLabelText('cluster.restartCluster')

    fireEvent.click(stopButton)

    expect(stopButton).toBeDisabled()
    expect(restartButton).toBeDisabled()

    resolveAction?.()

    await waitFor(() => {
      expect(stopButton).not.toBeDisabled()
      expect(restartButton).not.toBeDisabled()
    })
  })
})
