import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock cn to pass through class names
vi.mock('../../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { HeatMap, CalendarHeatMap } from '../HeatMap'

// ---------------------------------------------------------------------------
// HeatMap (grid-style)
// ---------------------------------------------------------------------------

describe('HeatMap', () => {
  const SAMPLE_DATA = [
    { x: 'A', y: 'Row1', value: 10 },
    { x: 'B', y: 'Row1', value: 50 },
    { x: 'A', y: 'Row2', value: 90 },
    { x: 'B', y: 'Row2', value: 30 },
  ]

  it('renders with empty data array', () => {
    const { container } = render(<HeatMap data={[]} />)
    expect(container).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(<HeatMap data={SAMPLE_DATA} title="My Heat Map" />)
    expect(screen.getByText('My Heat Map')).toBeTruthy()
  })

  it('does not render title when not provided', () => {
    const { container } = render(<HeatMap data={SAMPLE_DATA} />)
    const headings = container.querySelectorAll('h4')
    expect(headings.length).toBe(0)
  })

  it('derives x and y labels from data when not explicitly provided', () => {
    render(<HeatMap data={SAMPLE_DATA} />)
    // X labels
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('B')).toBeTruthy()
    // Y labels
    expect(screen.getByText('Row1')).toBeTruthy()
    expect(screen.getByText('Row2')).toBeTruthy()
  })

  it('uses explicit xLabels and yLabels when provided', () => {
    render(
      <HeatMap
        data={SAMPLE_DATA}
        xLabels={['Col1', 'Col2']}
        yLabels={['R1', 'R2']}
      />
    )
    expect(screen.getByText('Col1')).toBeTruthy()
    expect(screen.getByText('Col2')).toBeTruthy()
    expect(screen.getByText('R1')).toBeTruthy()
    expect(screen.getByText('R2')).toBeTruthy()
  })

  it('displays cell values when showValues is true', () => {
    const formatValue = (v: number) => `${v}u`
    render(
      <HeatMap data={SAMPLE_DATA} showValues formatValue={formatValue} />
    )
    // Values appear both in cell text and legend; use getAllByText
    expect(screen.getAllByText('10u').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('50u').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('90u').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('30u').length).toBeGreaterThanOrEqual(1)
  })

  it('does not render value divs inside cells when showValues is false', () => {
    const { container } = render(<HeatMap data={SAMPLE_DATA} />)
    // With showValues=false, no inner value divs should exist inside cells
    const valueDivs = container.querySelectorAll('.items-center.justify-center.text-xs.font-medium')
    expect(valueDivs.length).toBe(0)
  })

  it('renders color scale legend with min and max values', () => {
    render(<HeatMap data={SAMPLE_DATA} />)
    // Default formatValue is v.toString()
    expect(screen.getByText('10')).toBeTruthy() // min
    expect(screen.getByText('90')).toBeTruthy() // max
  })

  it('uses custom min and max when provided', () => {
    render(
      <HeatMap data={SAMPLE_DATA} min={0} max={100} />
    )
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('100')).toBeTruthy()
  })

  it('applies custom cellSize to cell styling', () => {
    const CUSTOM_CELL_SIZE = 60
    const { container } = render(
      <HeatMap data={[{ x: 'A', y: 'R', value: 5 }]} cellSize={CUSTOM_CELL_SIZE} />
    )
    // Cell width = cellSize - 2
    const EXPECTED_WIDTH = CUSTOM_CELL_SIZE - 2
    const cell = container.querySelector(`[style*="width: ${EXPECTED_WIDTH}px"]`)
    expect(cell).toBeTruthy()
  })

  it('handles all color scale options', () => {
    const scales = ['green', 'blue', 'purple', 'orange', 'red', 'gray'] as const
    for (const colorScale of scales) {
      const { container } = render(
        <HeatMap data={SAMPLE_DATA} colorScale={colorScale} />
      )
      expect(container).toBeTruthy()
    }
  })

  it('handles equal min and max (all same values)', () => {
    const sameData = [
      { x: 'A', y: 'R1', value: 42 },
      { x: 'B', y: 'R1', value: 42 },
    ]
    const { container } = render(<HeatMap data={sameData} />)
    // Should use middle color when min === max
    expect(container).toBeTruthy()
  })

  it('renders transparent background for missing cells', () => {
    // Data only has A-Row1, but grid is A,B x Row1,Row2
    const sparseData = [{ x: 'A', y: 'Row1', value: 10 }]
    const { container } = render(
      <HeatMap
        data={sparseData}
        xLabels={['A', 'B']}
        yLabels={['Row1', 'Row2']}
      />
    )
    // Missing cells get transparent background
    const transparentCells = container.querySelectorAll('[style*="background-color: transparent"]')
    // 3 of 4 cells are missing
    const EXPECTED_MISSING_CELLS = 3
    expect(transparentCells.length).toBe(EXPECTED_MISSING_CELLS)
  })

  it('sets title attributes on cells with values', () => {
    const { container } = render(<HeatMap data={SAMPLE_DATA} />)
    const cellWithTitle = container.querySelector('[title="A × Row1: 10"]')
    expect(cellWithTitle).toBeTruthy()
  })

  it('uses formatValue in cell title attributes', () => {
    const formatValue = (v: number) => `${v}%`
    const { container } = render(
      <HeatMap data={SAMPLE_DATA} formatValue={formatValue} />
    )
    const cellWithTitle = container.querySelector('[title="A × Row1: 10%"]')
    expect(cellWithTitle).toBeTruthy()
  })

  it('handles numeric x and y values in data', () => {
    const numericData = [
      { x: 1, y: 2, value: 100 },
      { x: 3, y: 4, value: 200 },
    ]
    const { container } = render(<HeatMap data={numericData} />)
    expect(container).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CalendarHeatMap
// ---------------------------------------------------------------------------

describe('CalendarHeatMap', () => {
  const today = new Date()
  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  const SAMPLE_CALENDAR_DATA = [
    { date: formatDate(today), value: 5 },
    { date: formatDate(new Date(today.getTime() - 86400000)), value: 3 },
    { date: formatDate(new Date(today.getTime() - 86400000 * 2)), value: 0 },
    { date: formatDate(new Date(today.getTime() - 86400000 * 7)), value: 10 },
  ]

  it('renders without crashing', () => {
    const { container } = render(
      <CalendarHeatMap data={SAMPLE_CALENDAR_DATA} />
    )
    expect(container).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(<CalendarHeatMap data={SAMPLE_CALENDAR_DATA} title="Contributions" />)
    expect(screen.getByText('Contributions')).toBeTruthy()
  })

  it('does not render title when not provided', () => {
    const { container } = render(
      <CalendarHeatMap data={SAMPLE_CALENDAR_DATA} />
    )
    const headings = container.querySelectorAll('h4')
    expect(headings.length).toBe(0)
  })

  it('renders Less and More legend labels', () => {
    render(<CalendarHeatMap data={SAMPLE_CALENDAR_DATA} />)
    expect(screen.getByText('Less')).toBeTruthy()
    expect(screen.getByText('More')).toBeTruthy()
  })

  it('accepts different color scales', () => {
    const scales = ['green', 'blue', 'purple', 'orange', 'red', 'gray'] as const
    for (const colorScale of scales) {
      const { container } = render(
        <CalendarHeatMap data={SAMPLE_CALENDAR_DATA} colorScale={colorScale} />
      )
      expect(container).toBeTruthy()
    }
  })

  it('accepts custom months parameter', () => {
    const SHORT_MONTHS = 3
    const { container } = render(
      <CalendarHeatMap data={SAMPLE_CALENDAR_DATA} months={SHORT_MONTHS} />
    )
    expect(container).toBeTruthy()
  })

  it('renders day label initials for odd rows', () => {
    render(<CalendarHeatMap data={SAMPLE_CALENDAR_DATA} />)
    // Mon, Wed, Fri show as M, W, F (odd indices 1, 3, 5)
    expect(screen.getByText('M')).toBeTruthy()
    expect(screen.getByText('W')).toBeTruthy()
    expect(screen.getByText('F')).toBeTruthy()
  })

  it('renders cells with title attributes showing date and value', () => {
    const { container } = render(
      <CalendarHeatMap data={SAMPLE_CALENDAR_DATA} />
    )
    // Each day cell should have a title
    const cellsWithTitle = container.querySelectorAll('[title]')
    expect(cellsWithTitle.length).toBeGreaterThan(0)
  })

  it('handles empty data array', () => {
    const { container } = render(<CalendarHeatMap data={[]} />)
    expect(container).toBeTruthy()
  })

  it('handles data with all zero values', () => {
    const zeroData = [
      { date: formatDate(today), value: 0 },
      { date: formatDate(new Date(today.getTime() - 86400000)), value: 0 },
    ]
    const { container } = render(<CalendarHeatMap data={zeroData} />)
    expect(container).toBeTruthy()
  })
})
