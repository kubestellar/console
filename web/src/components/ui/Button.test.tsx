import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button Component', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('applies the primary variant', () => {
    render(<Button variant="primary">Primary</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-blue-600')
  })

  it('applies the danger variant', () => {
    render(<Button variant="danger">Delete</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-red-600')
  })

  it('applies the small size', () => {
    render(<Button size="sm">Small</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('text-xs')
  })

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled when loading', () => {
    render(<Button loading>Loading</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows spinner when loading', () => {
    const { container } = render(<Button loading>Loading</Button>)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeTruthy()
  })

  it('sets aria-busy when loading', () => {
    render(<Button loading>Loading</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })

  it('does not set aria-busy when not loading', () => {
    render(<Button>Not loading</Button>)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy')
  })

  it('spinner has aria-hidden when loading', () => {
    const { container } = render(<Button loading>Loading</Button>)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses title as aria-label for icon-only buttons', () => {
    render(<Button icon={<span>★</span>} title="Add item" />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Add item')
  })

  it('explicit aria-label takes precedence over title', () => {
    render(<Button icon={<span>★</span>} title="Add item" aria-label="Custom label" />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Custom label')
  })

  it('does not set aria-label when children provide the accessible name', () => {
    render(<Button title="Hint">Save</Button>)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-label')
  })

  it('renders icon on the left', () => {
    render(<Button icon={<span data-testid="icon">*</span>}>With Icon</Button>)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('renders iconRight on the right', () => {
    render(<Button iconRight={<span data-testid="icon-right">→</span>}>Go</Button>)
    expect(screen.getByTestId('icon-right')).toBeInTheDocument()
  })

  it('applies fullWidth class', () => {
    render(<Button fullWidth>Full</Button>)
    expect(screen.getByRole('button').className).toContain('w-full')
  })

  it('calls onClick handler', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledOnce()
  })
})
