import type { ComponentProps } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OrbitType } from '../../../lib/missions/types'

const mockNavigate = vi.fn()
const mockGenerateGroundControlDashboard = vi.fn()
const mockGetApplicableOrbitTemplates = vi.fn()
const mockEmitOrbitMissionCreated = vi.fn()
const mockIsDemoMode = vi.fn(() => false)

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (!options) return key
      return `${key}:${Object.entries(options).map(([name, value]) => `${name}=${String(value)}`).join(',')}`
    },
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../../hooks/useGroundControlDashboard', () => ({
  useGroundControlDashboard: () => ({
    generateGroundControlDashboard: mockGenerateGroundControlDashboard,
  }),
}))

vi.mock('../../../lib/orbit/orbitTemplates', () => ({
  getApplicableOrbitTemplates: (categories: string[]) => mockGetApplicableOrbitTemplates(categories),
}))

vi.mock('../../../lib/analytics', () => ({
  emitOrbitMissionCreated: (orbitType: string, cadence: string) => mockEmitOrbitMissionCreated(orbitType, cadence),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
    isOpen
      ? (
          <div data-testid="setup-instructions-dialog">
            <button onClick={onClose}>close-setup-dialog</button>
          </div>
        )
      : null
  ),
}))

import { OrbitSetupOffer } from '../OrbitSetupOffer'

const TEMPLATE_FIXTURES = [
  {
    orbitType: 'health-check',
    title: 'Health Check',
    description: 'Verify workload health.',
  },
  {
    orbitType: 'cert-rotation',
    title: 'Certificate Rotation Check',
    description: 'Review certificate expiry.',
  },
] satisfies Array<{ orbitType: OrbitType; title: string; description: string }>

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function renderComponent(overrides?: Partial<ComponentProps<typeof OrbitSetupOffer>>) {
  const onCreateOrbit = vi.fn()
  const onDashboardCreated = vi.fn()
  const onSkip = vi.fn()

  const props: ComponentProps<typeof OrbitSetupOffer> = {
    projects: [
      { name: 'Kyverno', category: 'Security' },
      { name: 'Velero', category: 'Storage' },
    ],
    clusters: ['cluster-a', 'cluster-b'],
    missionControlStateKey: 'mission-control-123',
    onCreateOrbit,
    onDashboardCreated,
    onSkip,
    ...overrides,
  }

  const view = render(<OrbitSetupOffer {...props} />)
  return { ...view, props, onCreateOrbit, onDashboardCreated, onSkip }
}

function getTemplateToggle(title: string) {
  const toggleLabel = screen.getByText(title).closest('label')
  expect(toggleLabel).not.toBeNull()
  return toggleLabel as HTMLLabelElement
}

