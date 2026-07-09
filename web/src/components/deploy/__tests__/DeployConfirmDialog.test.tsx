import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/* ---------- Mocks ---------- */

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'deploy.confirmDeployment': 'Confirm Deployment',
        'deploy.workload': 'Workload',
        'deploy.group': 'Group',
        'deploy.resolvingDependencies': 'Resolving dependencies…',
        'deploy.couldNotResolve': 'Could not resolve dependencies',
        'deploy.canStillDeploy': 'You can still deploy without dependencies.',
        'deploy.noDependencies': 'No additional dependencies detected.',
        'deploy.optional': 'optional',
        'common.namespace': 'Namespace',
        'common.source': 'Source',
        'common.target': 'Target',
        'common.cancel': 'Cancel',
      }
      if (key === 'deploy.willDeployDeps') return `Will deploy ${opts?.count ?? 0} dependencies`
      if (key === 'deploy.deployToCluster') return `Deploy to ${opts?.count ?? 0} cluster(s)`
      return map[key] ?? key
    },
  }),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => (
    <span data-testid="cluster-badge">{cluster}</span>
  ),
}))

vi.mock('../../../lib/modals/BaseModal', () => {
  const BaseModal = ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div data-testid="base-modal">{children}</div> : null
  BaseModal.Header = ({ title, onClose }: { title: string; onClose: () => void }) => (
    <div data-testid="modal-header">
      <h2>{title}</h2>
      <button data-testid="close-btn" onClick={onClose}>×</button>
    </div>
  )
  BaseModal.Content = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="modal-content">{children}</div>
  )
  BaseModal.Footer = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="modal-footer">{children}</div>
  )
  return { BaseModal }
})

vi.mock('../../shared/TechnicalAcronym', () => ({
  wrapAbbreviations: (text: string) => text,
}))

const mockResolve = vi.fn()
const mockReset = vi.fn()
let mockHookReturn = {
  data: null as null | { dependencies: Array<{ kind: string; name: string; optional?: boolean }>; kind: string; warnings: string[] },
  isLoading: false,
  error: null as null | Error,
  progressMessage: '',
  resolve: mockResolve,
  reset: mockReset,
}

vi.mock('../../../hooks/useDependencies', () => ({
  useResolveDependencies: () => mockHookReturn,
  getDependencyResolutionErrorMessage: (err: Error) => err.message,
}))

import { DeployConfirmDialog } from '../DeployConfirmDialog'

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  workloadName: 'nginx-deployment',
  namespace: 'production',
  sourceCluster: 'ops-cluster',
  targetClusters: ['edge-1', 'edge-2'],
}

describe('DeployConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn = {
      data: null,
      isLoading: false,
      error: null,
      progressMessage: '',
      resolve: mockResolve,
      reset: mockReset,
    }
  })

  it('renders nothing when isOpen is false', () => {
    render(<DeployConfirmDialog {...defaultProps} isOpen={false} />)
    expect(screen.queryByTestId('base-modal')).not.toBeInTheDocument()
  })

  it('renders modal when isOpen is true', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByTestId('base-modal')).toBeInTheDocument()
  })

  it('displays the confirmation title', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Confirm Deployment')).toBeInTheDocument()
  })

  it('shows workload name', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('nginx-deployment')).toBeInTheDocument()
  })

  it('shows namespace', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('production')).toBeInTheDocument()
  })

  it('shows source cluster badge', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('ops-cluster')).toBeInTheDocument()
  })

  it('shows target cluster badges', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('edge-1')).toBeInTheDocument()
    expect(screen.getByText('edge-2')).toBeInTheDocument()
  })

  it('shows group name when provided', () => {
    render(<DeployConfirmDialog {...defaultProps} groupName="blue-green" />)
    expect(screen.getByText('blue-green')).toBeInTheDocument()
  })

  it('does not show group when not provided', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.queryByText('Group')).not.toBeInTheDocument()
  })

  it('calls onClose when cancel button clicked', () => {
    const onClose = vi.fn()
    render(<DeployConfirmDialog {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onConfirm when deploy button clicked', () => {
    const onConfirm = vi.fn()
    mockHookReturn.data = { dependencies: [], kind: 'Deployment', warnings: [] }
    render(<DeployConfirmDialog {...defaultProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText('Deploy to 2 cluster(s)'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onClose when header close button clicked', () => {
    const onClose = vi.fn()
    render(<DeployConfirmDialog {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('close-btn'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('DeployConfirmDialog — loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn = {
      data: null,
      isLoading: true,
      error: null,
      progressMessage: 'Scanning ConfigMaps…',
      resolve: mockResolve,
      reset: mockReset,
    }
  })

  it('shows loading spinner text', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Resolving dependencies…')).toBeInTheDocument()
  })

  it('shows progress message', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Scanning ConfigMaps…')).toBeInTheDocument()
  })

  it('disables deploy button while loading', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    const deployBtn = screen.getByText('Deploy to 2 cluster(s)')
    expect(deployBtn.closest('button')).toBeDisabled()
  })
})

describe('DeployConfirmDialog — error state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn = {
      data: null,
      isLoading: false,
      error: new Error('Cluster unreachable'),
      progressMessage: '',
      resolve: mockResolve,
      reset: mockReset,
    }
  })

  it('shows error message', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Could not resolve dependencies')).toBeInTheDocument()
    expect(screen.getByText('Cluster unreachable')).toBeInTheDocument()
  })

  it('shows fallback text allowing deploy without dependencies', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('You can still deploy without dependencies.')).toBeInTheDocument()
  })

  it('deploy button remains enabled on error', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    const deployBtn = screen.getByText('Deploy to 2 cluster(s)')
    expect(deployBtn.closest('button')).not.toBeDisabled()
  })
})

