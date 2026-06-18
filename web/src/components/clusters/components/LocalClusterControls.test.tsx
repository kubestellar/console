import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LocalClusterControls } from './LocalClusterControls'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockClusterLifecycle = vi.fn()
const mockClusters = [
  { name: 'kubeflex', tool: 'kind', status: 'running' },
  { name: 'minikube', tool: 'minikube', status: 'stopped' },
]

vi.mock('../../../hooks/useLocalClusterTools', () => ({
  useLocalClusterTools: () => ({
    clusterLifecycle: mockClusterLifecycle,
    clusters: mockClusters,
  }),
}))

describe('LocalClusterControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('renders start button for stopped kind cluster', () => {
    render(
      <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={true} />,
    )

    expect(screen.getByLabelText('cluster.startCluster')).toBeInTheDocument()
    expect(screen.queryByLabelText('cluster.stopCluster')).not.toBeInTheDocument()
  })

  it('renders stop button for running kind cluster', () => {
    render(
      <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={false} />,
    )

    expect(screen.queryByLabelText('cluster.startCluster')).not.toBeInTheDocument()
    expect(screen.getByLabelText('cluster.stopCluster')).toBeInTheDocument()
  })

  it('always renders restart button', () => {
    render(
      <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={false} />,
    )

    expect(screen.getByLabelText('cluster.restartCluster')).toBeInTheDocument()
  })

  it('calls clusterLifecycle with start action', async () => {
    render(
      <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={true} />,
    )

    const startButton = screen.getByLabelText('cluster.startCluster')
    fireEvent.click(startButton)

    await waitFor(() => {
      expect(mockClusterLifecycle).toHaveBeenCalledWith('kind', 'kubeflex', 'start')
    })
  })

  it('calls clusterLifecycle with stop action', async () => {
    render(
      <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={false} />,
    )

    const stopButton = screen.getByLabelText('cluster.stopCluster')
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(mockClusterLifecycle).toHaveBeenCalledWith('kind', 'kubeflex', 'stop')
    })
  })

  it('calls clusterLifecycle with restart action', async () => {
    render(
      <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={false} />,
    )

    const restartButton = screen.getByLabelText('cluster.restartCluster')
    fireEvent.click(restartButton)

    await waitFor(() => {
      expect(mockClusterLifecycle).toHaveBeenCalledWith('kind', 'kubeflex', 'restart')
    })
  })

  it('stops event propagation on button click', () => {
    const parentClick = vi.fn()
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        parentClick()
      }
    }
    const { container } = render(
      <div onClick={parentClick} onKeyDown={handleKeyDown} role="button" tabIndex={0}>
        <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={false} />
      </div>,
    )

    const stopButton = screen.getByLabelText('cluster.stopCluster')
    fireEvent.click(stopButton)

    expect(parentClick).not.toHaveBeenCalled()
  })

  it('disables controls when unreachable and not detected as local cluster', () => {
    const modifiedClusters = mockClusters.filter((c) => c.name !== 'kubeflex')
    vi.mocked(require('../../../hooks/useLocalClusterTools').useLocalClusterTools).mockReturnValue({
      clusterLifecycle: mockClusterLifecycle,
      clusters: modifiedClusters,
    })

    render(
      <LocalClusterControls clusterName="kind-unknown" provider="kind" unreachable={true} />,
    )

    const startButton = screen.getByLabelText('cluster.controlsDisabledOffline')
    expect(startButton).toBeDisabled()
  })

  it('disables all buttons while action is in progress', async () => {
    mockClusterLifecycle.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)))

    render(
      <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={false} />,
    )

    const stopButton = screen.getByLabelText('cluster.stopCluster')
    const restartButton = screen.getByLabelText('cluster.restartCluster')

    fireEvent.click(stopButton)

    expect(stopButton).toBeDisabled()
    expect(restartButton).toBeDisabled()

    await waitFor(() => {
      expect(stopButton).not.toBeDisabled()
      expect(restartButton).not.toBeDisabled()
    })
  })

  it('renders controls for minikube provider', () => {
    render(
      <LocalClusterControls clusterName="minikube" provider="minikube" unreachable={false} />,
    )

    expect(screen.getByLabelText('cluster.stopCluster')).toBeInTheDocument()
  })

  it('maps k3s provider to k3d tool', async () => {
    render(
      <LocalClusterControls clusterName="k3s-cluster" provider="k3s" unreachable={false} />,
    )

    const stopButton = screen.getByLabelText('cluster.stopCluster')
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(mockClusterLifecycle).toHaveBeenCalledWith('k3d', expect.any(String), 'stop')
    })
  })

  it('strips kind- prefix from cluster name when matching', async () => {
    render(
      <LocalClusterControls clusterName="kind-kubeflex" provider="kind" unreachable={false} />,
    )

    const stopButton = screen.getByLabelText('cluster.stopCluster')
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(mockClusterLifecycle).toHaveBeenCalledWith('kind', 'kubeflex', 'stop')
    })
  })
})
