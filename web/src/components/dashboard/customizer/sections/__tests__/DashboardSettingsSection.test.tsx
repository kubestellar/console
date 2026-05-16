/**
 * DashboardSettingsSection — branch-coverage tests.
 *
 * Covers: health always rendered, export button conditional, reset button
 * conditional on both onReset+isCustomized, i18n key fallbacks.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}))

vi.mock('../../DashboardHealthIndicator', () => ({
  DashboardHealthIndicator: () =>
    React.createElement('div', { 'data-testid': 'dashboard-health' }),
}))

import { DashboardSettingsSection } from '../DashboardSettingsSection'

describe('DashboardSettingsSection', () => {
  it('always renders health indicator', () => {
    render(<DashboardSettingsSection />)
    expect(screen.getByTestId('dashboard-health')).toBeTruthy()
    expect(screen.getByText('Dashboard Health')).toBeTruthy()
  })

  it('hides export when onExport not provided', () => {
    const { container } = render(<DashboardSettingsSection />)
    expect(container.textContent).not.toContain('Export dashboard as JSON')
  })

  it('shows export button when onExport provided', () => {
    const onExport = vi.fn()
    render(<DashboardSettingsSection onExport={onExport} />)
    expect(screen.getByText('Export dashboard as JSON')).toBeTruthy()
  })

  it('calls onExport when export button clicked', () => {
    const onExport = vi.fn()
    render(<DashboardSettingsSection onExport={onExport} />)
    fireEvent.click(screen.getByText('Export dashboard as JSON'))
    expect(onExport).toHaveBeenCalledOnce()
  })

  it('hides reset when onReset not provided', () => {
    const { container } = render(<DashboardSettingsSection isCustomized />)
    expect(container.textContent).not.toContain('Reset to defaults')
  })

  it('hides reset when isCustomized=false (default)', () => {
    const onReset = vi.fn()
    const { container } = render(<DashboardSettingsSection onReset={onReset} />)
    expect(container.textContent).not.toContain('Reset to defaults')
  })

  it('shows reset button when onReset+isCustomized both provided', () => {
    const onReset = vi.fn()
    render(<DashboardSettingsSection onReset={onReset} isCustomized />)
    expect(screen.getByText('Reset to defaults')).toBeTruthy()
    expect(screen.getByText('This will restore the default card layout for this dashboard.')).toBeTruthy()
  })

  it('calls onReset when reset button clicked', () => {
    const onReset = vi.fn()
    render(<DashboardSettingsSection onReset={onReset} isCustomized />)
    fireEvent.click(screen.getByText('Reset to defaults'))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('renders both export and reset when all props set', () => {
    const onExport = vi.fn()
    const onReset = vi.fn()
    render(<DashboardSettingsSection onExport={onExport} onReset={onReset} isCustomized />)
    expect(screen.getByText('Export dashboard as JSON')).toBeTruthy()
    expect(screen.getByText('Reset to defaults')).toBeTruthy()
  })
})