describe('DeployConfirmDialog — dependencies display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn = {
      data: {
        dependencies: [
          { kind: 'ConfigMap', name: 'nginx-config', optional: false },
          { kind: 'Secret', name: 'tls-cert', optional: false },
          { kind: 'ServiceAccount', name: 'nginx-sa', optional: true },
          { kind: 'Service', name: 'nginx-svc', optional: false },
          { kind: 'HorizontalPodAutoscaler', name: 'nginx-hpa', optional: false },
        ],
        kind: 'Deployment',
        warnings: [],
      },
      isLoading: false,
      error: null,
      progressMessage: '',
      resolve: mockResolve,
      reset: mockReset,
    }
  })

  it('shows dependency count', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Will deploy 5 dependencies')).toBeInTheDocument()
  })

  it('shows workload kind badge', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Deployment')).toBeInTheDocument()
  })

  it('renders category groups', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Configuration')).toBeInTheDocument()
    expect(screen.getByText('RBAC & Identity')).toBeInTheDocument()
    expect(screen.getByText('Networking')).toBeInTheDocument()
    expect(screen.getByText('Scaling & Availability')).toBeInTheDocument()
  })

  it('shows dependency count per category', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    // Configuration has ConfigMap + Secret = 2
    const configGroup = screen.getByText('Configuration').closest('button')
    expect(configGroup?.textContent).toContain('2')
  })

  it('expands group on click to reveal dependencies', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    const configBtn = screen.getByText('Configuration').closest('button')!
    fireEvent.click(configBtn)
    expect(screen.getByText('nginx-config')).toBeInTheDocument()
    expect(screen.getByText('tls-cert')).toBeInTheDocument()
  })

  it('collapses group on second click', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    const configBtn = screen.getByText('Configuration').closest('button')!
    fireEvent.click(configBtn)
    expect(screen.getByText('nginx-config')).toBeInTheDocument()
    fireEvent.click(configBtn)
    expect(screen.queryByText('nginx-config')).not.toBeInTheDocument()
  })

  it('marks optional dependencies', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    const rbacBtn = screen.getByText('RBAC & Identity').closest('button')!
    fireEvent.click(rbacBtn)
    expect(screen.getByText('optional')).toBeInTheDocument()
  })
})

describe('DeployConfirmDialog — no dependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn = {
      data: { dependencies: [], kind: 'Deployment', warnings: [] },
      isLoading: false,
      error: null,
      progressMessage: '',
      resolve: mockResolve,
      reset: mockReset,
    }
  })

  it('shows no dependencies message', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('No additional dependencies detected.')).toBeInTheDocument()
  })
})

describe('DeployConfirmDialog — warnings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn = {
      data: {
        dependencies: [{ kind: 'ConfigMap', name: 'app-config' }],
        kind: 'Deployment',
        warnings: ['Volume mount references missing PVC', 'Deprecated API version detected'],
      },
      isLoading: false,
      error: null,
      progressMessage: '',
      resolve: mockResolve,
      reset: mockReset,
    }
  })

  it('renders warning messages', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Volume mount references missing PVC')).toBeInTheDocument()
    expect(screen.getByText('Deprecated API version detected')).toBeInTheDocument()
  })
})

describe('DeployConfirmDialog — resolve lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHookReturn = {
      data: null,
      isLoading: false,
      error: null,
      progressMessage: '',
      resolve: mockResolve,
      reset: mockReset,
    }
  })

  it('calls resolve with correct args when dialog opens', () => {
    render(<DeployConfirmDialog {...defaultProps} />)
    expect(mockResolve).toHaveBeenCalledWith('ops-cluster', 'production', 'nginx-deployment')
  })

  it('calls reset when dialog is closed', () => {
    const { rerender } = render(<DeployConfirmDialog {...defaultProps} />)
    rerender(<DeployConfirmDialog {...defaultProps} isOpen={false} />)
    expect(mockReset).toHaveBeenCalled()
  })
})
