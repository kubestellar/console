import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../../lib/analytics', () => ({
  emitInstallCommandCopied: vi.fn(),
}))

vi.mock('../../../lib/constants', () => ({
  COPY_FEEDBACK_TIMEOUT_MS: 2000,
}))

import { TabbedDeploySection } from '../TabbedDeploySection'
import type { InstallStep } from '../InstallStepCard'

const makeSteps = (prefix: string): InstallStep[] => [
  { step: 1, title: `${prefix} step 1`, commands: [`${prefix}-cmd`], description: `${prefix} desc` },
]

const BASE_PROPS = {
  accentColor: 'purple' as const,
  title: 'Get started in',
  subtitle: 'Pick your deployment target',
  localhostSteps: makeSteps('localhost'),
  portForwardSteps: makeSteps('port-forward'),
  ingressSteps: makeSteps('ingress'),
  analyticsSource: 'from_lens' as const,
}

describe('TabbedDeploySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title with "60 seconds" accent', () => {
    render(<TabbedDeploySection {...BASE_PROPS} />)
    expect(screen.getByText('60 seconds')).toBeTruthy()
    expect(screen.getByText(/Get started in/)).toBeTruthy()
  })

  it('renders subtitle', () => {
    render(<TabbedDeploySection {...BASE_PROPS} />)
    expect(screen.getByText('Pick your deployment target')).toBeTruthy()
  })

  it('renders three tab buttons', () => {
    render(<TabbedDeploySection {...BASE_PROPS} />)
    expect(screen.getByText('Localhost')).toBeTruthy()
    expect(screen.getAllByText('Cluster').length).toBe(2)
  })

  it('shows localhost steps by default', () => {
    render(<TabbedDeploySection {...BASE_PROPS} />)
    expect(screen.getByText('localhost step 1')).toBeTruthy()
  })

  it('switches to port-forward tab on click', () => {
    render(<TabbedDeploySection {...BASE_PROPS} />)
    // Click the port-forward tab (second "Cluster" button, with "port-forward" label)
    const clusterButtons = screen.getAllByText('Cluster')
    fireEvent.click(clusterButtons[0])
    expect(screen.getByText('port-forward step 1')).toBeTruthy()
  })

  it('switches to ingress tab on click', () => {
    render(<TabbedDeploySection {...BASE_PROPS} />)
    const clusterButtons = screen.getAllByText('Cluster')
    fireEvent.click(clusterButtons[1])
    expect(screen.getByText('ingress step 1')).toBeTruthy()
  })

  it('calls onTabSwitch callback', () => {
    const onTabSwitch = vi.fn()
    render(<TabbedDeploySection {...BASE_PROPS} onTabSwitch={onTabSwitch} />)
    const clusterButtons = screen.getAllByText('Cluster')
    fireEvent.click(clusterButtons[0])
    expect(onTabSwitch).toHaveBeenCalledWith('cluster-portforward')
  })

  it('does not call onTabSwitch when clicking active tab', () => {
    const onTabSwitch = vi.fn()
    render(<TabbedDeploySection {...BASE_PROPS} onTabSwitch={onTabSwitch} />)
    fireEvent.click(screen.getByText('Localhost'))
    expect(onTabSwitch).not.toHaveBeenCalled()
  })

  it('shows kubeconfig note for localhost tab', () => {
    render(<TabbedDeploySection {...BASE_PROPS} />)
    expect(screen.getByText(/~\/\.kube\/config/)).toBeTruthy()
  })

  it('shows cluster tips for cluster tabs', () => {
    render(<TabbedDeploySection {...BASE_PROPS} />)
    const clusterButtons = screen.getAllByText('Cluster')
    fireEvent.click(clusterButtons[0])
    expect(screen.getByText('TLS')).toBeTruthy()
    expect(screen.getByText('OAuth')).toBeTruthy()
    expect(screen.getByText('CORS')).toBeTruthy()
  })

  it('renders with teal accent', () => {
    const { container } = render(
      <TabbedDeploySection {...BASE_PROPS} accentColor="teal" />,
    )
    expect(container.innerHTML).toContain('teal')
  })
})
