import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeploymentOutputPanel, type DeploymentOutputPanelProps } from './DeploymentOutputPanel'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

function props(overrides: Partial<DeploymentOutputPanelProps> = {}): DeploymentOutputPanelProps {
  return { loading: false, output: null, loadingMessage: 'Loading output', notConnectedMessage: 'Connect the agent', ...overrides }
}

describe('DeploymentOutputPanel', () => {
  it('prioritizes loading over output and copy controls', () => {
    render(<DeploymentOutputPanel {...props({ loading: true, output: 'existing output', enableCopy: true, copyField: 'yaml', onCopy: vi.fn() })} />)
    expect(screen.getByText('Loading output')).toBeInTheDocument()
    expect(screen.queryByText('existing output')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the disconnected state and optional guidance for empty output', () => {
    const { rerender } = render(<DeploymentOutputPanel {...props()} />)
    expect(screen.getByText('drilldown.empty.localAgentNotConnected')).toBeInTheDocument()
    expect(screen.getByText('Connect the agent')).toBeInTheDocument()
    rerender(<DeploymentOutputPanel {...props({ output: '', notConnectedMessage: '' })} />)
    expect(screen.getByText('drilldown.empty.localAgentNotConnected')).toBeInTheDocument()
    expect(screen.queryByText('Connect the agent')).not.toBeInTheDocument()
  })

  it('copies the original output and reflects the copied field', async () => {
    const onCopy = vi.fn()
    const p = props({ output: 'kind: Deployment\nname: app', enableCopy: true, copyField: 'yaml', onCopy })
    const { rerender } = render(<DeploymentOutputPanel {...p} />)
    expect(screen.getByText('kind: Deployment name: app')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(onCopy).toHaveBeenCalledWith('yaml', 'kind: Deployment\nname: app')
    rerender(<DeploymentOutputPanel {...p} copiedField="yaml" />)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    rerender(<DeploymentOutputPanel {...p} copiedField="other" />)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('shows a custom empty resource message but copies the original response', async () => {
    const onCopy = vi.fn()
    render(<DeploymentOutputPanel {...props({ output: 'No resources found in default namespace.', noResourcesMessage: 'No events yet', enableCopy: true, copyField: 'events', onCopy })} />)
    expect(screen.getByText('No events yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(onCopy).toHaveBeenCalledWith('events', 'No resources found in default namespace.')
  })

  it('only shows copy when enabled with a field and callback', () => {
    const onCopy = vi.fn()
    const { rerender } = render(<DeploymentOutputPanel {...props({ output: 'data', copyField: 'yaml', onCopy })} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<DeploymentOutputPanel {...props({ output: 'data', enableCopy: true, onCopy })} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<DeploymentOutputPanel {...props({ output: 'data', enableCopy: true, copyField: 'yaml' })} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
