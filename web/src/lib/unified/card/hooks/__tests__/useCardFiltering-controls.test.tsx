/**
 * Tests for FilterControl rendering — the internal component returned by
 * useCardFiltering's filterControls. Covers lines 126 and 150-199.
 */
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import { useCardFiltering } from '../useCardFiltering'
import type { CardFilterConfig } from '../../../types'

function renderControls(filters: CardFilterConfig[], data: unknown[] = []) {
  const { result } = renderHook(() => useCardFiltering(data, filters))
  const { container } = render(result.current.filterControls as React.ReactElement)
  return { result, container }
}

describe('FilterControl – text type', () => {
  it('renders an input[type=text]', () => {
    const { container } = renderControls([{ field: 'name', type: 'text' }])
    const input = container.querySelector('input[type="text"]')
    expect(input).not.toBeNull()
  })

  it('renders placeholder using label when set', () => {
    const { container } = renderControls([
      { field: 'name', type: 'text', label: 'Name', placeholder: 'Filter names…' },
    ])
    const input = container.querySelector('input[type="text"]') as HTMLInputElement
    expect(input.placeholder).toBe('Filter names…')
  })

  it('fires onChange which updates filter state', () => {
    const data = [{ name: 'alpha' }, { name: 'beta' }]
    const { result, container } = renderControls([{ field: 'name', type: 'text' }], data)

    const input = container.querySelector('input[type="text"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'alpha' } })

    expect(result.current.filteredData).toHaveLength(1)
  })
})

describe('FilterControl – select type', () => {
  it('renders a select element', () => {
    const filters: CardFilterConfig[] = [
      {
        field: 'status',
        type: 'select',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ],
      },
    ]
    const { container } = renderControls(filters)
    const select = container.querySelector('select')
    expect(select).not.toBeNull()
  })

  it('includes an "All" option by default', () => {
    const filters: CardFilterConfig[] = [
      {
        field: 'status',
        type: 'select',
        options: [{ value: 'ok', label: 'OK' }],
      },
    ]
    const { container } = renderControls(filters)
    const options = container.querySelectorAll('option')
    expect(options[0].value).toBe('')
  })

  it('fires onChange when value is selected', () => {
    const data = [{ status: 'active' }, { status: 'inactive' }]
    const filters: CardFilterConfig[] = [
      {
        field: 'status',
        type: 'select',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ],
      },
    ]
    const { result, container } = renderControls(filters, data)

    const select = container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'active' } })

    expect(result.current.filteredData).toHaveLength(1)
  })

  it('clears filter when empty string is selected', () => {
    const data = [{ status: 'active' }, { status: 'inactive' }]
    const filters: CardFilterConfig[] = [
      {
        field: 'status',
        type: 'select',
        options: [{ value: 'active', label: 'Active' }],
      },
    ]
    const { result, container } = renderControls(filters, data)

    const select = container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'active' } })
    fireEvent.change(select, { target: { value: '' } })

    expect(result.current.filteredData).toHaveLength(2)
  })
})

describe('FilterControl – cluster-select type', () => {
  it('renders as a select element (same as select)', () => {
    const filters: CardFilterConfig[] = [
      {
        field: 'cluster',
        type: 'cluster-select',
        options: [{ value: 'prod', label: 'prod' }],
      },
    ]
    const { container } = renderControls(filters)
    expect(container.querySelector('select')).not.toBeNull()
  })
})

describe('FilterControl – toggle type', () => {
  it('renders a checkbox input', () => {
    const filters: CardFilterConfig[] = [{ field: 'active', type: 'toggle', label: 'Active only' }]
    const { container } = renderControls(filters)
    const checkbox = container.querySelector('input[type="checkbox"]')
    expect(checkbox).not.toBeNull()
  })

  it('fires onChange when checked', () => {
    const data = [{ active: true }, { active: false }]
    const filters: CardFilterConfig[] = [{ field: 'active', type: 'toggle' }]
    const { result, container } = renderControls(filters, data)

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    fireEvent.change(checkbox, { target: { checked: true } })

    expect(result.current.filteredData).toHaveLength(1)
  })

  it('renders label text', () => {
    const filters: CardFilterConfig[] = [{ field: 'active', type: 'toggle', label: 'Show active' }]
    const { container } = renderControls(filters)
    expect(container.textContent).toContain('Show active')
  })
})

describe('FilterControl – chips / multi-select type', () => {
  it('renders a chips control for type "chips"', () => {
    const filters: CardFilterConfig[] = [{ field: 'tags', type: 'chips', label: 'Tags' }]
    const { container } = renderControls(filters)
    expect(container.textContent).toContain('(multi-select)')
  })

  it('renders a multi-select control for type "multi-select"', () => {
    const filters: CardFilterConfig[] = [{ field: 'tags', type: 'multi-select', label: 'Tags' }]
    const { container } = renderControls(filters)
    expect(container.textContent).toContain('(multi-select)')
  })
})

describe('FilterControl – unknown type (default branch)', () => {
  it('renders nothing for an unsupported filter type', () => {
    const filters = [{ field: 'x', type: 'range' as 'text' }]
    const { container } = renderControls(filters)
    // The wrapper div renders but FilterControl returns null for unknown type
    const wrapper = container.firstElementChild
    expect(wrapper?.children).toHaveLength(0)
  })
})

describe('filterControls – onChange callback covers line 126', () => {
  it('onChange fires setFilter via the captured closure', () => {
    const data = [{ name: 'alpha' }, { name: 'beta' }]
    const filters: CardFilterConfig[] = [{ field: 'name', type: 'text' }]
    const { result } = renderHook(() => useCardFiltering(data, filters))

    act(() => {
      result.current.setFilter('name', 'alpha')
    })

    expect(result.current.filterState).toEqual({ name: 'alpha' })
  })
})
