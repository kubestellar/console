import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { GxPDashboardContent as GxPDashboard } from './GxPDashboard'

const ok = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) })

const mockSummary = {
  config: { enabled: true, enabled_at: '2026-04-20T08:00:00Z', enabled_by: 'admin@pharma.example.com', append_only: true, require_signature: true, hash_algorithm: 'SHA-256' },
  total_records: 8, total_signatures: 7, chain_integrity: true,
  last_verified: '2026-04-23T10:00:00Z', pending_signatures: 1,
  evaluated_at: '2026-04-23T10:00:00Z',
}
const mockRecords = [
  { id: 'gxp-001', timestamp: '2026-04-20T08:01:00Z', user_id: 'admin@pharma.example.com', action: 'config_change', resource: 'gxp-mode', detail: 'GxP enabled', previous_hash: '', record_hash: 'abc123' },
]
const mockSignatures = [
  { id: 'sig-001', record_id: 'gxp-001', user_id: 'admin@pharma.example.com', meaning: 'approved', auth_method: 'mfa', timestamp: '2026-04-20T08:02:00Z' },
]
const mockChain = { valid: true, total_records: 8, verified_records: 8, broken_at_index: -1, verified_at: '2026-04-23T10:00:00Z', message: 'Hash chain intact' }

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn((url: string) => {
    if (url.includes('/summary')) return ok(mockSummary)
    if (url.includes('/records')) return ok(mockRecords)
    if (url.includes('/signatures')) return ok(mockSignatures)
    if (url.includes('/chain/verify')) return ok(mockChain)
    return Promise.reject(new Error('unknown'))
  }),
}))

beforeEach(() => { vi.clearAllMocks() })

describe('GxPDashboard', () => {
  it('renders the dashboard title', async () => {
    render(<GxPDashboard />)
    await waitFor(() => {
      expect(screen.getByText('GxP Validation Mode')).toBeInTheDocument()
    })
  })

  it('shows GxP mode enabled', async () => {
    render(<GxPDashboard />)
    await waitFor(() => {
      expect(screen.getByText('● ENABLED')).toBeInTheDocument()
    })
  })

  it('shows chain integrity status', async () => {
    render(<GxPDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Hash chain intact')).toBeInTheDocument()
    })
  })

  it('shows pending signatures count', async () => {
    render(<GxPDashboard />)
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })
  })
})
