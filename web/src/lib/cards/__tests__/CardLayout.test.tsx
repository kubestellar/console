import React from 'react'
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  CardBody,
  CardBodyEmpty,
  CardBodyLoaded,
  CardHeaderActions,
  CardHeaderRow,
  CardScrollList,
  CardStatGrid,
  CardStatHeader,
} from '../CardLayout'

describe('CardLayout helpers', () => {
  it('renders the shared header row classes', () => {
    const { container } = render(<CardHeaderRow data-testid="header-row" />)

    expect(screen.getByTestId('header-row')).toHaveClass('flex', 'flex-wrap', 'justify-between', 'mb-4')
    expect(container.firstChild).toBeInTheDocument()
  })

  it('merges custom classes for header actions', () => {
    render(<CardHeaderActions className="justify-end" data-testid="header-actions" />)

    expect(screen.getByTestId('header-actions')).toHaveClass('flex', 'items-center', 'gap-2', 'justify-end')
  })

  it('renders the shared stat grid and header wrappers', () => {
    render(
      <CardStatGrid className="@md:grid-cols-4 gap-2" data-testid="stat-grid">
        <CardStatHeader className="gap-1.5" data-testid="stat-header">
          <span>Content</span>
        </CardStatHeader>
      </CardStatGrid>
    )

    expect(screen.getByTestId('stat-grid')).toHaveClass('grid', 'grid-cols-2', '@md:grid-cols-4', 'gap-2', 'mb-4')
    expect(screen.getByTestId('stat-header')).toHaveClass('flex', 'items-center', 'mb-1', 'gap-1.5')
  })

  it('renders CardBody with base layout classes and forwards children', () => {
    render(
      <CardBody data-testid="body">
        <span data-testid="body-child">child</span>
      </CardBody>
    )

    const body = screen.getByTestId('body')
    expect(body).toHaveClass('h-full', 'flex', 'flex-col', 'min-h-card')
    expect(body).not.toHaveClass('content-loaded')
    expect(screen.getByTestId('body-child')).toBeInTheDocument()
  })

  it('merges caller className onto CardBody and forwards extra DivProps', () => {
    const handleClick = vi.fn()
    render(
      <CardBody className="extra-class" role="region" onClick={handleClick} data-testid="body" />
    )

    const body = screen.getByTestId('body')
    expect(body).toHaveClass('h-full', 'flex', 'flex-col', 'min-h-card', 'extra-class')
    expect(body).toHaveAttribute('role', 'region')
    body.click()
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders CardBodyLoaded with the content-loaded marker', () => {
    render(<CardBodyLoaded className="pt-2" data-testid="loaded" />)

    const loaded = screen.getByTestId('loaded')
    expect(loaded).toHaveClass('h-full', 'flex', 'flex-col', 'min-h-card', 'content-loaded', 'pt-2')
  })

  it('renders CardBodyEmpty with centered layout and muted-foreground text', () => {
    render(
      <CardBodyEmpty className="gap-3" data-testid="empty">
        <span>No data</span>
      </CardBodyEmpty>
    )

    const empty = screen.getByTestId('empty')
    expect(empty).toHaveClass(
      'h-full',
      'flex',
      'flex-col',
      'items-center',
      'justify-center',
      'min-h-card',
      'text-muted-foreground',
      'gap-3',
    )
    expect(empty).toHaveTextContent('No data')
  })

  it('renders CardScrollList with scroll and spacing classes', () => {
    render(
      <CardScrollList className="pr-1" data-testid="scroll">
        <div data-testid="scroll-item">item</div>
      </CardScrollList>
    )

    const scroll = screen.getByTestId('scroll')
    expect(scroll).toHaveClass('flex-1', 'space-y-2', 'overflow-y-auto', 'pr-1')
    expect(screen.getByTestId('scroll-item')).toBeInTheDocument()
  })
})
