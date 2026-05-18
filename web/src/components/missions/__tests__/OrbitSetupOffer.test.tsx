/**
 * OrbitSetupOffer unit tests
 *
 * Covers: render with templates, orbit type toggle, cadence selection,
 * dashboard/auto-run toggles, collapse/expand, skip callback,
 * setup flow (onCreateOrbit + onDashboardCreated), done state,
 * demo mode showing SetupInstructionsDialog, empty orbits disables setup.
 */

import type React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// ── Hoisted mock refs ────────────────────────────────────────────────────

const { mockGenerateGroundControlDashboard, mockNavigate, mockIsDemoMode, mockEmitOrbit } = vi.hoisted(() => ({
  mockGenerateGroundControlDashboard: vi.fn().mockResolvedValue({ dashboardId: 'dash-123' }),
  mockNavigate: vi.fn(),
  mockIsDemoMode: vi.fn(() => false),
  mockEmitOrbit: vi.fn(),
}))

// ── Module mocks ─────────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../../hooks/useGroundControlDashboard', () => ({
  useGroundControlDashboard: () => ({
    generateGroundControlDashboard: mockGenerateGroundControlDashboard,
    isGroundControlDashboard: vi.fn(() => false),
  }),
}))

vi.mock('../../../lib/orbit/orbitTemplates', () => ({
  getApplicableOrbitTemplates: vi.fn(() => [
    {
      orbitType: 'health-check',
      title: 'Health Check',
      description: 'Verify pod readiness and resource availability.',
      suggestedCadence: 'weekly',
      applicableCategories: ['*'],
      steps: [],
    },
    {
      orbitType: 'cert-rotation',
      title: 'Certificate Rotation Check',
      description: 'Check TLS certificate expiry dates.',
      suggestedCadence: 'monthly',
      applicableCategories: ['Security'],
      steps: [],
    },
  ]),
}))

vi.mock('../../../lib/constants/orbit', () => ({
  ORBIT_DEFAULT_CADENCE: 'weekly',
}))

vi.mock('../../../lib/analytics', () => ({
  emitOrbitMissionCreated: mockEmitOrbit,
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: mockIsDemoMode,
}))

vi.mock('../../setup/SetupInstructionsDialog', () => ({
  SetupInstructionsDialog: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="setup-dialog"><button onClick={onClose}>Close Setup</button></div> : null,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'orbit.title': 'Orbit Maintenance',
        'orbit.keepInOrbit': 'Keep in Orbit',
        'orbit.keepInOrbitDescription': 'Set up recurring maintenance missions.',
        'orbit.groundControlDescription': 'Create a Ground Control monitoring dashboard',
        'orbit.autoRunDescription': 'Auto-run on schedule',
        'orbit.skip': 'Skip',
        'orbit.setupOrbit': 'Set up Orbit',
        'orbit.viewDashboard': 'View Dashboard',
        'orbit.cadenceDaily': 'Daily',
        'orbit.cadenceWeekly': 'Weekly',
        'orbit.cadenceMonthly': 'Monthly',
      }
      return map[key] ?? key
    },
  }),
}))

import { OrbitSetupOffer } from '../OrbitSetupOffer'

// ── Fixtures ─────────────────────────────────────────────────────────────

