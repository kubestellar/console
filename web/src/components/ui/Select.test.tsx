// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Select } from './Select'

describe('Select Component', () => {
  it('renders with children options', () => {
    render(
      <Select>
        <option value="1">Option 1</option>
        <option value="2">Option 2</option>
      </Select>
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('Option 1')).toBeInTheDocument()
    expect(screen.getByText('Option 2')).toBeInTheDocument()
  })

  it('handles value changes', () => {
    const handleChange = vi.fn()
    render(
      <Select onChange={handleChange}>
        <option value="1">Option 1</option>
        <option value="2">Option 2</option>
      </Select>
    )
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '2' } })
    expect(handleChange).toHaveBeenCalled()
  })

  it('sets aria-invalid when error prop is true', () => {
    render(<Select error />)
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
  })

  it('is disabled when disabled prop is set', () => {
    render(<Select disabled />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('applies correct size classes', () => {
    const { rerender } = render(<Select selectSize="sm" />)
    let select = screen.getByRole('combobox')
    expect(select.className).toContain('px-2 py-1 text-xs')

    rerender(<Select selectSize="lg" />)
    select = screen.getByRole('combobox')
    expect(select.className).toContain('px-4 py-2 text-sm')
  })

  it('applies custom className', () => {
    render(<Select className="custom-select-class" />)
    expect(screen.getByRole('combobox').className).toContain('custom-select-class')
  })
})
