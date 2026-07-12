import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CanIChecker } from '../CanIChecker'

/* ---------- Mocks ---------- */

const mockCheckPermission = vi.fn()
const mockReset = vi.fn()

let mockChecking = false
let mockResult: { allowed: boolean; reason?: string } | null = null
let mockError: string | null = null

vi.mock('../../../hooks/usePermissions', () => ({
  useCanI: () => ({
    checkPermission: mockCheckPermission,
    checking: mockChecking,
    result: mockResult,
    error: mockError,
    reset: mockReset,
  }),
}))

let mockClusters = [{ name: 'cluster-a' }, { name: 'cluster-b' }]
let mockNamespaces = ['default', 'kube-system', 'kube-public']

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: mockClusters,
    deduplicatedClusters: mockClusters,
    isLoading: false,
    error: null,
  }),
  useNamespaces: () => ({
    namespaces: mockNamespaces,
    isLoading: false,
    error: null,
  }),
}))

vi.mock('../../ui/Button', () => ({
  Button: ({ children, onClick, disabled, variant, ...rest }: Record<string, unknown>) => (
    <button
      onClick={onClick as () => void}
      disabled={disabled as boolean}
      data-variant={variant as string}
      {...rest}
    >
      {children as React.ReactNode}
    </button>
  ),
}))

vi.mock('../../PageErrorBoundary', () => ({
  PageErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

/* ---------- Tests ---------- */

describe('CanIChecker — Initial Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChecking = false
    mockResult = null
    mockError = null
  })

  it('renders the permission checker heading and form elements', () => {
    render(<CanIChecker />)

    expect(screen.getByText('rbac.permissionChecker')).toBeInTheDocument()
    expect(screen.getByTestId('can-i-cluster')).toBeInTheDocument()
    expect(screen.getByTestId('can-i-verb')).toBeInTheDocument()
    expect(screen.getByTestId('can-i-resource')).toBeInTheDocument()
    expect(screen.getByTestId('can-i-namespace')).toBeInTheDocument()
    expect(screen.getByTestId('can-i-api-group')).toBeInTheDocument()
    expect(screen.getByTestId('can-i-check')).toBeInTheDocument()
  })

  it('populates cluster dropdown with provided clusters', () => {
    render(<CanIChecker />)

    const clusterSelect = screen.getByTestId('can-i-cluster') as HTMLSelectElement
    const options = Array.from(clusterSelect.options)

    expect(options).toHaveLength(2)
    expect(options[0].value).toBe('cluster-a')
    expect(options[1].value).toBe('cluster-b')
  })

  it('populates namespace dropdown with fetched namespaces', () => {
    render(<CanIChecker />)

    const nsSelect = screen.getByTestId('can-i-namespace') as HTMLSelectElement
    const options = Array.from(nsSelect.options)

    // First option is "all namespaces", then real namespaces
    expect(options.length).toBeGreaterThanOrEqual(3)
    expect(options.some(opt => opt.value === 'default')).toBe(true)
    expect(options.some(opt => opt.value === 'kube-system')).toBe(true)
  })

  it('defaults to first cluster', () => {
    render(<CanIChecker />)

    const clusterSelect = screen.getByTestId('can-i-cluster') as HTMLSelectElement
    expect(clusterSelect.value).toBe('cluster-a')
  })

  it('defaults verb and resource to common values', () => {
    render(<CanIChecker />)

    const verbSelect = screen.getByTestId('can-i-verb') as HTMLSelectElement
    const resourceSelect = screen.getByTestId('can-i-resource') as HTMLSelectElement

    expect(verbSelect.value).toBe('get')
    expect(resourceSelect.value).toBe('pods')
  })
})