describe('OrbitSetupOffer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockReset()
    mockGetApplicableOrbitTemplates.mockReturnValue(TEMPLATE_FIXTURES.map(template => ({ ...template })))
    mockGenerateGroundControlDashboard.mockResolvedValue({ dashboardId: 'dashboard-42' })
    mockIsDemoMode.mockReturnValue(false)
  })

  it('renders the offer copy and applicable orbit templates', () => {
    renderComponent()

    expect(screen.getByText('orbit.keepInOrbit')).toBeInTheDocument()
    expect(screen.getByText('orbit.keepInOrbitDescription')).toBeInTheDocument()
    expect(screen.getByText('Health Check')).toBeInTheDocument()
    expect(screen.getByText('Certificate Rotation Check')).toBeInTheDocument()
  })

  it('deduplicates project categories before looking up templates', () => {
    renderComponent({
      projects: [
        { name: 'Kyverno', category: 'Security' },
        { name: 'Falco', category: 'Security' },
        { name: 'Plain Project' },
      ],
    })

    expect(mockGetApplicableOrbitTemplates).toHaveBeenCalledWith(['Security'])
  })

  it('collapses the body when the header is clicked', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByRole('button', { name: 'orbit.keepInOrbit' }))

    expect(screen.queryByText('orbit.keepInOrbitDescription')).not.toBeInTheDocument()
  })

  it('expands the body again when the header is clicked twice', async () => {
    const user = userEvent.setup()
    renderComponent()

    const toggle = screen.getByRole('button', { name: 'orbit.keepInOrbit' })
    await user.click(toggle)
    await user.click(toggle)

    expect(screen.getByText('orbit.keepInOrbitDescription')).toBeInTheDocument()
  })

  it('highlights the default weekly cadence', () => {
    renderComponent()

    expect(screen.getByRole('button', { name: 'orbit.cadenceWeekly' })).toHaveClass('bg-purple-500/20')
  })

  it('disables setup when all orbit types are deselected', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(getTemplateToggle('Health Check'))
    await user.click(getTemplateToggle('Certificate Rotation Check'))

    expect(screen.getByRole('button', { name: 'orbit.setupOrbit' })).toBeDisabled()
  })

  it('re-enables setup when an orbit type is reselected', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(getTemplateToggle('Health Check'))
    await user.click(getTemplateToggle('Certificate Rotation Check'))
    await user.click(getTemplateToggle('Health Check'))

    expect(screen.getByRole('button', { name: 'orbit.setupOrbit' })).toBeEnabled()
  })

  it('calls onSkip when the skip action is pressed', async () => {
    const user = userEvent.setup()
    const { onSkip } = renderComponent()

    await user.click(screen.getByRole('button', { name: 'orbit.skip' }))

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('lets the user disable Ground Control dashboard creation', async () => {
    const user = userEvent.setup()
    renderComponent()

    const checkbox = screen.getByLabelText('orbit.groundControlDescription') as HTMLInputElement
    expect(checkbox.checked).toBe(true)

    await user.click(checkbox)

    expect(checkbox.checked).toBe(false)
  })

  it('lets the user enable auto-run', async () => {
    const user = userEvent.setup()
    renderComponent()

    const checkbox = screen.getByLabelText('orbit.autoRunDescription') as HTMLInputElement
    expect(checkbox.checked).toBe(false)

    await user.click(checkbox)

    expect(checkbox.checked).toBe(true)
  })

  it('updates the selected cadence when a new cadence is chosen', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByRole('button', { name: 'orbit.cadenceMonthly' }))

    expect(screen.getByRole('button', { name: 'orbit.cadenceMonthly' })).toHaveClass('bg-purple-500/20')
  })

  it('creates a single selected orbit with the expected payload', async () => {
    const user = userEvent.setup()
    const { onCreateOrbit } = renderComponent()

    await user.click(getTemplateToggle('Certificate Rotation Check'))
    await user.click(screen.getByRole('button', { name: 'orbit.setupOrbit' }))

    await waitFor(() => expect(onCreateOrbit).toHaveBeenCalledTimes(1))
    expect(onCreateOrbit).toHaveBeenCalledWith({
      orbitType: 'health-check',
      cadence: 'weekly',
      autoRun: false,
      title: 'Health Check — Kyverno, Velero',
      projects: ['Kyverno', 'Velero'],
      clusters: ['cluster-a', 'cluster-b'],
      missionControlStateKey: 'mission-control-123',
    })
  })

  it('emits analytics for a created orbit mission', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(getTemplateToggle('Certificate Rotation Check'))
    await user.click(screen.getByRole('button', { name: 'orbit.setupOrbit' }))

    await waitFor(() => expect(mockEmitOrbitMissionCreated).toHaveBeenCalledWith('health-check', 'weekly'))
    expect(mockEmitOrbitMissionCreated).toHaveBeenCalledTimes(1)
  })

  it('creates every selected orbit type', async () => {
    const user = userEvent.setup()
    const { onCreateOrbit } = renderComponent()

    await user.click(screen.getByLabelText('orbit.groundControlDescription'))
    await user.click(screen.getByRole('button', { name: 'orbit.setupOrbit' }))

    await waitFor(() => expect(onCreateOrbit).toHaveBeenCalledTimes(2))
    expect(onCreateOrbit).toHaveBeenNthCalledWith(1, expect.objectContaining({ orbitType: 'health-check' }))
    expect(onCreateOrbit).toHaveBeenNthCalledWith(2, expect.objectContaining({ orbitType: 'cert-rotation' }))
  })

  it('passes the auto-run selection into orbit creation', async () => {
    const user = userEvent.setup()
    const { onCreateOrbit } = renderComponent()

    await user.click(getTemplateToggle('Certificate Rotation Check'))
    await user.click(screen.getByLabelText('orbit.autoRunDescription'))
    await user.click(screen.getByRole('button', { name: 'orbit.setupOrbit' }))

    await waitFor(() => expect(onCreateOrbit).toHaveBeenCalledTimes(1))
    expect(onCreateOrbit).toHaveBeenCalledWith(expect.objectContaining({ autoRun: true }))
  })

  it('creates the Ground Control dashboard with the completed projects', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByRole('button', { name: 'orbit.setupOrbit' }))

    await waitFor(() => expect(mockGenerateGroundControlDashboard).toHaveBeenCalledWith({
      missionTitle: 'Kyverno, Velero',
      projects: [
        { name: 'Kyverno', category: 'Security' },
        { name: 'Velero', category: 'Storage' },
      ],
    }))
  })

  it('notifies the parent when a dashboard is created', async () => {
    const user = userEvent.setup()
    const { onDashboardCreated } = renderComponent()

    await user.click(screen.getByRole('button', { name: 'orbit.setupOrbit' }))

    await waitFor(() => expect(onDashboardCreated).toHaveBeenCalledWith('dashboard-42'))
  })

  it('shows a singular completion summary when one orbit is configured without a dashboard', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(getTemplateToggle('Certificate Rotation Check'))
    await user.click(screen.getByLabelText('orbit.groundControlDescription'))
    await user.click(screen.getByRole('button', { name: 'orbit.setupOrbit' }))

    expect(await screen.findByText(/1 orbit configured \(weekly\)\./)).toBeInTheDocument()
    expect(screen.queryByText(/Ground Control dashboard created\./)).not.toBeInTheDocument()
  })

  it('shows a plural completion summary when multiple orbits and a dashboard are created', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByRole('button', { name: 'orbit.setupOrbit' }))

    expect(await screen.findByText(/2 orbits configured \(weekly\)\. Ground Control dashboard created\./)).toBeInTheDocument()
  })

  it('navigates to the created dashboard from the completion view', async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByRole('button', { name: 'orbit.setupOrbit' }))
    await user.click(await screen.findByRole('button', { name: 'orbit.viewDashboard' }))

    expect(mockNavigate).toHaveBeenCalledWith('/custom-dashboard/dashboard-42')
  })

  it('skips dashboard generation when there are no projects', async () => {
    const user = userEvent.setup()
    const { onDashboardCreated } = renderComponent({ projects: [] })

    await user.click(getTemplateToggle('Certificate Rotation Check'))
    await user.click(screen.getByRole('button', { name: 'orbit.setupOrbit' }))

    await waitFor(() => expect(screen.getByText(/1 orbit configured \(weekly\)\./)).toBeInTheDocument())
    expect(mockGenerateGroundControlDashboard).not.toHaveBeenCalled()
    expect(onDashboardCreated).not.toHaveBeenCalled()
  })

  it('opens the local setup dialog in demo mode instead of creating anything', async () => {
    const user = userEvent.setup()
    const { onCreateOrbit, onDashboardCreated } = renderComponent()
    mockIsDemoMode.mockReturnValue(true)

    await user.click(screen.getByRole('button', { name: 'orbit.setupOrbit' }))

    expect(screen.getByTestId('setup-instructions-dialog')).toBeInTheDocument()
    expect(onCreateOrbit).not.toHaveBeenCalled()
    expect(mockEmitOrbitMissionCreated).not.toHaveBeenCalled()
    expect(mockGenerateGroundControlDashboard).not.toHaveBeenCalled()
    expect(onDashboardCreated).not.toHaveBeenCalled()
  })

  it('shows a loading state while setup work is in progress', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred<{ dashboardId: string }>()
    mockGenerateGroundControlDashboard.mockReturnValue(deferred.promise)

    renderComponent()

    await user.click(screen.getByRole('button', { name: 'orbit.setupOrbit' }))

    const button = screen.getByRole('button', { name: 'orbit.settingUp' })
    expect(button).toBeDisabled()
    expect(button.querySelector('.animate-spin')).not.toBeNull()

    deferred.resolve({ dashboardId: 'dashboard-42' })
    expect(await screen.findByText(/2 orbits configured \(weekly\)\. Ground Control dashboard created\./)).toBeInTheDocument()
  })
})
