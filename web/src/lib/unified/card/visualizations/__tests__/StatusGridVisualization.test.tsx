import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../stats/valueResolvers', () => ({
  resolveFieldPath: (data: unknown, path: string) => {
    if (data && typeof data === 'object' && path in (data as Record<string, unknown>)) {
      return (data as Record<string, unknown>)[path]
    }
    if (Array.isArray(data)) return data
    return undefined
  },
  formatValue: (v: unknown) => (v === undefined ? '-' : String(v)),
}))

import { StatusGridVisualization } from '../StatusGridVisualization'
import type { CardContentStatusGrid } from '../../../types'

function makeItem(
  id: string,
  label: string,
  valueSource: { type: 'field'; path: string } | { type: 'computed'; expression: string } | { type: 'count'; filter?: string },
  icon = 'Server',
  color = 'green',
) {
  return { id, label, icon, color, valueSource }
}

describe('StatusGridVisualization', () => {
  it('renders field-type items with resolved values', () => {
    const content: CardContentStatusGrid = {
      type: 'status-grid',
      items: [makeItem('1', 'Total Nodes', { type: 'field', path: 'nodeCount' })],
    }
    render(<StatusGridVisualization content={content} data={{ nodeCount: 42 }} />)
    expect(screen.getByText('Total Nodes')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders count-type items with array length', () => {
    const content: CardContentStatusGrid = {
      type: 'status-grid',
      items: [makeItem('1', 'Pod Count', { type: 'count' })],
    }
    render(<StatusGridVisualization content={content} data={[1, 2, 3]} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders count-type with filter', () => {
    const content: CardContentStatusGrid = {
      type: 'status-grid',
      items: [makeItem('1', 'Running', { type: 'count', filter: 'status=Running' })],
    }
    const data = [{ status: 'Running' }, { status: 'Pending' }, { status: 'Running' }]
    render(<StatusGridVisualization content={content} data={data} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders count-type returns 0 for non-array data', () => {
    const content: CardContentStatusGrid = {
      type: 'status-grid',
      items: [makeItem('1', 'Count', { type: 'count' })],
    }
    render(<StatusGridVisualization content={content} data="not-an-array" />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('renders computed-type with count expression', () => {
    const content: CardContentStatusGrid = {
      type: 'status-grid',
      items: [makeItem('1', 'Total', { type: 'computed', expression: 'count' })],
    }
    render(<StatusGridVisualization content={content} data={[1, 2, 3, 4]} />)
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('renders computed-type with unknown expression as dash', () => {
    const content: CardContentStatusGrid = {
      type: 'status-grid',
      items: [makeItem('1', 'Unknown', { type: 'computed', expression: 'sum(x)' })],
    }
    render(<StatusGridVisualization content={content} data={[1]} />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('hides values when showCounts is false', () => {
    const content: CardContentStatusGrid = {
      type: 'status-grid',
      items: [makeItem('1', 'Nodes', { type: 'field', path: 'nodeCount' })],
      showCounts: false,
    }
    render(<StatusGridVisualization content={content} data={{ nodeCount: 10 }} />)
    expect(screen.getByText('Nodes')).toBeInTheDocument()
    expect(screen.queryByText('10')).not.toBeInTheDocument()
  })

  it('uses correct grid columns class', () => {
    const content: CardContentStatusGrid = {
      type: 'status-grid',
      columns: 3,
      items: [makeItem('1', 'A', { type: 'field', path: 'a' })],
    }
    const { container } = render(<StatusGridVisualization content={content} data={{ a: 1 }} />)
    expect(container.firstElementChild?.classList.contains('grid-cols-3')).toBe(true)
  })

  it('defaults to grid-cols-2 for unknown column count', () => {
    const content: CardContentStatusGrid = {
      type: 'status-grid',
      columns: 99 as number,
      items: [makeItem('1', 'A', { type: 'field', path: 'a' })],
    }
    const { container } = render(<StatusGridVisualization content={content} data={{ a: 1 }} />)
    expect(container.firstElementChild?.classList.contains('grid-cols-2')).toBe(true)
  })

  it('falls back to Box icon for unknown icon name', () => {
    const content: CardContentStatusGrid = {
      type: 'status-grid',
      items: [makeItem('1', 'Custom', { type: 'field', path: 'x' }, 'NonExistentIcon', 'purple')],
    }
    // Should render without error (falls back to Box)
    const { container } = render(<StatusGridVisualization content={content} data={{ x: 5 }} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders columns 1 and 4', () => {
    for (const cols of [1, 4]) {
      const content: CardContentStatusGrid = {
        type: 'status-grid',
        columns: cols,
        items: [makeItem('1', 'A', { type: 'field', path: 'a' })],
      }
      const { container } = render(<StatusGridVisualization content={content} data={{ a: 1 }} />)
      expect(container.firstElementChild?.classList.contains(`grid-cols-${cols}`)).toBe(true)
    }
  })
})
