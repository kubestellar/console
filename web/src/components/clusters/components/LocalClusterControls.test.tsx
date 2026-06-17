import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../../hooks/useLocalClusterTools', () => ({
  useLocalClusterTools: () => ({
    clusterLifecycle: vi.fn(() => Promise.resolve()),
    clusters: [
      { name: 'test-cluster', status: 'running', tool: 'kind' },
    ],
  }),
}))

vi.mock('./ClusterGrid.common', () => ({
  ActionTooltipWrapper: ({ children, tooltip }: { children: React.ReactNode; tooltip: string }) => (
    <div data-tooltip={tooltip}>{children}</div>
  ),
}))

import { LocalClusterControls } from './LocalClusterControls'

describe('LocalClusterControls', () => {
  it('does not render for unsupported providers', () => {
    const { container } = render(
      <LocalClusterControls clusterName="test-cluster" provider="aks" unreachable={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders for kind provider', () => {
    const { getByTestId } = render(
      <LocalClusterControls clusterName="kind-test-cluster" provider="kind" unreachable={false} />
    )
    expect(getByTestId('local-cluster-start-button')).toBeTruthy()
  })

  it('renders for minikube provider', () => {
    const { getByTestId } = render(
      <LocalClusterControls clusterName="minikube" provider="minikube" unreachable={false} />
    )
    expect(getByTestId('local-cluster-start-button')).toBeTruthy()
  })

  it('renders for k3s provider (using k3d)', () => {
    const { getByTestId } = render(
      <LocalClusterControls clusterName="k3s-default" provider="k3s" unreachable={false} />
    )
    expect(getByTestId('local-cluster-start-button')).toBeTruthy()
  })

  it('shows start button when cluster is stopped', () => {
    const { getByTestId, queryByTestId } = render(
      <LocalClusterControls clusterName="kind-test-cluster" provider="kind" unreachable={true} />
    )
    expect(getByTestId('local-cluster-start-button')).toBeTruthy()
    expect(queryByTestId('local-cluster-stop-button')).toBeNull()
  })

  it('shows stop and restart buttons when cluster is running', () => {
    const { getByTestId, queryByTestId } = render(
      <LocalClusterControls clusterName="kind-test-cluster" provider="kind" unreachable={false} />
    )
    expect(getByTestId('local-cluster-stop-button')).toBeTruthy()
    expect(getByTestId('local-cluster-restart-button')).toBeTruthy()
    expect(queryByTestId('local-cluster-start-button')).toBeNull()
  })

  it('stops event propagation when clicking action buttons', () => {
    const parentClick = vi.fn()
    const { getByTestId } = render(
      <div onClick={parentClick}>
        <LocalClusterControls clusterName="kind-test-cluster" provider="kind" unreachable={false} />
      </div>
    )
    const stopButton = getByTestId('local-cluster-stop-button')
    fireEvent.click(stopButton)
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('calls clusterLifecycle with correct parameters when starting cluster', async () => {
    const mockLifecycle = vi.fn(() => Promise.resolve())
    vi.mocked(useLocalClusterTools).mockReturnValue({
      clusterLifecycle: mockLifecycle,
      clusters: [{ name: 'test-cluster', status: 'stopped', tool: 'kind' }],
    })

    const { getByTestId } = render(
      <LocalClusterControls clusterName="kind-test-cluster" provider="kind" unreachable={true} />
    )
    const startButton = getByTestId('local-cluster-start-button')
    await fireEvent.click(startButton)
    
    expect(mockLifecycle).toHaveBeenCalledWith('kind', 'test-cluster', 'start')
  })

  it('disables controls when cluster is unreachable and not detected locally', () => {
    vi.mocked(useLocalClusterTools).mockReturnValue({
      clusterLifecycle: vi.fn(() => Promise.resolve()),
      clusters: [],
    })

    const { container } = render(
      <LocalClusterControls clusterName="kind-test-cluster" provider="kind" unreachable={true} />
    )
    const tooltip = container.querySelector('[data-tooltip="cluster.controlsDisabledOffline"]')
    expect(tooltip).toBeTruthy()
  })

  it('shows action in progress state during lifecycle operations', async () => {
    const { getByTestId } = render(
      <LocalClusterControls clusterName="kind-test-cluster" provider="kind" unreachable={false} />
    )
    const stopButton = getByTestId('local-cluster-stop-button')
    fireEvent.click(stopButton)
    
    // Button should be disabled during action
    expect(stopButton).toHaveProperty('disabled', true)
  })
})
