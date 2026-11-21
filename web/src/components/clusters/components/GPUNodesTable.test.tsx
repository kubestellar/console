import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { GPUNodesTable } from './GPUNodesTable'
import type { GPUNode } from '../../../hooks/useMCP'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const node = (overrides: Partial<GPUNode>): GPUNode => ({
  name: 'node-a',
  cluster: 'c1',
  gpuType: 'NVIDIA A100',
  gpuCount: 8,
  gpuAllocated: 2,
  ...overrides,
})

describe('GPUNodesTable', () => {
  it('renders a row per node with used/available/total counts and memory in GB', () => {
    render(<GPUNodesTable gpuNodes={[node({ gpuMemoryMB: 81920, gpuFamily: 'ampere', migCapable: true })]} />)
    const row = screen.getByText('node-a').closest('tr') as HTMLElement
    const cells = within(row).getAllByRole('cell')
    expect(cells[1]).toHaveTextContent('c1')
    expect(cells[2]).toHaveTextContent('NVIDIA A100(ampere)')
    expect(cells[3]).toHaveTextContent('80GB')
    expect(cells[4]).toHaveTextContent('2')
    expect(cells[5]).toHaveTextContent('6')
    expect(cells[6]).toHaveTextContent('8')
    expect(within(row).getByText('MIG')).toBeInTheDocument()
  })

  it('shows a dash for unknown memory and omits MIG badge', () => {
    render(<GPUNodesTable gpuNodes={[node({})]} />)
    const row = screen.getByText('node-a').closest('tr') as HTMLElement
    expect(within(row).getAllByRole('cell')[3]).toHaveTextContent('-')
    expect(within(row).queryByText('MIG')).not.toBeInTheDocument()
  })

  it('colors used count by utilization and tolerates zero-GPU nodes', () => {
    render(
      <GPUNodesTable
        gpuNodes={[
          node({ name: 'hot', gpuCount: 10, gpuAllocated: 10 }),
          node({ name: 'empty', gpuCount: 0, gpuAllocated: 0 }),
        ]}
      />,
    )
    const used = (name: string) =>
      within(screen.getByText(name).closest('tr') as HTMLElement).getAllByRole('cell')[4]
    expect(used('hot').className).toContain('text-red-400')
    expect(used('empty').className).toContain('text-green-400')
  })
})
