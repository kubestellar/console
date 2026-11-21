import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GPUSpecsPanel, NvidiaOperatorStatusPanel } from './GPUSpecsPanel'

describe('GPUSpecsPanel', () => {
  it('renders every spec card when data is present', () => {
    render(
      <GPUSpecsPanel
        gpuSpecs={{
          totalMemoryGB: 320,
          families: ['ampere', 'hopper'],
          cudaDriverVersions: ['535.104'],
          cudaRuntimeVersions: [],
          migCapableCount: 4,
        }}
      />,
    )
    expect(screen.getByText('320 GB')).toBeInTheDocument()
    expect(screen.getByText('ampere, hopper')).toBeInTheDocument()
    expect(screen.getByText('535.104')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('renders nothing for empty specs', () => {
    const { container } = render(
      <GPUSpecsPanel
        gpuSpecs={{ totalMemoryGB: 0, families: [], cudaDriverVersions: [], cudaRuntimeVersions: [], migCapableCount: 0 }}
      />,
    )
    expect(container.firstElementChild?.childElementCount).toBe(0)
  })
})

describe('NvidiaOperatorStatusPanel', () => {
  it('shows operator state, driver version and readiness styling', () => {
    render(
      <NvidiaOperatorStatusPanel
        operatorStatus={[
          {
            cluster: 'c1',
            gpuOperator: { installed: true, ready: true, state: 'ready', driverVersion: '550.1' },
            networkOperator: { installed: true, ready: false },
          },
        ]}
      />,
    )
    expect(screen.getByText('c1')).toBeInTheDocument()
    const gpu = screen.getByText(/GPU Operator: ready/)
    expect(gpu).toHaveTextContent('GPU Operator: ready (550.1)')
    expect(gpu).toHaveClass('text-green-400')
    const net = screen.getByText(/Network Operator:/)
    expect(net).toHaveTextContent('Network Operator: Not Ready')
    expect(net).toHaveClass('text-yellow-400')
  })

  it('omits operators that are not reported', () => {
    render(<NvidiaOperatorStatusPanel operatorStatus={[{ cluster: 'bare' }]} />)
    expect(screen.queryByText(/Operator:/)).not.toBeInTheDocument()
  })
})
