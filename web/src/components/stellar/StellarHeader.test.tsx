import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSetBatchIntervalMs = vi.fn()
const mockRunBatchNow = vi.fn()

vi.mock('../../hooks/useStellar', () => ({
  useStellar: () => ({
    batchIntervalMs: 3_600_000,
    setBatchIntervalMs: mockSetBatchIntervalMs,
    nextBatchAtMs: Date.now() + 60_000,
    isBatchRefreshing: false,
    runBatchNow: mockRunBatchNow,
  }),
}))

import { StellarHeader } from './StellarHeader'

describe('StellarHeader', () => {
  beforeEach(() => {
    mockSetBatchIntervalMs.mockReset()
    mockRunBatchNow.mockReset()
  })

  it('renders batch controls', () => {
    render(<StellarHeader isConnected unreadCount={2} clusterCount={3} showCollapse={false} />)

    expect(screen.getByRole('combobox', { name: 'stellar.header.batchIntervalLabel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'stellar.header.runNow' })).toBeInTheDocument()
  })

  it('updates the batch interval from the dropdown', () => {
    render(<StellarHeader isConnected unreadCount={0} clusterCount={1} showCollapse={false} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'stellar.header.batchIntervalLabel' }), {
      target: { value: '7200000' },
    })

    expect(mockSetBatchIntervalMs).toHaveBeenCalledWith(7200000)
  })

  it('runs a batch immediately when the button is clicked', () => {
    render(<StellarHeader isConnected unreadCount={0} clusterCount={1} showCollapse={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'stellar.header.runNow' }))

    expect(mockRunBatchNow).toHaveBeenCalledTimes(1)
  })
})
