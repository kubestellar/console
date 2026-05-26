/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { CardControls } from './CardControls'

const mockSortOptions = [
  { value: 'date', label: 'Date' },
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
]

describe('CardControls', () => {
  it('renders sort controls when sortOptions are provided', async () => {
    const user = userEvent.setup()
    const mockOnSortChange = vi.fn()

    render(
      <CardControls
        sortOptions={mockSortOptions}
        sortBy="date"
        onSortChange={mockOnSortChange}
      />
    )

    const sortButton = screen.getByRole('button', { name: /sort/i })
    expect(sortButton).toBeInTheDocument()

    await user.click(sortButton)

    const dateOption = await screen.findByText('Date')
    expect(dateOption).toBeInTheDocument()
    const nameOption = await screen.findByText('Name')
    expect(nameOption).toBeInTheDocument()
    const statusOption = await screen.findByText('Status')
    expect(statusOption).toBeInTheDocument()
  })

  it('renders limit controls when limitOptions are provided', async () => {
    const user = userEvent.setup()
    const mockOnLimitChange = vi.fn()

    render(
      <CardControls
        limit={5}
        onLimitChange={mockOnLimitChange}
        showLimit={true}
      />
    )

    const limitButton = screen.getByRole('button', { name: /show/i })
    expect(limitButton).toBeInTheDocument()

    await user.click(limitButton)

    const option10 = await screen.findByText('10')
    expect(option10).toBeInTheDocument()
    const option20 = await screen.findByText('20')
    expect(option20).toBeInTheDocument()
    const optionAll = await screen.findByText('All')
    expect(optionAll).toBeInTheDocument()
  })

  it('sort direction toggle changes from asc to desc', async () => {
    const user = userEvent.setup()
    const mockOnSortDirectionChange = vi.fn()

    render(
      <CardControls
        sortOptions={mockSortOptions}
        sortBy="date"
        onSortChange={vi.fn()}
        sortDirection="asc"
        onSortDirectionChange={mockOnSortDirectionChange}
      />
    )

    const directionButton = screen.getByRole('button', { name: /ascending/i })
    expect(directionButton).toBeInTheDocument()

    await user.click(directionButton)

    await waitFor(() => {
      expect(mockOnSortDirectionChange).toHaveBeenCalledWith('desc')
    })
  })

  it('sort direction toggle changes from desc to asc', async () => {
    const user = userEvent.setup()
    const mockOnSortDirectionChange = vi.fn()

    render(
      <CardControls
        sortOptions={mockSortOptions}
        sortBy="date"
        onSortChange={vi.fn()}
        sortDirection="desc"
        onSortDirectionChange={mockOnSortDirectionChange}
      />
    )

    const directionButton = screen.getByRole('button', { name: /descending/i })
    expect(directionButton).toBeInTheDocument()

    await user.click(directionButton)

    await waitFor(() => {
      expect(mockOnSortDirectionChange).toHaveBeenCalledWith('asc')
    })
  })

  it('selecting a sort option calls onSortChange', async () => {
    const user = userEvent.setup()
    const mockOnSortChange = vi.fn()

    render(
      <CardControls
        sortOptions={mockSortOptions}
        sortBy="date"
        onSortChange={mockOnSortChange}
      />
    )

    const sortButton = screen.getByRole('button', { name: /sort/i })
    await user.click(sortButton)

    const nameOption = await screen.findByText('Name')
    await user.click(nameOption)

    await waitFor(() => {
      expect(mockOnSortChange).toHaveBeenCalledWith('name')
    })
  })

  it('selecting a limit option calls onLimitChange', async () => {
    const user = userEvent.setup()
    const mockOnLimitChange = vi.fn()

    render(
      <CardControls
        limit={5}
        onLimitChange={mockOnLimitChange}
        showLimit={true}
      />
    )

    const limitButton = screen.getByRole('button', { name: /show/i })
    await user.click(limitButton)

    const option20 = await screen.findByText('20')
    await user.click(option20)

    await waitFor(() => {
      expect(mockOnLimitChange).toHaveBeenCalledWith(20)
    })
  })

  it('selecting "All" limit option calls onLimitChange with unlimited', async () => {
    const user = userEvent.setup()
    const mockOnLimitChange = vi.fn()

    render(
      <CardControls
        limit={5}
        onLimitChange={mockOnLimitChange}
        showLimit={true}
      />
    )

    const limitButton = screen.getByRole('button', { name: /show/i })
    await user.click(limitButton)

    const allOption = await screen.findByText('All')
    await user.click(allOption)

    await waitFor(() => {
      expect(mockOnLimitChange).toHaveBeenCalledWith('unlimited')
    })
  })

  it('renders safely with no optional props', async () => {
    const { container } = render(<CardControls />)

    expect(container).toBeInTheDocument()
    // With no callbacks, neither dropdown should render
    expect(screen.queryByRole('button', { name: /sort/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show/i })).not.toBeInTheDocument()
  })

  it('does not render sort controls when showSort is false', async () => {
    render(
      <CardControls
        sortOptions={mockSortOptions}
        sortBy="date"
        onSortChange={vi.fn()}
        showSort={false}
      />
    )

    expect(screen.queryByRole('button', { name: /sort/i })).not.toBeInTheDocument()
  })

  it('does not render limit controls when showLimit is false', async () => {
    render(
      <CardControls
        limit={5}
        onLimitChange={vi.fn()}
        showLimit={false}
      />
    )

    expect(screen.queryByRole('button', { name: /show/i })).not.toBeInTheDocument()
  })

  it('displays the current sort label on the sort button', async () => {
    render(
      <CardControls
        sortOptions={mockSortOptions}
        sortBy="name"
        onSortChange={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /sort: name/i })).toBeInTheDocument()
  })

  it('displays the current limit label on the limit button', async () => {
    render(
      <CardControls
        limit={10}
        onLimitChange={vi.fn()}
        showLimit={true}
      />
    )

    expect(screen.getByRole('button', { name: /show: 10/i })).toBeInTheDocument()
  })

  it('closes sort dropdown after selecting an option', async () => {
    const user = userEvent.setup()
    const mockOnSortChange = vi.fn()

    render(
      <CardControls
        sortOptions={mockSortOptions}
        sortBy="date"
        onSortChange={mockOnSortChange}
      />
    )

    const sortButton = screen.getByRole('button', { name: /sort/i })
    await user.click(sortButton)

    const nameOption = await screen.findByText('Name')
    await user.click(nameOption)

    await waitFor(() => {
      // The dropdown options should no longer be visible
      // (Status was only rendered in the dropdown)
      expect(screen.queryByText('Status')).not.toBeInTheDocument()
    })
  })

  it('supports keyboard navigation in the sort menu', async () => {
    const user = userEvent.setup()
    const mockOnSortChange = vi.fn()

    render(
      <CardControls
        sortOptions={mockSortOptions}
        sortBy="date"
        onSortChange={mockOnSortChange}
      />
    )

    const sortButton = screen.getByRole('button', { name: /sort/i })
    sortButton.focus()
    await user.keyboard('{ArrowDown}')

    expect(await screen.findByRole('option', { name: 'Date' })).toHaveFocus()

    await user.keyboard('{End}')
    expect(screen.getByRole('option', { name: 'Status' })).toHaveFocus()

    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(mockOnSortChange).toHaveBeenCalledWith('status')
    })
  })

  it('supports keyboard navigation in the limit menu', async () => {
    const user = userEvent.setup()
    const mockOnLimitChange = vi.fn()

    render(
      <CardControls
        limit={5}
        onLimitChange={mockOnLimitChange}
        showLimit={true}
      />
    )

    const limitButton = screen.getByRole('button', { name: /show/i })
    limitButton.focus()
    await user.keyboard('{ArrowDown}')

    expect(await screen.findByRole('option', { name: '5' })).toHaveFocus()

    await user.keyboard('{End}')
    expect(screen.getByRole('option', { name: 'All' })).toHaveFocus()

    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(mockOnLimitChange).toHaveBeenCalledWith('unlimited')
    })
  })

  it('closes limit dropdown after selecting an option', async () => {
    const user = userEvent.setup()
    const mockOnLimitChange = vi.fn()

    render(
      <CardControls
        limit={5}
        onLimitChange={mockOnLimitChange}
        showLimit={true}
      />
    )

    const limitButton = screen.getByRole('button', { name: /show/i })
    await user.click(limitButton)

    const option50 = await screen.findByText('50')
    await user.click(option50)

    await waitFor(() => {
      expect(screen.queryByText('100')).not.toBeInTheDocument()
    })
  })

  it('does not render direction toggle without onSortDirectionChange', async () => {
    render(
      <CardControls
        sortOptions={mockSortOptions}
        sortBy="date"
        onSortChange={vi.fn()}
        sortDirection="asc"
      />
    )

    expect(screen.queryByRole('button', { name: /ascending/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /descending/i })).not.toBeInTheDocument()
  })

  it('does not render a search input (component has no search support)', async () => {
    render(
      <CardControls
        sortOptions={mockSortOptions}
        sortBy="date"
        onSortChange={vi.fn()}
        limit={5}
        onLimitChange={vi.fn()}
        showLimit={true}
        showSort={true}
        sortDirection="asc"
        onSortDirectionChange={vi.fn()}
      />
    )

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })
})
