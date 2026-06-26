// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Input } from './Input'

describe('Input Component', () => {
  it('renders correctly with placeholder', () => {
    render(<Input placeholder="Enter name" />)
    expect(screen.getByPlaceholderText('Enter name')).toBeInTheDocument()
  })

  it('handles value changes', () => {
    const handleChange = vi.fn()
    render(<Input onChange={handleChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'test' } })
    expect(handleChange).toHaveBeenCalled()
  })

  it('displays leading icon', () => {
    render(<Input leadingIcon={<span data-testid="leading-icon">L</span>} />)
    expect(screen.getByTestId('leading-icon')).toBeInTheDocument()
  })

  it('displays trailing icon', () => {
    render(<Input trailingIcon={<span data-testid="trailing-icon">T</span>} />)
    expect(screen.getByTestId('trailing-icon')).toBeInTheDocument()
  })

  it('shows error message and sets aria attributes', () => {
    render(<Input error errorMessage="Field is required" />)
    const input = screen.getByRole('textbox')
    const errorMsg = screen.getByText('Field is required')
    
    expect(errorMsg).toBeInTheDocument()
    expect(errorMsg).toHaveAttribute('role', 'alert')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', errorMsg.id)
  })

  it('is disabled when disabled prop is set', () => {
    render(<Input disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('applies correct size classes', () => {
    const { rerender } = render(<Input inputSize="sm" />)
    let input = screen.getByRole('textbox')
    expect(input.className).toContain('px-2 py-1 text-xs')

    rerender(<Input inputSize="lg" />)
    input = screen.getByRole('textbox')
    expect(input.className).toContain('px-4 py-2 text-sm')
  })

  it('applies custom className', () => {
    render(<Input className="custom-class" />)
    expect(screen.getByRole('textbox').className).toContain('custom-class')
  })
})
