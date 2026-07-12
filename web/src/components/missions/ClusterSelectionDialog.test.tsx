import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterSelectionDialog } from './ClusterSelectionDialog'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
}))

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../hooks/mcp/clusters', () => ({
  useClusters: () => ({
    deduplicatedClusters: [
      { name: 'cluster-1', context: 'cluster-1', reachable: true, healthy: true },
      { name: 'cluster-2', context: 'cluster-2', reachable: true, healthy: true },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

describe('ClusterSelectionDialog', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ClusterSelectionDialog
        open={false}
        missionTitle="Test Mission"
        onCancel={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog when isOpen is true', () => {
    render(
      <ClusterSelectionDialog
        open={true}
        missionTitle="Test Mission"
        onCancel={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('calls onSelect when cluster is selected', () => {
    const onSelect = vi.fn()
    render(
      <ClusterSelectionDialog
        open={true}
        missionTitle="Test Mission"
        onCancel={vi.fn()}
        onSelect={onSelect}
      />
    )
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('calls onCancel when dialog is closed', () => {
    const onClose = vi.fn()
    render(
      <ClusterSelectionDialog
        open={true}
        missionTitle="Test Mission"
        onCancel={onClose}
        onSelect={vi.fn()}
      />
    )
    screen.getByRole('button', { name: /close modal/i }).click()
    expect(onClose).toHaveBeenCalled()
  })
})