describe('CanIChecker — Form Interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChecking = false
    mockResult = null
    mockError = null
  })

  it('calls checkPermission with defaults when Check button is clicked', async () => {
    render(<CanIChecker />)

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        cluster: 'cluster-a',
        verb: 'get',
        resource: 'pods',
      })
    )
  })

  it('allows changing cluster selection', async () => {
    render(<CanIChecker />)

    const clusterSelect = screen.getByTestId('can-i-cluster')
    fireEvent.change(clusterSelect, { target: { value: 'cluster-b' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        cluster: 'cluster-b',
      })
    )
  })

  it('allows changing verb selection', async () => {
    render(<CanIChecker />)

    const verbSelect = screen.getByTestId('can-i-verb')
    fireEvent.change(verbSelect, { target: { value: 'list' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: 'list',
      })
    )
  })

  it('allows changing resource selection', async () => {
    render(<CanIChecker />)

    const resourceSelect = screen.getByTestId('can-i-resource')
    fireEvent.change(resourceSelect, { target: { value: 'deployments' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'deployments',
      })
    )
  })

  it('allows changing namespace selection', async () => {
    render(<CanIChecker />)

    const nsSelect = screen.getByTestId('can-i-namespace')
    fireEvent.change(nsSelect, { target: { value: 'kube-system' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'kube-system',
      })
    )
  })

  it('sends undefined namespace when "all namespaces" is selected', async () => {
    render(<CanIChecker />)

    const nsSelect = screen.getByTestId('can-i-namespace')
    // First option is "all namespaces"
    fireEvent.change(nsSelect, { target: { value: '' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: undefined,
      })
    )
  })

  it('shows custom verb input when "custom" verb is selected', async () => {
    render(<CanIChecker />)

    const verbSelect = screen.getByTestId('can-i-verb')
    fireEvent.change(verbSelect, { target: { value: 'custom' } })

    expect(screen.getByTestId('can-i-custom-verb')).toBeInTheDocument()
  })

  it('uses custom verb value when submitted', async () => {
    render(<CanIChecker />)

    const verbSelect = screen.getByTestId('can-i-verb')
    fireEvent.change(verbSelect, { target: { value: 'custom' } })

    const customVerbInput = screen.getByTestId('can-i-custom-verb')
    fireEvent.change(customVerbInput, { target: { value: 'impersonate' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: 'impersonate',
      })
    )
  })

  it('shows custom resource input when "custom" resource is selected', async () => {
    render(<CanIChecker />)

    const resourceSelect = screen.getByTestId('can-i-resource')
    fireEvent.change(resourceSelect, { target: { value: 'custom' } })

    expect(screen.getByTestId('can-i-custom-resource')).toBeInTheDocument()
  })

  it('uses custom resource value when submitted', async () => {
    render(<CanIChecker />)

    const resourceSelect = screen.getByTestId('can-i-resource')
    fireEvent.change(resourceSelect, { target: { value: 'custom' } })

    const customResourceInput = screen.getByTestId('can-i-custom-resource')
    fireEvent.change(customResourceInput, { target: { value: 'customresources' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'customresources',
      })
    )
  })

  it('shows custom API group input when "custom" api group is selected', () => {
    render(<CanIChecker />)

    const apiGroupSelect = screen.getByTestId('can-i-api-group')
    fireEvent.change(apiGroupSelect, { target: { value: 'custom' } })

    expect(screen.getByTestId('can-i-custom-api-group')).toBeInTheDocument()
  })

  it('uses custom API group value when submitted', async () => {
    render(<CanIChecker />)

    const apiGroupSelect = screen.getByTestId('can-i-api-group')
    fireEvent.change(apiGroupSelect, { target: { value: 'custom' } })

    const customApiGroupInput = screen.getByTestId('can-i-custom-api-group')
    fireEvent.change(customApiGroupInput, { target: { value: 'custom.example.com' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        group: 'custom.example.com',
      })
    )
  })

  it('toggles advanced section visibility', async () => {
    render(<CanIChecker />)

    // Advanced section should not be visible initially
    expect(screen.queryByText('rbac.commonApiGroupsTitle')).not.toBeInTheDocument()

    const advancedBtn = screen.getByText('rbac.showAdvanced')
    await userEvent.click(advancedBtn)

    // Now should be visible
    expect(screen.getByText('rbac.commonApiGroupsTitle')).toBeInTheDocument()
  })
})

