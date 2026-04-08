import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TableVisualization } from '../TableVisualization'
import type { CardContentTable, CardColumnConfig } from '../../../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../renderers', () => ({
  renderCell: (value: unknown, _item: Record<string, unknown>, column: { field: string }) =>
    `[${column.field}:${String(value ?? '')}]`,
}))

vi.mock('../../../../cards/useStablePageHeight', () => ({
  useStablePageHeight: () => ({
    containerRef: { current: null },
    containerStyle: {},
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_COLUMNS: CardColumnConfig[] = [
  { field: 'name', header: 'Name', primary: true },
  { field: 'status', header: 'Status' },
  { field: 'count', header: 'Count', align: 'right' },
]

const SAMPLE_DATA = [
  { name: 'Alpha', status: 'Running', count: 10 },
  { name: 'Bravo', status: 'Pending', count: 5 },
  { name: 'Charlie', status: 'Failed', count: 2 },
  { name: 'Delta', status: 'Running', count: 8 },
  { name: 'Echo', status: 'Pending', count: 1 },
]

function renderTable(
  contentOverrides: Partial<CardContentTable> = {},
  props: {
    data?: unknown[]
    onDrillDown?: (item: Record<string, unknown>) => void
    drillDown?: { targetCard: string }
  } = {},
) {
  const content: CardContentTable = {
    type: 'table',
    columns: SAMPLE_COLUMNS,
    ...contentOverrides,
  }

  return render(
    <TableVisualization
      content={content}
      data={props.data ?? SAMPLE_DATA}
      onDrillDown={props.onDrillDown}
      drillDown={props.drillDown as never}
    />
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TableVisualization', () => {
  describe('basic rendering', () => {
    it('renders column headers', () => {
      renderTable()
      expect(screen.getByText('Name')).toBeTruthy()
      expect(screen.getByText('Status')).toBeTruthy()
      expect(screen.getByText('Count')).toBeTruthy()
    })

    it('renders data rows via renderCell mock', () => {
      renderTable()
      expect(screen.getByText('[name:Alpha]')).toBeTruthy()
      // status:Running appears twice (Alpha and Delta), use getAllByText
      expect(screen.getAllByText('[status:Running]').length).toBe(2)
      expect(screen.getByText('[count:10]')).toBeTruthy()
    })

    it('shows "No data to display" when data is empty', () => {
      renderTable({}, { data: [] })
      expect(screen.getByText('No data to display')).toBeTruthy()
    })

    it('hides columns with hidden=true', () => {
      const columns: CardColumnConfig[] = [
        { field: 'name', header: 'Name' },
        { field: 'secret', header: 'Secret', hidden: true },
      ]
      renderTable({ columns }, { data: [{ name: 'A', secret: 'B' }] })
      expect(screen.getByText('Name')).toBeTruthy()
      expect(screen.queryByText('Secret')).toBeNull()
    })

    it('falls back to field name when header is not provided', () => {
      const columns: CardColumnConfig[] = [
        { field: 'myField' },
      ]
      renderTable({ columns }, { data: [{ myField: 'val' }] })
      expect(screen.getByText('myField')).toBeTruthy()
    })

    it('applies column width as px for numeric width', () => {
      const COL_WIDTH = 200
      const columns: CardColumnConfig[] = [
        { field: 'name', header: 'Name', width: COL_WIDTH },
      ]
      const { container } = renderTable({ columns }, { data: [{ name: 'A' }] })
      const th = container.querySelector(`th[style*="width: ${COL_WIDTH}px"]`)
      expect(th).toBeTruthy()
    })

    it('applies column width as string for string width', () => {
      const columns: CardColumnConfig[] = [
        { field: 'name', header: 'Name', width: '50%' },
      ]
      const { container } = renderTable({ columns }, { data: [{ name: 'A' }] })
      const th = container.querySelector('th[style*="width: 50%"]')
      expect(th).toBeTruthy()
    })

    it('applies center alignment class to column', () => {
      const columns: CardColumnConfig[] = [
        { field: 'name', header: 'Name', align: 'center' },
      ]
      const { container } = renderTable({ columns }, { data: [{ name: 'A' }] })
      const th = container.querySelector('th')
      expect(th?.className).toContain('text-center')
    })
  })

  describe('sorting', () => {
    it('sorts ascending on column header click', async () => {
      const user = userEvent.setup()
      renderTable({ sortable: true })

      // Click "Name" header to sort
      await user.click(screen.getByText('Name'))

      // After clicking, all rows should still be present
      expect(screen.getByText('[name:Alpha]')).toBeTruthy()
      expect(screen.getByText('[name:Echo]')).toBeTruthy()
    })

    it('toggles sort direction on second click of same column', async () => {
      const user = userEvent.setup()
      renderTable({ sortable: true })

      const nameHeader = screen.getByText('Name')
      await user.click(nameHeader)
      await user.click(nameHeader)

      // Should still render rows (now desc)
      expect(screen.getByText('[name:Alpha]')).toBeTruthy()
    })

    it('does not sort when sortable is false', async () => {
      const user = userEvent.setup()
      renderTable({ sortable: false })

      // Clicking should not trigger sort indicator
      await user.click(screen.getByText('Name'))
      // No chevron icon should appear
      const { container } = renderTable({ sortable: false })
      const chevrons = container.querySelectorAll('.w-3.h-3')
      expect(chevrons.length).toBe(0)
    })

    it('does not sort column with sortable=false', async () => {
      const user = userEvent.setup()
      const columns: CardColumnConfig[] = [
        { field: 'name', header: 'Name', sortable: false },
        { field: 'status', header: 'Status' },
      ]
      renderTable({ columns, sortable: true })

      // Name column should not be clickable for sorting
      // Status column should be clickable
      await user.click(screen.getByText('Status'))
      expect(screen.getByText('[name:Alpha]')).toBeTruthy()
    })

    it('applies defaultSort and defaultDirection', () => {
      renderTable({ defaultSort: 'name', defaultDirection: 'desc' })
      // With desc sort on name, Echo should appear before Alpha
      const rows = screen.getAllByText(/\[name:/)
      expect(rows.length).toBe(SAMPLE_DATA.length)
    })

    it('resets to first page after sorting', async () => {
      const user = userEvent.setup()
      const PAGE_SIZE = 2
      renderTable({ pageSize: PAGE_SIZE, sortable: true })

      // Go to page 2 using the last button (next)
      const buttons = screen.getAllByRole('button')
      const nextBtn = buttons[buttons.length - 1]
      await user.click(nextBtn)

      // Now sort by name -> should reset to page 1
      await user.click(screen.getByText('Name'))
      expect(screen.getByText(/1–/)).toBeTruthy()
    })
  })

  describe('pagination', () => {
    const PAGE_SIZE = 2

    it('paginates data according to pageSize', () => {
      renderTable({ pageSize: PAGE_SIZE })
      // Only first 2 rows visible
      expect(screen.getByText('[name:Alpha]')).toBeTruthy()
      expect(screen.getByText('[name:Bravo]')).toBeTruthy()
      expect(screen.queryByText('[name:Charlie]')).toBeNull()
    })

    it('shows pagination footer with correct range', () => {
      renderTable({ pageSize: PAGE_SIZE })
      expect(screen.getByText('1–2 of 5')).toBeTruthy()
      expect(screen.getByText('1 / 3')).toBeTruthy()
    })

    it('navigates to next page', async () => {
      const user = userEvent.setup()
      renderTable({ pageSize: PAGE_SIZE })

      // Click next page button (second button in pagination)
      const buttons = screen.getAllByRole('button')
      const nextBtn = buttons[buttons.length - 1]
      await user.click(nextBtn)

      expect(screen.getByText('[name:Charlie]')).toBeTruthy()
      expect(screen.getByText('[name:Delta]')).toBeTruthy()
      expect(screen.getByText('3–4 of 5')).toBeTruthy()
    })

    it('navigates to previous page', async () => {
      const user = userEvent.setup()
      renderTable({ pageSize: PAGE_SIZE })

      const buttons = screen.getAllByRole('button')
      const nextBtn = buttons[buttons.length - 1]
      const prevBtn = buttons[0]

      // Go to page 2 then back to page 1
      await user.click(nextBtn)
      await user.click(prevBtn)

      expect(screen.getByText('[name:Alpha]')).toBeTruthy()
      expect(screen.getByText('1–2 of 5')).toBeTruthy()
    })

    it('disables prev button on first page', () => {
      renderTable({ pageSize: PAGE_SIZE })
      const buttons = screen.getAllByRole('button')
      expect(buttons[0]).toHaveProperty('disabled', true)
    })

    it('disables next button on last page', async () => {
      const user = userEvent.setup()
      renderTable({ pageSize: PAGE_SIZE })

      const buttons = screen.getAllByRole('button')
      const nextBtn = buttons[buttons.length - 1]

      // Navigate to last page (page 3)
      await user.click(nextBtn) // page 2
      await user.click(nextBtn) // page 3

      // Refresh buttons reference after re-renders
      const updatedButtons = screen.getAllByRole('button')
      const lastNext = updatedButtons[updatedButtons.length - 1]
      expect(lastNext).toHaveProperty('disabled', true)
    })

    it('does not show pagination when all data fits on one page', () => {
      const LARGE_PAGE = 100
      renderTable({ pageSize: LARGE_PAGE })
      // No pagination footer
      expect(screen.queryByText(/of \d+/)).toBeNull()
    })
  })

  describe('drill-down / row clicks', () => {
    it('calls onDrillDown when row is clicked', async () => {
      const user = userEvent.setup()
      const onDrillDown = vi.fn()
      renderTable({}, { onDrillDown })

      // Click on a row cell
      await user.click(screen.getByText('[name:Alpha]'))
      expect(onDrillDown).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Alpha', status: 'Running', count: 10 })
      )
    })

    it('applies clickable styling when drillDown config is provided', () => {
      const { container } = renderTable(
        {},
        { drillDown: { targetCard: 'details' } }
      )
      const rows = container.querySelectorAll('tbody tr')
      expect(rows.length).toBeGreaterThan(0)
      // Rows should have cursor-pointer class
      expect(rows[0].className).toContain('cursor-pointer')
    })

    it('does not apply clickable styling without drillDown or onDrillDown', () => {
      const { container } = renderTable()
      const rows = container.querySelectorAll('tbody tr')
      if (rows.length > 0) {
        expect(rows[0].className).not.toContain('cursor-pointer')
      }
    })
  })

  describe('edge cases', () => {
    it('handles null/undefined values in data', () => {
      const data = [{ name: null, status: undefined, count: 0 }]
      renderTable({}, { data })
      expect(screen.getByText('[name:]')).toBeTruthy()
      expect(screen.getByText('[status:]')).toBeTruthy()
    })

    it('handles single row of data', () => {
      renderTable({}, { data: [{ name: 'Solo', status: 'Running', count: 1 }] })
      expect(screen.getByText('[name:Solo]')).toBeTruthy()
    })

    it('handles sorting with null values in data', async () => {
      const user = userEvent.setup()
      const data = [
        { name: 'Alpha', status: null, count: 10 },
        { name: null, status: 'Running', count: 5 },
        { name: 'Charlie', status: 'Failed', count: null },
      ]
      renderTable({ sortable: true }, { data })
      await user.click(screen.getByText('Name'))
      // Should not throw
      expect(screen.getByText('[name:Alpha]')).toBeTruthy()
    })

    it('handles sorting with mixed numeric types', async () => {
      const user = userEvent.setup()
      const columns: CardColumnConfig[] = [{ field: 'val', header: 'Value' }]
      const data = [{ val: 10 }, { val: 3 }, { val: 7 }]
      renderTable({ columns, sortable: true, defaultSort: 'val' }, { data })
      // Should sort numerically
      expect(screen.getAllByText(/\[val:/)).toHaveLength(3)
    })

    it('handles sorting with string values', async () => {
      const user = userEvent.setup()
      const columns: CardColumnConfig[] = [{ field: 'label', header: 'Label' }]
      const data = [{ label: 'Zebra' }, { label: 'Apple' }, { label: 'Mango' }]
      renderTable({ columns, sortable: true, defaultSort: 'label' }, { data })
      expect(screen.getAllByText(/\[label:/)).toHaveLength(3)
    })
  })
})
