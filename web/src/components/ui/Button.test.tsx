import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

// Test string constants for i18n
const TEST_STRINGS = {
  clickMe: 'Click me',
  primary: 'Primary',
  delete: 'Delete',
  small: 'Small',
  disabled: 'Disabled',
  loading: 'Loading',
  notLoading: 'Not loading',
  addItem: 'Add item',
  customLabel: 'Custom label',
  save: 'Save',
  hint: 'Hint',
  withIcon: 'With Icon',
  go: 'Go',
  full: 'Full',
  click: 'Click',
} as const

describe('Button Component', () => {
  it('renders with children', () => {
    render(<Button>{TEST_STRINGS.clickMe}</Button>)
    expect(screen.getByRole('button', { name: TEST_STRINGS.clickMe })).toBeInTheDocument()
  })

  it('applies the primary variant', () => {
    render(<Button variant="primary">{TEST_STRINGS.primary}</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-primary')
  })

  it('applies the danger variant', () => {
    render(<Button variant="danger">{TEST_STRINGS.delete}</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-destructive')
  })

  it('applies the small size', () => {
    render(<Button size="sm">{TEST_STRINGS.small}</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('text-xs')
  })

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>{TEST_STRINGS.disabled}</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled when loading', () => {
    render(<Button loading>{TEST_STRINGS.loading}</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows spinner when loading', () => {
    const { container } = render(<Button loading>{TEST_STRINGS.loading}</Button>)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeTruthy()
  })

  it('sets aria-busy when loading', () => {
    render(<Button loading>{TEST_STRINGS.loading}</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })

  it('does not set aria-busy when not loading', () => {
    render(<Button>{TEST_STRINGS.notLoading}</Button>)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy')
  })

  it('spinner has aria-hidden when loading', () => {
    const { container } = render(<Button loading>{TEST_STRINGS.loading}</Button>)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses title as aria-label for icon-only buttons', () => {
    render(<Button icon={<span>★</span>} title={TEST_STRINGS.addItem} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', TEST_STRINGS.addItem)
  })

  it('explicit aria-label takes precedence over title', () => {
    render(<Button icon={<span>★</span>} title={TEST_STRINGS.addItem} aria-label={TEST_STRINGS.customLabel} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', TEST_STRINGS.customLabel)
  })

  it('does not set aria-label when children provide the accessible name', () => {
    render(<Button title={TEST_STRINGS.hint}>{TEST_STRINGS.save}</Button>)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-label')
  })

  it('renders icon on the left', () => {
    render(<Button icon={<span data-testid="icon">*</span>}>{TEST_STRINGS.withIcon}</Button>)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('renders iconRight on the right', () => {
    render(<Button iconRight={<span data-testid="icon-right">→</span>}>{TEST_STRINGS.go}</Button>)
    expect(screen.getByTestId('icon-right')).toBeInTheDocument()
  })

  it('applies fullWidth class', () => {
    render(<Button fullWidth>{TEST_STRINGS.full}</Button>)
    expect(screen.getByRole('button').className).toContain('w-full')
  })

  it('calls onClick handler', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>{TEST_STRINGS.click}</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledOnce()
  })
})
