import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeploymentOutputPanel } from './DeploymentOutputPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const base = { loading: false, output: null, loadingMessage: 'Loading logs...', notConnectedMessage: 'Connect the agent' }

describe('DeploymentOutputPanel', () => {
  it('shows the loading message', () => {
    render(<DeploymentOutputPanel {...base} loading output="ignored" />)
    expect(screen.getByText('Loading logs...')).toBeInTheDocument()
    expect(screen.queryByText('ignored')).not.toBeInTheDocument()
  })

  it('shows the not-connected state when there is no output', () => {
    render(<DeploymentOutputPanel {...base} />)
    expect(screen.getByText('drilldown.empty.localAgentNotConnected')).toBeInTheDocument()
    expect(screen.getByText('Connect the agent')).toBeInTheDocument()
  })

  it('omits the hint when notConnectedMessage is empty', () => {
    render(<DeploymentOutputPanel {...base} notConnectedMessage="" />)
    expect(screen.queryByText('Connect the agent')).not.toBeInTheDocument()
  })

  it('renders output without copy button by default', () => {
    render(<DeploymentOutputPanel {...base} output="line one" />)
    expect(screen.getByText('line one')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('replaces "No resources found" output with the custom message', () => {
    render(<DeploymentOutputPanel {...base} output="No resources found in ns." noResourcesMessage="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.queryByText('No resources found in ns.')).not.toBeInTheDocument()
  })

  it('copies output and reflects the copied state', async () => {
    const onCopy = vi.fn()
    const { rerender } = render(
      <DeploymentOutputPanel {...base} output="yaml: data" enableCopy copyField="yaml" copiedField={null} onCopy={onCopy} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Copy/ }))
    expect(onCopy).toHaveBeenCalledWith('yaml', 'yaml: data')
    rerender(<DeploymentOutputPanel {...base} output="yaml: data" enableCopy copyField="yaml" copiedField="yaml" onCopy={onCopy} />)
    expect(screen.getByRole('button', { name: /Copied/ })).toBeInTheDocument()
  })
})
