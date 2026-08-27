import React from 'react'
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock useCardType to avoid requiring CardWrapper context
vi.mock('../../../components/cards/CardWrapper', () => ({
  useCardType: () => 'test-card',
}))

// Mock analytics to observe emitCardListItemClicked calls
const emitCardListItemClicked = vi.fn()
vi.mock('../../analytics', () => ({
  emitCardListItemClicked: (...args: unknown[]) => emitCardListItemClicked(...args),
}))

import { CardListItem } from '../CardListItem'

describe('CardListItem', () => {
  beforeEach(() => {
    emitCardListItemClicked.mockClear()
  })

  it('renders children inside the layout container', () => {
    render(
      <CardListItem>
        <span>hello</span>
      </CardListItem>
    )

    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('applies the default variant classes when no bg/border overrides are given', () => {
    const { container } = render(<CardListItem>x</CardListItem>)
    const item = container.firstChild as HTMLElement

    expect(item.className).toContain('p-3')
    expect(item.className).toContain('rounded-lg')
    expect(item.className).toContain('bg-secondary/30')
    expect(item.className).toContain('border-border/50')
    expect(item.className).toContain('transition-all')
    expect(item.className).toContain('group')
  })

  it.each([
    ['success', 'bg-green-500/20', 'border-green-500/20'],
    ['warning', 'bg-yellow-500/20', 'border-yellow-500/20'],
    ['error', 'bg-red-500/20', 'border-red-500/20'],
    ['info', 'bg-blue-500/20', 'border-blue-500/20'],
  ] as const)('applies %s variant classes', (variant, bg, border) => {
    const { container } = render(
      <CardListItem variant={variant}>x</CardListItem>
    )
    const item = container.firstChild as HTMLElement

    expect(item.className).toContain(bg)
    expect(item.className).toContain(border)
  })

  it('honours bgClass and borderClass overrides over the variant defaults', () => {
    const { container } = render(
      <CardListItem variant="error" bgClass="bg-custom" borderClass="border-custom">
        x
      </CardListItem>
    )
    const item = container.firstChild as HTMLElement

    expect(item.className).toContain('bg-custom')
    expect(item.className).toContain('border-custom')
    expect(item.className).not.toContain('bg-red-500/20')
    expect(item.className).not.toContain('border-red-500/20')
  })

  it('is not interactive when onClick is not provided', () => {
    const { container } = render(<CardListItem>x</CardListItem>)
    const item = container.firstChild as HTMLElement

    expect(item).not.toHaveAttribute('role')
    expect(item).not.toHaveAttribute('tabindex')
    expect(item.className).not.toContain('cursor-pointer')
  })

  it('exposes button semantics when onClick is provided', () => {
    const onClick = vi.fn()
    render(<CardListItem onClick={onClick}>x</CardListItem>)

    const item = screen.getByRole('button')
    expect(item).toHaveAttribute('tabindex', '0')
    expect(item.className).toContain('cursor-pointer')
    expect(item.className).toContain('hover:opacity-80')
  })

  it('fires analytics and onClick on click', () => {
    const onClick = vi.fn()
    render(<CardListItem onClick={onClick}>x</CardListItem>)

    fireEvent.click(screen.getByRole('button'))

    expect(emitCardListItemClicked).toHaveBeenCalledTimes(1)
    expect(emitCardListItemClicked).toHaveBeenCalledWith('test-card')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('activates on Enter and Space keys', () => {
    const onClick = vi.fn()
    render(<CardListItem onClick={onClick}>x</CardListItem>)

    const item = screen.getByRole('button')
    fireEvent.keyDown(item, { key: 'Enter' })
    fireEvent.keyDown(item, { key: ' ' })

    expect(onClick).toHaveBeenCalledTimes(2)
    expect(emitCardListItemClicked).toHaveBeenCalledTimes(2)
  })

  it('ignores unrelated keys', () => {
    const onClick = vi.fn()
    render(<CardListItem onClick={onClick}>x</CardListItem>)

    fireEvent.keyDown(screen.getByRole('button'), { key: 'a' })
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' })

    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders a chevron when clickable and showChevron is default', () => {
    const { container } = render(
      <CardListItem onClick={vi.fn()}>x</CardListItem>
    )
    // ChevronRight from lucide-react renders an <svg>
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('does not render a chevron when showChevron is false', () => {
    const { container } = render(
      <CardListItem onClick={vi.fn()} showChevron={false}>
        x
      </CardListItem>
    )
    expect(container.querySelector('svg')).toBeNull()
  })

  it('does not render a chevron when there is no onClick even if showChevron is true', () => {
    const { container } = render(
      <CardListItem showChevron={true}>x</CardListItem>
    )
    expect(container.querySelector('svg')).toBeNull()
  })

  it('forwards title and data-tour attributes', () => {
    const { container } = render(
      <CardListItem title="Pod running" dataTour="pod-item">
        x
      </CardListItem>
    )
    const item = container.firstChild as HTMLElement

    expect(item).toHaveAttribute('title', 'Pod running')
    expect(item).toHaveAttribute('data-tour', 'pod-item')
  })
})
