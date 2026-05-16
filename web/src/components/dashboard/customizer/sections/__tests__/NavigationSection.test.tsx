/**
 * NavigationSection — branch-coverage tests.
 *
 * Covers: optional dashboardName banner, SidebarCustomizer embedded mode,
 * onClose forwarded, dashboardName absent branch.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('../../../../layout/SidebarCustomizer', () => ({
  SidebarCustomizer: ({
    isOpen,
    embedded,
  }: {
    isOpen: boolean
    embedded?: boolean
    onClose: () => void
  }) =>
    React.createElement('div', {
      'data-testid': 'sidebar-customizer',
      'data-open': String(isOpen),
      'data-embedded': String(!!embedded),
    }),
}))

import { NavigationSection } from '../NavigationSection'

describe('NavigationSection', () => {
  it('renders SidebarCustomizer in embedded+open mode', () => {
    render(<NavigationSection onClose={vi.fn()} />)
    const el = screen.getByTestId('sidebar-customizer')
    expect(el.getAttribute('data-open')).toBe('true')
    expect(el.getAttribute('data-embedded')).toBe('true')
  })

  it('omits dashboard name banner when dashboardName not provided', () => {
    const { container } = render(<NavigationSection onClose={vi.fn()} />)
    expect(container.textContent).not.toContain('Currently editing:')
  })

  it('renders dashboard name banner when dashboardName provided', () => {
    render(<NavigationSection onClose={vi.fn()} dashboardName="My Dashboard" />)
    expect(screen.getByText('My Dashboard')).toBeTruthy()
    expect(screen.getByText(/Currently editing:/)).toBeTruthy()
  })

  it('passes onClose through without error', () => {
    const onClose = vi.fn()
    render(<NavigationSection onClose={onClose} dashboardName="Test" />)
    // onClose is passed to SidebarCustomizer — component renders without throwing
    expect(screen.getByTestId('sidebar-customizer')).toBeTruthy()
  })
})