describe('CanIChecker — Loading State', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading indicator when checking permissions', () => {
    mockChecking = true
    mockResult = null
    mockError = null

    render(<CanIChecker />)

    // Button should be disabled during checking
    expect(screen.getByTestId('can-i-check')).toBeDisabled()
  })

  it('disables check button during permission check', () => {
    mockChecking = true
    mockResult = null
    mockError = null

    render(<CanIChecker />)

    const checkBtn = screen.getByTestId('can-i-check')
    expect(checkBtn).toBeDisabled()
  })
})

describe('CanIChecker — Result Display (Allowed)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChecking = false
  })

  it('shows reset button when allowed result is returned', () => {
    mockResult = { allowed: true, reason: 'RBAC policy allows' }
    mockError = null

    render(<CanIChecker />)

    // The result banner requires checkedSnapshot (set via handleCheck flow).
    // With static mocks, we verify the reset button appears (guarded by result || error).
    expect(screen.getByTestId('can-i-reset')).toBeInTheDocument()
  })

  it('calls reset when reset button is clicked', async () => {
    mockResult = { allowed: true }
    mockError = null

    render(<CanIChecker />)

    const resetBtn = screen.getByTestId('can-i-reset')
    await userEvent.click(resetBtn)

    expect(mockReset).toHaveBeenCalled()
  })

  it('shows allowed result when permission is granted', async () => {
    mockResult = { allowed: true }
    mockError = null

    render(<CanIChecker />)

    await userEvent.click(screen.getByTestId('can-i-check'))

    await waitFor(() => {
      expect(screen.getByText('rbac.allowed')).toBeInTheDocument()
    })
  })
})

describe('CanIChecker — Result Display (Denied)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChecking = false
  })

  it('shows reset button when denied result is returned', () => {
    mockResult = { allowed: false, reason: 'User does not have permission' }
    mockError = null

    render(<CanIChecker />)

    // The result banner (with denied text and reason) requires checkedSnapshot
    // which is only set via the handleCheck interaction flow. With static mocks
    // we verify the reset button appears (guarded by result || error).
    expect(screen.getByTestId('can-i-reset')).toBeInTheDocument()
  })

  it('shows reset button for denied result without reason', () => {
    mockResult = { allowed: false }
    mockError = null

    render(<CanIChecker />)

    const resetBtn = screen.getByTestId('can-i-reset')
    expect(resetBtn).toBeInTheDocument()
  })

  it('shows denied result when permission is not granted', async () => {
    mockResult = { allowed: false }
    mockError = null

    render(<CanIChecker />)

    await userEvent.click(screen.getByTestId('can-i-check'))

    await waitFor(() => {
      expect(screen.getByText('rbac.denied')).toBeInTheDocument()
    })
  })
})

describe('CanIChecker — Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChecking = false
    mockResult = null
  })

  it('shows error message when API call fails', () => {
    mockError = 'Failed to connect to cluster'

    render(<CanIChecker />)

    expect(screen.getByText(/Failed to connect to cluster/i)).toBeInTheDocument()
  })

  it('shows reset button when error is displayed', () => {
    mockError = 'Network error'

    render(<CanIChecker />)

    const resetBtn = screen.getByTestId('can-i-reset')
    expect(resetBtn).toBeInTheDocument()
  })

  it('calls reset when reset button is clicked after error', async () => {
    mockError = 'API timeout'

    render(<CanIChecker />)

    const resetBtn = screen.getByTestId('can-i-reset')
    await userEvent.click(resetBtn)

    expect(mockReset).toHaveBeenCalled()
  })
})

describe('CanIChecker — No Clusters Available', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClusters = []
    mockChecking = false
    mockResult = null
    mockError = null
  })

  afterEach(() => {
    // Restore default clusters
    mockClusters = [{ name: 'cluster-a' }, { name: 'cluster-b' }]
  })

  it('shows warning and disables check button when no clusters available', () => {
    render(<CanIChecker />)

    expect(screen.getByText('rbac.noClustersAvailable')).toBeInTheDocument()
    expect(screen.getByTestId('can-i-check')).toBeDisabled()
  })

  it('does not allow submitting when no clusters are present', async () => {
    render(<CanIChecker />)

    const checkBtn = screen.getByTestId('can-i-check')
    expect(checkBtn).toBeDisabled()

    await userEvent.click(checkBtn)

    // Should not call checkPermission
    expect(mockCheckPermission).not.toHaveBeenCalled()
  })
})

