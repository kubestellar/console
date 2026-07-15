import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ExternalSecrets } from './DataComplianceExternalSecrets'

const mockUseClusters = vi.hoisted(() => vi.fn())
const mockExec = vi.hoisted(() => vi.fn())
const mockUseCardLoadingState = vi.hoisted(() => vi.fn())
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('../../hooks/useMCP', () => ({ useClusters: () => mockUseClusters() }))
vi.mock('../../lib/kubectlProxy', () => ({ kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) } }))
vi.mock('../../hooks/useDemoMode', () => ({ useDemoMode: () => ({ isDemoMode: false }) }))
vi.mock('./CardDataContext', () => ({ useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args) }))

function setup(clusters: Array<{ name: string; reachable: boolean }> = [], execImpl?: () => Promise<{ exitCode: number; output?: string }>) { mockUseClusters.mockReturnValue({ deduplicatedClusters: clusters }); mockExec.mockImplementation(execImpl ?? (async () => ({ exitCode: 1, output: '' }))); mockUseCardLoadingState.mockReturnValue({}) }

describe('ExternalSecrets', () => {
  beforeEach(() => { vi.clearAllMocks(); setup() })
  it('renders loading skeleton/loading state', () => { setup([{ name: 'prod', reachable: true }], () => new Promise(() => undefined)); render(<ExternalSecrets config={{}} />); expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({ isLoading: true })) })
  it('renders empty state when not installed', async () => { setup(); render(<ExternalSecrets config={{}} />); expect(await screen.findByText('No clusters connected')).toBeInTheDocument() })
  it('renders error state', async () => { setup([{ name: 'prod', reachable: true }], async () => { throw new Error('down') }); render(<ExternalSecrets config={{}} />); expect(await screen.findByText('Failed to fetch ESO status')).toBeInTheDocument() })
  it('renders happy-path data', async () => { let call = 0; setup([{ name: 'prod', reachable: true }], async () => { call += 1; if (call === 1) return { exitCode: 0, output: 'crd' }; if (call === 2) return { exitCode: 0, output: '11' }; return { exitCode: 0, output: JSON.stringify({ items: [{ status: { conditions: [{ type: 'Ready', status: 'True' }] } }] }) } }); render(<ExternalSecrets config={{}} />); expect(await screen.findByText('100% synced')).toBeInTheDocument(); expect(screen.getByText('Secret Stores')).toBeInTheDocument() })
  it('matches snapshot', async () => { setup(); const { container } = render(<ExternalSecrets config={{}} />); await waitFor(() => expect(screen.getByText('No clusters connected')).toBeInTheDocument()); expect(container).toMatchSnapshot() })
})
