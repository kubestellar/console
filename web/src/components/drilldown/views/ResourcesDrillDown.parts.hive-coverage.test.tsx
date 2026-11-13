import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClusterInfo } from '../../../hooks/useMCP'
import { SortableClusterRow } from './ResourcesDrillDown.parts'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

describe('SortableClusterRow', () => {
  it('opens a cluster on row click but not when using the drag handle', () => {
    const onDrillDown = vi.fn()
    const cluster = { name: 'provider/alpha', reachable: false, cpuCores: 8 } as ClusterInfo
    render(<SortableClusterRow cluster={cluster} cpuPercent={120} memoryPercent={50} memoryGB={1024} accelerators={[{ key: 'gpu', label: 'GPU', color: 'text-blue-400', data: { total: 4, allocated: 2 } }]} onDrillDown={onDrillDown} />)
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('resourcesDrillDown.offline')).toBeInTheDocument()
    expect(screen.getByText('120%')).toBeInTheDocument()
    expect(screen.getByText('1.0T')).toBeInTheDocument()
    expect(screen.getByText('2/4')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('resourcesDrillDown.dragToReorder'))
    expect(onDrillDown).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('alpha'))
    expect(onDrillDown).toHaveBeenCalledOnce()
  })
})