describe('CanIChecker — Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChecking = false
    mockResult = null
    mockError = null
  })

  it('handles empty custom verb input', async () => {
    render(<CanIChecker />)

    const verbSelect = screen.getByTestId('can-i-verb')
    fireEvent.change(verbSelect, { target: { value: 'custom' } })

    const customVerbInput = screen.getByTestId('can-i-custom-verb')
    fireEvent.change(customVerbInput, { target: { value: '' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    // Should not call permission check with empty verb
    expect(mockCheckPermission).not.toHaveBeenCalled()
  })

  it('handles empty custom resource input', async () => {
    render(<CanIChecker />)

    const resourceSelect = screen.getByTestId('can-i-resource')
    fireEvent.change(resourceSelect, { target: { value: 'custom' } })

    const customResourceInput = screen.getByTestId('can-i-custom-resource')
    fireEvent.change(customResourceInput, { target: { value: '' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).not.toHaveBeenCalled()
  })

  it('handles wildcard resources', async () => {
    render(<CanIChecker />)

    const resourceSelect = screen.getByTestId('can-i-resource')
    fireEvent.change(resourceSelect, { target: { value: 'custom' } })

    const customResourceInput = screen.getByTestId('can-i-custom-resource')
    fireEvent.change(customResourceInput, { target: { value: '*' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: '*',
      })
    )
  })

  it('handles empty namespaces list gracefully', () => {
    mockNamespaces = []

    render(<CanIChecker />)

    const nsSelect = screen.getByTestId('can-i-namespace') as HTMLSelectElement
    const options = Array.from(nsSelect.options)

    // Should at least have "all namespaces" option
    expect(options.length).toBeGreaterThanOrEqual(1)
  })

  it('handles special characters in custom inputs', async () => {
    render(<CanIChecker />)

    const resourceSelect = screen.getByTestId('can-i-resource')
    fireEvent.change(resourceSelect, { target: { value: 'custom' } })

    const customResourceInput = screen.getByTestId('can-i-custom-resource')
    fireEvent.change(customResourceInput, { target: { value: 'my-custom-resource.v1' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'my-custom-resource.v1',
      })
    )
  })

  it('handles multiple rapid clicks on check button', async () => {
    render(<CanIChecker />)

    const checkBtn = screen.getByTestId('can-i-check')
    
    await userEvent.click(checkBtn)
    await userEvent.click(checkBtn)
    await userEvent.click(checkBtn)

    // Should have been called, but exact count depends on debouncing implementation
    expect(mockCheckPermission).toHaveBeenCalled()
  })
})

describe('CanIChecker — API Group Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChecking = false
    mockResult = null
    mockError = null
  })

  it('sends correct API group for apps resources', async () => {
    render(<CanIChecker />)

    const resourceSelect = screen.getByTestId('can-i-resource')
    fireEvent.change(resourceSelect, { target: { value: 'deployments' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'deployments',
        group: 'apps',
      })
    )
  })

  it('sends empty API group for core resources', async () => {
    render(<CanIChecker />)

    const resourceSelect = screen.getByTestId('can-i-resource')
    fireEvent.change(resourceSelect, { target: { value: 'pods' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'pods',
        group: '',
      })
    )
  })

  it('allows overriding automatic API group selection', async () => {
    render(<CanIChecker />)

    const resourceSelect = screen.getByTestId('can-i-resource')
    fireEvent.change(resourceSelect, { target: { value: 'deployments' } })

    const apiGroupSelect = screen.getByTestId('can-i-api-group')
    fireEvent.change(apiGroupSelect, { target: { value: 'custom' } })

    const customApiGroupInput = screen.getByTestId('can-i-custom-api-group')
    fireEvent.change(customApiGroupInput, { target: { value: 'override.example.com' } })

    const checkBtn = screen.getByTestId('can-i-check')
    await userEvent.click(checkBtn)

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'deployments',
        group: 'override.example.com',
      })
    )
  })
})
