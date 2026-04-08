import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListVisualization } from '../ListVisualization'
import type { CardContentList, CardColumnConfig } from '../../../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../renderers', () => ({
  renderCell: (value: unknown, _item: Record<string, unknown>, column: { field: string }) =>
    `[${column.field}:${String(value ?? '')}]`,
}))

vi.mock('../../../../cards/CardComponents', () => ({
  CardAIActions: () => <div data-testid="ai-actions" />,
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
  { field: 'count', header: 'Count' },
]

const SAMPLE_DATA = [
  { name: 'Alpha', status: 'Running', count: 10 },
  { name: 'Bravo', status: 'Pending', count: 5 },
  { name: 'Charlie', status: 'Failed', count: 2 },
  { name: 'Delta', status: 'Running', count: 8 },
  { name: 'Echo', status: 'Pending', count: 1 },
]

function renderList(
  contentOverrides: Partial<CardContentList> = {},
  props: { data?: unknown[]; onDrillDown?: (item: Record<string, unknown>) => void } = {},
) {
  const content: CardContentList = {
    type: 'list',
    columns: SAMPLE_COLUMNS,
    ...contentOverrides,
  }
  return render(
    <ListVisualization
      content={content}
      data={props.data ?? SAMPLE_DATA}
      drillDown={contentOverrides.itemClick === 'drill' ? { targetCard: 'detail' } : undefined}
      onDrillDown={props.onDrillDown}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ListVisualization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Basic rendering
  // -------------------------------------------------------------------------
  describe('basic rendering', () => {
    it('renders all data items', () => {
      renderList()
      // renderCell mock outputs [field:value] so we can search for each item
      expect(screen.getByText('[name:Alpha]')).toBeInTheDocument()
      expect(screen.getByText('[name:Bravo]')).toBeInTheDocument()
      expect(screen.getByText('[name:Charlie]')).toBeInTheDocument()
    })

    it('renders all visible columns for each row', () => {
      renderList()
      // 'Running' appears in multiple rows; use getAllByText
      expect(screen.getAllByText('[status:Running]').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('[count:10]')).toBeInTheDocument()
    })

    it('shows empty message when data is empty', () => {
      renderList({}, { data: [] })
      expect(screen.getByText('No items to display')).toBeInTheDocument()
    })

    it('hides columns marked as hidden', () => {
      const columns: CardColumnConfig[] = [
        { field: 'name', header: 'Name' },
        { field: 'secret', header: 'Secret', hidden: true },
      ]
      renderList(
        { columns },
        { data: [{ name: 'Foo', secret: 'bar' }] },
      )

      expect(screen.getByText('[name:Foo]')).toBeInTheDocument()
      expect(screen.queryByText('[secret:bar]')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Row numbers
  // -------------------------------------------------------------------------
  describe('row numbers', () => {
    it('shows row numbers when showRowNumbers is true', () => {
      renderList({ showRowNumbers: true, pageSize: 10 })
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('does not show row numbers by default', () => {
      renderList({ pageSize: 10 })
      // Row number '1' might appear in data; check that there is no dedicated row-number element
      // The mock outputs [field:value], so raw '1' should not appear if not enabled
      const allText = screen.queryAllByText('1')
      // count:1 would render as [count:1], not bare '1'
      expect(allText).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------
  describe('pagination', () => {
    const PAGE_SIZE = 2

    it('paginates data and shows page controls', () => {
      renderList({ pageSize: PAGE_SIZE })

      // Should show first page items
      expect(screen.getByText('[name:Alpha]')).toBeInTheDocument()
      expect(screen.getByText('[name:Bravo]')).toBeInTheDocument()
      // Third item should NOT be visible on first page
      expect(screen.queryByText('[name:Charlie]')).not.toBeInTheDocument()

      // Should show pagination info
      expect(screen.getByText(/1–2 of 5/)).toBeInTheDocument()
      expect(screen.getByText('1 / 3')).toBeInTheDocument()
    })

    it('navigates to next page', async () => {
      const user = userEvent.setup()
      renderList({ pageSize: PAGE_SIZE })

      // Click next page button (ChevronRight)
      const buttons = screen.getAllByRole('button')
      const nextButton = buttons[buttons.length - 1]
      await user.click(nextButton)

      expect(screen.getByText('[name:Charlie]')).toBeInTheDocument()
      expect(screen.getByText('[name:Delta]')).toBeInTheDocument()
      expect(screen.queryByText('[name:Alpha]')).not.toBeInTheDocument()
      expect(screen.getByText('2 / 3')).toBeInTheDocument()
    })

    it('navigates to previous page', async () => {
      const user = userEvent.setup()
      renderList({ pageSize: PAGE_SIZE })

      const buttons = screen.getAllByRole('button')
      const nextButton = buttons[buttons.length - 1]
      const prevButton = buttons[buttons.length - 2]

      // Go to page 2
      await user.click(nextButton)
      expect(screen.getByText('2 / 3')).toBeInTheDocument()

      // Go back to page 1
      await user.click(prevButton)
      expect(screen.getByText('1 / 3')).toBeInTheDocument()
      expect(screen.getByText('[name:Alpha]')).toBeInTheDocument()
    })

    it('disables prev button on first page', () => {
      renderList({ pageSize: PAGE_SIZE })
      const buttons = screen.getAllByRole('button')
      const prevButton = buttons[buttons.length - 2]
      expect(prevButton).toBeDisabled()
    })

    it('disables next button on last page', async () => {
      const user = userEvent.setup()
      renderList({ pageSize: PAGE_SIZE })

      const buttons = screen.getAllByRole('button')
      const nextButton = buttons[buttons.length - 1]

      // Navigate to last page (page 3)
      await user.click(nextButton)
      await user.click(nextButton)
      expect(screen.getByText('3 / 3')).toBeInTheDocument()

      // Re-query buttons after re-render
      const updatedButtons = screen.getAllByRole('button')
      const updatedNext = updatedButtons[updatedButtons.length - 1]
      expect(updatedNext).toBeDisabled()
    })

    it('does not show pagination when all items fit on one page', () => {
      renderList({ pageSize: 10 })
      // No pagination text should appear
      expect(screen.queryByText(/of 5/)).not.toBeInTheDocument()
    })

    it('shows correct row numbers across pages', async () => {
      const user = userEvent.setup()
      renderList({ pageSize: PAGE_SIZE, showRowNumbers: true })

      // Page 1: rows 1, 2
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()

      // Go to page 2
      const buttons = screen.getAllByRole('button')
      const nextButton = buttons[buttons.length - 1]
      await user.click(nextButton)

      // Page 2: rows 3, 4
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Sorting
  // -------------------------------------------------------------------------
  describe('sorting', () => {
    it('renders sort controls when sortable is true', () => {
      renderList({ sortable: true })
      expect(screen.getByText('Sort by...')).toBeInTheDocument()
    })

    it('does not render sort controls when sortable is false', () => {
      renderList({ sortable: false })
      expect(screen.queryByText('Sort by...')).not.toBeInTheDocument()
    })

    it('sorts data ascending by selected field', async () => {
      const user = userEvent.setup()
      renderList({ sortable: true, pageSize: 10 })

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'name')

      // After selecting sort field, data should be sorted ascending by name
      const items = screen.getAllByText(/\[name:/)
      expect(items[0].textContent).toBe('[name:Alpha]')
      expect(items[1].textContent).toBe('[name:Bravo]')
      expect(items[2].textContent).toBe('[name:Charlie]')
    })

    it('toggles sort direction', async () => {
      const user = userEvent.setup()
      renderList({ sortable: true, pageSize: 10 })

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'name')

      // Should show Asc button
      const ascButton = screen.getByTitle(/Ascending/)
      expect(ascButton).toBeInTheDocument()

      // Click to toggle to descending
      await user.click(ascButton)
      const descButton = screen.getByTitle(/Descending/)
      expect(descButton).toBeInTheDocument()

      // Data should now be sorted descending
      const items = screen.getAllByText(/\[name:/)
      expect(items[0].textContent).toBe('[name:Echo]')
      expect(items[items.length - 1].textContent).toBe('[name:Alpha]')
    })

    it('sorts numbers correctly', async () => {
      const user = userEvent.setup()
      renderList({ sortable: true, pageSize: 10 })

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'count')

      // Ascending: 1, 2, 5, 8, 10
      const items = screen.getAllByText(/\[count:/)
      expect(items[0].textContent).toBe('[count:1]')
      expect(items[4].textContent).toBe('[count:10]')
    })

    it('uses custom sort options when provided', () => {
      renderList({
        sortable: true,
        sortOptions: [
          { field: 'name', label: 'By Name' },
          { field: 'count', label: 'By Count' },
        ],
      })

      // Should have the custom labels
      const select = screen.getByRole('combobox')
      expect(within(select).getByText('By Name')).toBeInTheDocument()
      expect(within(select).getByText('By Count')).toBeInTheDocument()
    })

    it('applies defaultSort and defaultDirection', () => {
      renderList({
        sortable: true,
        defaultSort: 'count',
        defaultDirection: 'desc',
        pageSize: 10,
      })

      // Data should be pre-sorted descending by count: 10, 8, 5, 2, 1
      const items = screen.getAllByText(/\[count:/)
      expect(items[0].textContent).toBe('[count:10]')
      expect(items[4].textContent).toBe('[count:1]')
    })

    it('resets to first page on sort change', async () => {
      const user = userEvent.setup()
      const PAGE_SIZE = 2
      renderList({ sortable: true, pageSize: PAGE_SIZE })

      // Go to page 2
      const buttons = screen.getAllByRole('button')
      const nextButton = buttons[buttons.length - 1]
      await user.click(nextButton)
      expect(screen.getByText('2 / 3')).toBeInTheDocument()

      // Change sort field
      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'name')

      // Should reset to page 1
      expect(screen.getByText('1 / 3')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Drill-down / click
  // -------------------------------------------------------------------------
  describe('drill-down click', () => {
    it('calls onDrillDown when item is clicked with itemClick=drill', async () => {
      const user = userEvent.setup()
      const onDrillDown = vi.fn()
      renderList(
        { itemClick: 'drill', pageSize: 10 },
        { onDrillDown },
      )

      // Click first item row
      await user.click(screen.getByText('[name:Alpha]'))
      expect(onDrillDown).toHaveBeenCalledWith(SAMPLE_DATA[0])
    })

    it('does not call onDrillDown when itemClick=none', async () => {
      const user = userEvent.setup()
      const onDrillDown = vi.fn()
      renderList(
        { itemClick: 'none', pageSize: 10 },
        { onDrillDown },
      )

      await user.click(screen.getByText('[name:Alpha]'))
      expect(onDrillDown).not.toHaveBeenCalled()
    })

    it('applies clickable cursor style when drillDown is configured', () => {
      const { container } = renderList(
        { itemClick: 'drill', pageSize: 10 },
        { onDrillDown: vi.fn() },
      )

      // The first list item row should have cursor-pointer class
      const rows = container.querySelectorAll('.cursor-pointer')
      expect(rows.length).toBeGreaterThan(0)
    })

    it('does not apply clickable style when itemClick is none', () => {
      const { container } = renderList({ itemClick: 'none', pageSize: 10 })
      const rows = container.querySelectorAll('.cursor-pointer')
      expect(rows.length).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // Column width and alignment
  // -------------------------------------------------------------------------
  describe('column config', () => {
    it('applies fixed width to column', () => {
      const FIXED_WIDTH = 120
      const columns: CardColumnConfig[] = [
        { field: 'name', header: 'Name', width: FIXED_WIDTH },
        { field: 'status', header: 'Status' },
      ]
      const { container } = renderList(
        { columns, pageSize: 10 },
        { data: [{ name: 'Test', status: 'OK' }] },
      )

      // Find the element with the inline width style
      const fixedCol = container.querySelector(`[style*="width: ${FIXED_WIDTH}px"]`)
      expect(fixedCol).not.toBeNull()
    })

    it('applies string width to column', () => {
      const columns: CardColumnConfig[] = [
        { field: 'name', header: 'Name', width: '50%' },
        { field: 'status', header: 'Status' },
      ]
      const { container } = renderList(
        { columns, pageSize: 10 },
        { data: [{ name: 'Test', status: 'OK' }] },
      )

      const fixedCol = container.querySelector('[style*="width: 50%"]')
      expect(fixedCol).not.toBeNull()
    })

    it('applies text-right alignment', () => {
      const columns: CardColumnConfig[] = [
        { field: 'name', header: 'Name' },
        { field: 'count', header: 'Count', align: 'right' },
      ]
      const { container } = renderList(
        { columns, pageSize: 10 },
        { data: [{ name: 'Test', count: 42 }] },
      )

      const rightAligned = container.querySelector('.text-right')
      expect(rightAligned).not.toBeNull()
    })

    it('applies text-center alignment', () => {
      const columns: CardColumnConfig[] = [
        { field: 'name', header: 'Name' },
        { field: 'status', header: 'Status', align: 'center' },
      ]
      const { container } = renderList(
        { columns, pageSize: 10 },
        { data: [{ name: 'Test', status: 'OK' }] },
      )

      const centered = container.querySelector('.text-center')
      expect(centered).not.toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // Sorting with null/undefined values
  // -------------------------------------------------------------------------
  describe('sorting edge cases', () => {
    it('handles null values in sort (pushed to end in ascending)', async () => {
      const user = userEvent.setup()
      const dataWithNulls = [
        { name: 'Zulu', count: null },
        { name: 'Alpha', count: 5 },
        { name: 'Bravo', count: 3 },
      ]
      renderList(
        { sortable: true, pageSize: 10 },
        { data: dataWithNulls },
      )

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, 'count')

      // Ascending: numeric values first, null last
      const items = screen.getAllByText(/\[count:/)
      expect(items[0].textContent).toBe('[count:3]')
      expect(items[1].textContent).toBe('[count:5]')
      // null goes to end
      expect(items[2].textContent).toBe('[count:]')
    })
  })
})
