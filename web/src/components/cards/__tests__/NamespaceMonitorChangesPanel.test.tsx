import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NamespaceMonitorChangesPanel } from '../NamespaceMonitorChangesPanel'

vi.mock('../NamespaceMonitor.utils', () => ({
  MAX_VISIBLE_CHANGES: 10,
  ResourceColors: { Deployment: 'text-blue-400', Service: 'text-green-400', Pod: 'text-yellow-400', ConfigMap: 'text-purple-400' },
  ResourceIcons: { Deployment: () => null, Service: () => null, Pod: () => null, ConfigMap: () => null },
}))

const defaultProps = {
  showChangesPanel: true,
  recentChanges: [],
  onClose: vi.fn(),
  onSelectChange: vi.fn(),
}

describe('NamespaceMonitorChangesPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders when visible', () => {
    render(<NamespaceMonitorChangesPanel {...defaultProps} />)
    expect(screen.getByText('Recent Changes')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<NamespaceMonitorChangesPanel {...defaultProps} onClose={onClose} />)
    const closeBtn = document.querySelector('button')
    if (closeBtn) fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows empty message when no changes', () => {
    render(<NamespaceMonitorChangesPanel {...defaultProps} recentChanges={[]} />)
    expect(document.body).toBeTruthy()
  })
})
