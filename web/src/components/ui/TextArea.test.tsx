// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TextArea } from './TextArea'

describe('TextArea Component', () => {
  it('renders correctly with placeholder', () => {
    render(<TextArea placeholder="Enter description" />)
    expect(screen.getByPlaceholderText('Enter description')).toBeInTheDocument()
  })

  it('handles value changes', () => {
    const handleChange = vi.fn()
    render(<TextArea onChange={handleChange} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'test content' } })
    expect(handleChange).toHaveBeenCalled()
  })

  it('sets aria-invalid when error prop is true', () => {
    render(<TextArea error />)
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })

  it('is disabled when disabled prop is set', () => {
    render(<TextArea disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('applies correct size classes', () => {
    const { rerender } = render(<TextArea textAreaSize="sm" />)
    let textarea = screen.getByRole('textbox')
    expect(textarea.className).toContain('px-2 py-1 text-xs')

    rerender(<TextArea textAreaSize="lg" />)
    textarea = screen.getByRole('textbox')
    expect(textarea.className).toContain('px-4 py-2 text-sm')
  })

  it('applies resizable class when resizable is true', () => {
    const { rerender } = render(<TextArea resizable={true} />)
    let textarea = screen.getByRole('textbox')
    expect(textarea.className).toContain('resize-y')

    rerender(<TextArea resizable={false} />)
    textarea = screen.getByRole('textbox')
    expect(textarea.className).toContain('resize-none')
  })

  it('applies custom className', () => {
    render(<TextArea className="custom-textarea-class" />)
    expect(screen.getByRole('textbox').className).toContain('custom-textarea-class')
  })
})
