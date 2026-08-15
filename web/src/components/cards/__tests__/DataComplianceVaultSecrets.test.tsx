import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { VaultSecrets } from '../DataComplianceVaultSecrets'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode(), toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
}))

const mockClusters = vi.fn(() => [])
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => {
    const clusters = mockClusters()
    return { clusters, deduplicatedClusters: clusters }
  },
}))

const mockKubectlExec = vi.fn()
vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockKubectlExec(...args) },
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
  useCardDemoState: () => ({ shouldUseDemoData: mockIsDemoMode(), reason: null, showDemoBadge: false }),
}))

vi.mock('../../../lib/constants/network', () => ({
  KUBECTL_DEFAULT_TIMEOUT_MS: 5000,
  DEFAULT_REFRESH_INTERVAL_MS: 30000,
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DataComplianceVaultSecrets (VaultSecrets)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    mockClusters.mockReturnValue([])
    mockUseCardLoadingState.mockReturnValue({})
    mockKubectlExec.mockResolvedValue({ exitCode: 1, output: '' })
  })

  it('renders without crashing', async () => {
    await act(async () => render(<VaultSecrets />))
    expect(document.body).toBeTruthy()
  })

  it('calls useCardLoadingState during render', async () => {
    await act(async () => render(<VaultSecrets />))
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  describe('demo / no clusters', () => {
    it('shows vault integration notice in demo mode', async () => {
      mockIsDemoMode.mockReturnValue(true)
      await act(async () => render(<VaultSecrets />))
      expect(screen.getByText('Vault Integration')).toBeInTheDocument()
    })

    it('shows no-clusters message when no clusters connected', async () => {
      mockClusters.mockReturnValue([])
      await act(async () => render(<VaultSecrets />))
      expect(screen.getByText('No clusters connected')).toBeInTheDocument()
    })

    it('shows install guide link', async () => {
      const { container } = render(<VaultSecrets />)
      await act(async () => {})
      const link = container.querySelector('a[href*="hashicorp.com"]')
      expect(link).toBeTruthy()
    })
  })

  describe('reachable clusters — Vault not detected', () => {
    const cluster = { name: 'prod', reachable: true }

    beforeEach(() => {
      mockClusters.mockReturnValue([cluster])
      // pods result: no vault pods
      mockKubectlExec.mockResolvedValue({ exitCode: 0, output: JSON.stringify({ items: [] }) })
    })

    it('shows not-installed message after scan', async () => {
      await act(async () => render(<VaultSecrets />))
      expect(screen.getByText(/no Vault installation detected/i)).toBeInTheDocument()
    })
  })

  describe('reachable clusters — Vault detected', () => {
    const cluster = { name: 'prod', reachable: true }
    const runningPod = { status: { phase: 'Running' } }

    beforeEach(() => {
      mockClusters.mockReturnValue([cluster])
      // First call: pods result with running vault pods
      mockKubectlExec
        .mockResolvedValueOnce({ exitCode: 0, output: JSON.stringify({ items: [runningPod] }) })
        // Second call: secrets count
        .mockResolvedValueOnce({ exitCode: 0, output: '111' })
    })

    it('shows vault sealed status badge when installed', async () => {
      await act(async () => render(<VaultSecrets />))
      // "unsealed" badge appears when readyPods > 0
      expect(screen.getByText('unsealed')).toBeInTheDocument()
    })
  })

  describe('fetch error', () => {
    it('shows error UI when kubectl throws on all clusters', async () => {
      const cluster = { name: 'prod', reachable: true }
      mockClusters.mockReturnValue([cluster])
      mockKubectlExec.mockRejectedValue(new Error('connection refused'))
      await act(async () => render(<VaultSecrets />))
      // Component renders error alert
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