const DEFAULT_PROPS = {
  projects: [{ name: 'nginx', cncfProject: 'NGINX', category: 'Networking' }],
  clusters: ['prod-cluster'],
  onCreateOrbit: vi.fn(),
  onDashboardCreated: vi.fn(),
  onSkip: vi.fn(),
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('OrbitSetupOffer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    mockGenerateGroundControlDashboard.mockResolvedValue({ dashboardId: 'dash-123' })
  })

  // ── Rendering ────────────────────────────────────────────────────────

  it('renders the "Keep in Orbit" header', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    expect(screen.getByText('Keep in Orbit')).toBeInTheDocument()
  })

  it('renders orbit template checkboxes', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    expect(screen.getByText('Health Check')).toBeInTheDocument()
    expect(screen.getByText('Certificate Rotation Check')).toBeInTheDocument()
  })

  it('renders cadence selector buttons', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    expect(screen.getByText('Daily')).toBeInTheDocument()
    expect(screen.getByText('Weekly')).toBeInTheDocument()
    expect(screen.getByText('Monthly')).toBeInTheDocument()
  })

  it('renders the dashboard toggle checkbox', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    expect(screen.getByText('Create a Ground Control monitoring dashboard')).toBeInTheDocument()
  })

  it('renders the auto-run toggle checkbox', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    expect(screen.getByText('Auto-run on schedule')).toBeInTheDocument()
  })

  it('renders Skip and Set up Orbit buttons', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    expect(screen.getByRole('button', { name: /Skip/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Set up Orbit/i })).toBeInTheDocument()
  })

  // ── Orbit type toggle ────────────────────────────────────────────────

  it('has all templates checked by default', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    const checkboxes = screen.getAllByRole('checkbox')
    // first two are orbit type checkboxes (before dashboard/autorun)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).toBeChecked()
  })

  it('unchecks a template when clicked', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // uncheck Health Check
    expect(checkboxes[0]).not.toBeChecked()
  })

  it('re-checks a template when clicked again', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[0])
    expect(checkboxes[0]).toBeChecked()
  })

  it('disables Setup button when all orbit types are unchecked', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])
    expect(screen.getByRole('button', { name: /Set up Orbit/i })).toBeDisabled()
  })

  // ── Cadence selection ────────────────────────────────────────────────

  it('defaults to weekly cadence', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    const weeklyBtn = screen.getByRole('button', { name: /Weekly/i })
    expect(weeklyBtn.className).toContain('bg-purple-500')
  })

  it('switches cadence to daily when clicked', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: /Daily/i }))
    expect(screen.getByRole('button', { name: /Daily/i }).className).toContain('bg-purple-500')
  })

  // ── Dashboard / auto-run toggles ─────────────────────────────────────

  it('has dashboard creation checked by default', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    const checkboxes = screen.getAllByRole('checkbox')
    // index 2 is the dashboard toggle (after 2 orbit type checkboxes)
    const dashboardCheckbox = checkboxes.find((_, i) => i === 2)
    expect(dashboardCheckbox).toBeChecked()
  })

  it('unchecks dashboard creation when toggled', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[2]) // dashboard toggle
    expect(checkboxes[2]).not.toBeChecked()
  })

  it('has auto-run unchecked by default', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[3]).not.toBeChecked()
  })

  // ── Collapse / expand ────────────────────────────────────────────────

  it('shows content by default (expanded)', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    expect(screen.getByText('Set up recurring maintenance missions.')).toBeInTheDocument()
  })

  it('hides content after clicking the header to collapse', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: /Keep in Orbit/i }))
    expect(screen.queryByText('Set up recurring maintenance missions.')).not.toBeInTheDocument()
  })

  it('shows content again after re-expanding', () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: /Keep in Orbit/i }))
    fireEvent.click(screen.getByRole('button', { name: /Keep in Orbit/i }))
    expect(screen.getByText('Set up recurring maintenance missions.')).toBeInTheDocument()
  })

  // ── Skip ──────────────────────────────────────────────────────────────

  it('calls onSkip when Skip is clicked', () => {
    const onSkip = vi.fn()
    render(<OrbitSetupOffer {...DEFAULT_PROPS} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  // ── Setup flow ────────────────────────────────────────────────────────

  it('calls onCreateOrbit for each selected orbit type on setup', async () => {
    const onCreateOrbit = vi.fn()
    render(<OrbitSetupOffer {...DEFAULT_PROPS} onCreateOrbit={onCreateOrbit} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Set up Orbit/i }))
    })
    expect(onCreateOrbit).toHaveBeenCalledTimes(2)
  })

  it('calls onCreateOrbit with correct orbitType and cadence', async () => {
    const onCreateOrbit = vi.fn()
    render(<OrbitSetupOffer {...DEFAULT_PROPS} onCreateOrbit={onCreateOrbit} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Set up Orbit/i }))
    })
    expect(onCreateOrbit).toHaveBeenCalledWith(
      expect.objectContaining({ orbitType: 'health-check', cadence: 'weekly' }),
    )
  })

  it('calls onDashboardCreated after setup', async () => {
    const onDashboardCreated = vi.fn()
    render(<OrbitSetupOffer {...DEFAULT_PROPS} onDashboardCreated={onDashboardCreated} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Set up Orbit/i }))
    })
    expect(onDashboardCreated).toHaveBeenCalledWith('dash-123')
  })

  it('emits analytics for each orbit type created', async () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Set up Orbit/i }))
    })
    expect(mockEmitOrbit).toHaveBeenCalledTimes(2)
  })

  // ── Done state ────────────────────────────────────────────────────────

  it('shows done state after setup completes', async () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Set up Orbit/i }))
    })
    expect(screen.getByText('Orbit Maintenance')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Set up Orbit/i })).not.toBeInTheDocument()
  })

  it('shows orbit count in done state', async () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Set up Orbit/i }))
    })
    expect(screen.getByText(/2 orbits configured/i)).toBeInTheDocument()
  })

  it('shows View Dashboard link in done state', async () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Set up Orbit/i }))
    })
    expect(screen.getByText(/View Dashboard/i)).toBeInTheDocument()
  })

  it('navigates to dashboard when View Dashboard is clicked', async () => {
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Set up Orbit/i }))
    })
    fireEvent.click(screen.getByText(/View Dashboard/i))
    expect(mockNavigate).toHaveBeenCalledWith('/custom-dashboard/dash-123')
  })

  // ── Demo mode ─────────────────────────────────────────────────────────

  it('shows SetupInstructionsDialog instead of creating orbits in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Set up Orbit/i }))
    })
    expect(screen.getByTestId('setup-dialog')).toBeInTheDocument()
    expect(DEFAULT_PROPS.onCreateOrbit).not.toHaveBeenCalled()
  })

  it('hides SetupInstructionsDialog when closed', async () => {
    mockIsDemoMode.mockReturnValue(true)
    render(<OrbitSetupOffer {...DEFAULT_PROPS} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Set up Orbit/i }))
    })
    fireEvent.click(screen.getByRole('button', { name: /Close Setup/i }))
    expect(screen.queryByTestId('setup-dialog')).not.toBeInTheDocument()
  })
})
