import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkloadImportDialog } from './WorkloadImportDialog'
import type { Workload } from './WorkloadDeployment'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${opts.count}`
      const parts = key.split('.')
      return parts[parts.length - 1]
    },
  }),
}))

vi.mock('../../lib/modals/useModalNavigation', () => ({
  useModalNavigation: vi.fn(),
  useModalFocusTrap: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkloadImportDialog', () => {
  let mockOnClose: () => void
  let mockOnImport: (workloads: Workload[]) => void

  let originalCreateObjectURL: typeof window.URL.createObjectURL

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnClose = vi.fn()
    mockOnImport = vi.fn()

    if (typeof window !== 'undefined') {
      originalCreateObjectURL = window.URL.createObjectURL
      Object.defineProperty(window.URL, 'createObjectURL', {
        writable: true,
        configurable: true,
        value: vi.fn(),
      })
    }
  })

  afterEach(() => {
    if (typeof window !== 'undefined') {
      Object.defineProperty(window.URL, 'createObjectURL', {
        writable: true,
        configurable: true,
        value: originalCreateObjectURL,
      })
    }
  })

  // ---- 1. Renders all import source tabs ----
  it('renders all 4 import source tabs (YAML, Helm, GitHub, Kustomize)', () => {
    render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
      />
    )

    expect(screen.getByText('tabYaml')).toBeInTheDocument()
    expect(screen.getByText('tabHelm')).toBeInTheDocument()
    expect(screen.getByText('tabGithub')).toBeInTheDocument()
    expect(screen.getByText('tabKustomize')).toBeInTheDocument()
  })

  // ---- 2. Renders appropriate fields when active tab changes ----
  it('renders appropriate input fields and description as active tab changes', async () => {
    render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
      />
    )

    // Initially active tab is YAML
    expect(screen.getByPlaceholderText('yamlPlaceholder')).toBeInTheDocument()

    // Click on Helm Tab
    fireEvent.click(screen.getByText('tabHelm'))
    expect(screen.getByPlaceholderText('https://charts.example.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('my-chart')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('my-release')).toBeInTheDocument()

    // Click on GitHub Tab
    fireEvent.click(screen.getByText('tabGithub'))
    expect(screen.getByPlaceholderText('https://github.com/org/repo')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('k8s/ or deploy/manifests/')).toBeInTheDocument()

    // Click on Kustomize Tab
    fireEvent.click(screen.getByText('tabKustomize'))
    expect(screen.getByPlaceholderText('https://github.com/org/repo/tree/main/overlays/prod')).toBeInTheDocument()
  })

  // ---- 3. Submit disabled when input is empty ----
  it('disables "Preview" and "Import" buttons when input fields are empty', () => {
    render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
      />
    )

    // YAML empty text
    const previewBtn = screen.getByText('preview')
    const importBtn = screen.getByText('import')

    expect(previewBtn).toBeDisabled()
    expect(importBtn).toBeDisabled()
  })

  // ---- 4. Valid single-document YAML input -> parses and imports ----
  it('parses valid single-document YAML, shows preview, and successfully imports', async () => {
    const user = userEvent.setup()
    render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
      />
    )

    const textarea = screen.getByPlaceholderText('yamlPlaceholder')
    const yamlContent = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-web
  namespace: prod
spec:
  template:
    spec:
      containers:
      - name: nginx
        image: nginx:1.21.0
`
    await user.type(textarea, yamlContent)

    // Buttons should now be enabled
    const previewBtn = screen.getByText('preview')
    const importBtn = screen.getByText('import')

    expect(previewBtn).not.toBeDisabled()
    expect(importBtn).not.toBeDisabled()

    // Click Preview
    await user.click(previewBtn)

    // Table elements should be visible
    expect(screen.getByText('nginx-web')).toBeInTheDocument()
    expect(screen.getByText('prod')).toBeInTheDocument()
    expect(screen.getByText('nginx:1.21.0')).toBeInTheDocument()

    // Click Import
    await user.click(importBtn)

    // Callback must be triggered with mapped workload object
    expect(mockOnImport).toHaveBeenCalledTimes(1)
    const importedWorkloads = mockOnImport.mock.calls[0][0]
    expect(importedWorkloads).toHaveLength(1)
    expect(importedWorkloads[0]).toEqual(
      expect.objectContaining({
        name: 'nginx-web',
        namespace: 'prod',
        type: 'Deployment',
        image: 'nginx:1.21.0',
        status: 'Pending',
        replicas: 1,
      })
    )

    // Success banner must show
    expect(screen.getByText('importSuccess')).toBeInTheDocument()
  })

  // ---- 5. Valid multi-document YAML separated by --- ----
  it('parses valid multi-document YAML separated by --- and lists both', async () => {
    const user = userEvent.setup()
    render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
      />
    )

    const textarea = screen.getByPlaceholderText('yamlPlaceholder')
    const yamlContent = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-deploy
  namespace: staging
spec:
  template:
    spec:
      containers:
      - name: app
        image: my-app:v1
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: app-cron
  namespace: staging
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: runner
            image: runner-image:latest
`
    await user.type(textarea, yamlContent)

    const previewBtn = screen.getByText('preview')
    await user.click(previewBtn)

    // Both workloads should render in preview
    expect(screen.getByText('app-deploy')).toBeInTheDocument()
    expect(screen.getByText('app-cron')).toBeInTheDocument()
    expect(screen.getByText('my-app:v1')).toBeInTheDocument()
    expect(screen.getByText('runner-image:latest')).toBeInTheDocument()

    // Click Import
    await user.click(screen.getByText('import'))

    expect(mockOnImport).toHaveBeenCalledTimes(1)
    const workloads = mockOnImport.mock.calls[0][0]
    expect(workloads).toHaveLength(2)
    expect(workloads[0].name).toBe('app-deploy')
    expect(workloads[1].name).toBe('app-cron')
    expect(workloads[1].type).toBe('CronJob')
  })

  // ---- 6. Malformed YAML input ----
  it('shows inline validation error and blocks import when YAML is malformed', async () => {
    const user = userEvent.setup()
    render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
      />
    )

    const textarea = screen.getByPlaceholderText('yamlPlaceholder')
    // Malformed yaml due to incorrect indentation / trailing colon
    const malformedYaml = `
apiVersion: apps/v1
kind: Deployment
  metadata:
    name: name: name
`
    await user.type(textarea, malformedYaml)

    const previewBtn = screen.getByText('preview')
    await user.click(previewBtn)

    // Should display parse error message containing validation details
    expect(screen.getByText(/YAML parse error/)).toBeInTheDocument()
    expect(mockOnImport).not.toHaveBeenCalled()
  })

  // ---- 7. Unsupported resource kind in YAML ----
  it('shows validation warning and blocks import when YAML specifies unsupported kind', async () => {
    const user = userEvent.setup()
    render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
      />
    )

    const textarea = screen.getByPlaceholderText('yamlPlaceholder')
    // Pod is unsupported (VALID_WORKLOAD_KINDS contains Deployment, StatefulSet, DaemonSet, Job, CronJob)
    const unsupportedYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
`
    await user.type(textarea, unsupportedYaml)

    const previewBtn = screen.getByText('preview')
    await user.click(previewBtn)

    expect(screen.getByText(/Unsupported kind "Pod"/)).toBeInTheDocument()

    // Import button should not trigger since errors array has items and resources list is empty
    await user.click(screen.getByText('import'))
    expect(mockOnImport).not.toHaveBeenCalled()
  })

  // ---- 8. Helm Tab import ----
  it('renders, previews, and imports Helm charts successfully', async () => {
    const user = userEvent.setup()
    render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
      />
    )

    fireEvent.click(screen.getByText('tabHelm'))

    const repoUrl = screen.getByPlaceholderText('https://charts.example.com')
    const chartName = screen.getByPlaceholderText('my-chart')
    const releaseName = screen.getByPlaceholderText('my-release')

    await user.type(repoUrl, 'https://helm.kubestellar.io')
    await user.type(chartName, 'console-chart')
    await user.type(releaseName, 'ks-release')

    const previewBtn = screen.getByText('preview')
    await user.click(previewBtn)

    // Renders the single preview row
    expect(screen.getByText('ks-release')).toBeInTheDocument()
    expect(screen.getByText('console-chart:latest')).toBeInTheDocument()

    // Click Import
    await user.click(screen.getByText('import'))

    expect(mockOnImport).toHaveBeenCalledTimes(1)
    const workloads = mockOnImport.mock.calls[0][0]
    expect(workloads).toHaveLength(1)
    expect(workloads[0].name).toBe('ks-release')
    expect(workloads[0].labels['helm.sh/chart']).toBe('console-chart')
    expect(workloads[0].labels['helm.sh/repo']).toBe('https://helm.kubestellar.io')
  })

  // ---- 9. GitHub Tab import ----
  it('renders, previews, and imports GitHub repository manifests successfully', async () => {
    const user = userEvent.setup()
    render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
      />
    )

    fireEvent.click(screen.getByText('tabGithub'))

    const repoUrl = screen.getByPlaceholderText('https://github.com/org/repo')
    const pathInput = screen.getByPlaceholderText('k8s/ or deploy/manifests/')

    await user.type(repoUrl, 'https://github.com/kubestellar/console')
    await user.type(pathInput, 'deploy/yaml')

    const previewBtn = screen.getByText('preview')
    await user.click(previewBtn)

    expect(screen.getByText('console-manifests')).toBeInTheDocument()
    expect(screen.getByText('github:https://github.com/kubestellar/console (deploy/yaml)')).toBeInTheDocument()

    // Click Import
    await user.click(screen.getByText('import'))

    expect(mockOnImport).toHaveBeenCalledTimes(1)
    const workloads = mockOnImport.mock.calls[0][0]
    expect(workloads).toHaveLength(1)
    expect(workloads[0].name).toBe('console-manifests')
    expect(workloads[0].labels['source/type']).toBe('github')
    expect(workloads[0].labels['source/url']).toBe('https://github.com/kubestellar/console')
  })

  // ---- 10. Kustomize Tab import ----
  it('renders, previews, and imports Kustomize manifest directories successfully', async () => {
    const user = userEvent.setup()
    render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
      />
    )

    fireEvent.click(screen.getByText('tabKustomize'))

    const dirUrl = screen.getByPlaceholderText('https://github.com/org/repo/tree/main/overlays/prod')

    await user.type(dirUrl, 'https://github.com/org/repo/overlays/prod')

    const previewBtn = screen.getByText('preview')
    await user.click(previewBtn)

    expect(screen.getByText('prod-kustomize')).toBeInTheDocument()
    expect(screen.getByText('kustomize:https://github.com/org/repo/overlays/prod')).toBeInTheDocument()

    // Click Import
    await user.click(screen.getByText('import'))

    expect(mockOnImport).toHaveBeenCalledTimes(1)
    const workloads = mockOnImport.mock.calls[0][0]
    expect(workloads).toHaveLength(1)
    expect(workloads[0].name).toBe('prod-kustomize')
    expect(workloads[0].labels['source/type']).toBe('kustomize')
    expect(workloads[0].labels['source/url']).toBe('https://github.com/org/repo/overlays/prod')
  })

  // ---- 11. Dialog close/cancel resets state ----
  it('resets dialog input and preview states when closed', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
      />
    )

    const textarea = screen.getByPlaceholderText('yamlPlaceholder')
    await user.type(textarea, 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: nginx')

    const previewBtn = screen.getByText('preview')
    await user.click(previewBtn)

    // Preview table is showing
    expect(screen.getByText('nginx')).toBeInTheDocument()

    // Close dialog by clicking close button inside BaseModal Header
    const closeBtn = screen.getByLabelText('Close modal (Esc)')
    await user.click(closeBtn)

    expect(mockOnClose).toHaveBeenCalledTimes(1)

    // Re-render as open again to check that all state has been reset
    rerender(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
      />
    )

    // Textarea should be completely empty and preview table should be gone
    expect(screen.getByPlaceholderText('yamlPlaceholder')).toHaveValue('')
    expect(screen.queryByText('nginx')).not.toBeInTheDocument()
  })

  // ---- 12. isDemoData=true behavior ----
  it('disables import buttons and renders high-visibility warning banner when isDemoData is true', async () => {
    const user = userEvent.setup()
    render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        isDemoData={true}
      />
    )

    // Checks banner is displayed
    expect(screen.getByTestId('demo-warning-banner')).toBeInTheDocument()
    expect(screen.getByText(/demoModeWarning/)).toBeInTheDocument()

    const textarea = screen.getByPlaceholderText('yamlPlaceholder')
    await user.type(textarea, 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: nginx')

    // Preview should still work, but import must be disabled
    const previewBtn = screen.getByText('preview')
    const importBtn = screen.getByText('import')

    expect(previewBtn).not.toBeDisabled()
    expect(importBtn).toBeDisabled() // disabled because isDemoData is true
  })

  // ---- 13. isLoading=true behavior ----
  it('sets submit buttons to their busy loading state when isLoading is true', async () => {
    const user = userEvent.setup()
    render(
      <WorkloadImportDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        isLoading={true}
      />
    )

    const textarea = screen.getByPlaceholderText('yamlPlaceholder')
    await user.type(textarea, 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: nginx')

    const importBtn = screen.getByText('import')

    // The button should be disabled because loading is true
    expect(importBtn).toBeDisabled()
    expect(importBtn).toHaveAttribute('aria-busy', 'true')
  })
})
