import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge Component', () => {
  it('renders with text content', () => {
    render(<StatusBadge color="green">Active</StatusBadge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('applies green color styles', () => {
    const { container } = render(<StatusBadge color="green">OK</StatusBadge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('bg-green-500/20')
    expect(badge.className).toContain('text-green-400')
  })

  it('applies red color styles', () => {
    const { container } = render(<StatusBadge color="red">Error</StatusBadge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('bg-red-500/20')
  })

  it('applies outline-solid variant with border', () => {
    const { container } = render(
      <StatusBadge color="blue" variant="outline">Info</StatusBadge>
    )
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('border')
    expect(badge.className).toContain('border-blue-500/30')
  })

  it('applies solid variant', () => {
    const { container } = render(
      <StatusBadge color="green" variant="solid">Solid</StatusBadge>
    )
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('bg-green-600')
    expect(badge.className).toContain('text-white')
  })

  it('applies full rounding', () => {
    const { container } = render(
      <StatusBadge color="gray" rounded="full">Pill</StatusBadge>
    )
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('rounded-full')
  })

  it('applies default rounding', () => {
    const { container } = render(<StatusBadge color="gray">Tag</StatusBadge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('rounded')
    expect(badge.className).not.toContain('rounded-full')
  })

  it('renders an icon when provided', () => {
    render(
      <StatusBadge color="yellow" icon={<span data-testid="badge-icon">!</span>}>
        Warning
      </StatusBadge>
    )
    expect(screen.getByTestId('badge-icon')).toBeInTheDocument()
  })

  it('applies xs size', () => {
    const { container } = render(
      <StatusBadge color="cyan" size="xs">Tiny</StatusBadge>
    )
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain('text-2xs')
  })
})
