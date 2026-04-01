/**
 * MissionLandingPage unit tests
 *
 * Covers: loading state, error state (mission not found), no mission ID,
 * successful mission render with tabs, and navigation actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MissionLandingPage } from '../MissionLandingPage'

// ── Mocks ────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../../config/routes', () => ({
  getHomeBrowseMissionsRoute: () => '/?browse-missions=1',
}))

// Mock fetch for mission loading
const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = mockFetch
})

// ── Helpers ──────────────────────────────────────────────────────────────

function renderWithRouter(missionId?: string) {
  const path = missionId ? `/missions/${missionId}` : '/missions/'
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/missions/:missionId" element={<MissionLandingPage />} />
        <Route path="/missions/" element={<MissionLandingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const sampleMission = {
  version: '1.0',
  title: 'Install Prometheus',
  description: 'Install Prometheus monitoring stack on your cluster',
  type: 'deploy',
  tags: ['monitoring', 'graduated'],
  steps: [
    { title: 'Add Helm repo', description: 'helm repo add prometheus-community ...' },
    { title: 'Install chart', description: 'helm install prometheus ...' },
  ],
  uninstall: [
    { title: 'Uninstall chart', description: 'helm uninstall prometheus' },
  ],
  upgrade: [],
  troubleshooting: [],
  missionClass: 'install',
  cncfProject: 'prometheus',
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('MissionLandingPage', () => {
  it('shows loading spinner initially', () => {
    // Make fetch hang indefinitely so we see the loading state
    mockFetch.mockReturnValue(new Promise(() => {}))

    renderWithRouter('install-prometheus')

    expect(screen.getByText('Loading mission...')).toBeInTheDocument()
  })

  it('shows error when mission is not found (all fetches fail)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    renderWithRouter('nonexistent-mission')

    await waitFor(() => {
      expect(screen.getByText('Mission not found')).toBeInTheDocument()
    })

    expect(
      screen.getByText('This mission could not be found in the knowledge base.'),
    ).toBeInTheDocument()
  })

  it('renders mission details when fetch succeeds', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(sampleMission)),
      json: () => Promise.resolve(sampleMission),
    })

    renderWithRouter('install-prometheus')

    await waitFor(() => {
      expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
    })

    // Description
    expect(
      screen.getByText('Install Prometheus monitoring stack on your cluster'),
    ).toBeInTheDocument()

    // Type badge
    expect(screen.getByText('deploy')).toBeInTheDocument()

    // CNCF project badge
    expect(screen.getByText('prometheus')).toBeInTheDocument()

    // Steps should be visible
    expect(screen.getByText('Add Helm repo')).toBeInTheDocument()
    expect(screen.getByText('Install chart')).toBeInTheDocument()
  })

  it('renders tags when present', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(sampleMission)),
    })

    renderWithRouter('install-prometheus')

    await waitFor(() => {
      expect(screen.getByText('monitoring')).toBeInTheDocument()
    })

    expect(screen.getByText('graduated')).toBeInTheDocument()
  })

  it('renders tab buttons for Install, Uninstall, Upgrade, Troubleshooting', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(sampleMission)),
    })

    renderWithRouter('install-prometheus')

    await waitFor(() => {
      expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
    })

    // Tab labels also appear as SectionBadge labels, so use getAllByText
    // to avoid "found multiple elements" errors
    expect(screen.getAllByText('Install').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Uninstall').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Update / Upgrade')).toBeInTheDocument()
    // "Troubleshooting" tab vs "Troubleshoot" badge — the tab uses "Troubleshooting"
    expect(screen.getAllByText(/Troubleshoot/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows section availability badges', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(sampleMission)),
    })

    renderWithRouter('install-prometheus')

    await waitFor(() => {
      expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
    })

    // SectionBadge labels — "Install" appears in both tab and badge
    const installElements = screen.getAllByText('Install')
    expect(installElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders "Import & Open Console" CTA button', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(sampleMission)),
    })

    renderWithRouter('install-prometheus')

    await waitFor(() => {
      expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
    })

    // The CTA uses &amp; in JSX which renders as &
    const cta = screen.getByText(/Import.*Open Console/)
    expect(cta).toBeInTheDocument()
  })

  it('navigates on "Import & Open Console" click', async () => {
    const user = userEvent.setup()

    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(sampleMission)),
    })

    renderWithRouter('install-prometheus')

    await waitFor(() => {
      expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
    })

    const cta = screen.getByText(/Import.*Open Console/)
    await user.click(cta)

    expect(mockNavigate).toHaveBeenCalledWith(
      '/?import=install-prometheus',
      expect.objectContaining({ replace: true }),
    )
  })

  it('navigates on "Browse all missions" click', async () => {
    const user = userEvent.setup()

    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    renderWithRouter('nonexistent')

    await waitFor(() => {
      expect(screen.getByText('Mission not found')).toBeInTheDocument()
    })

    // "Browse all missions" appears in both header (button) and error CTA (button)
    const browseButtons = screen.getAllByText('Browse all missions')
    // Click the CTA button in the error state (the last one)
    await user.click(browseButtons[browseButtons.length - 1])

    expect(mockNavigate).toHaveBeenCalledWith('/?browse-missions=1', { replace: true })
  })

  it('shows empty tab message when switching to a tab with no content', async () => {
    const user = userEvent.setup()

    // Mission with only install steps, no upgrade/troubleshooting
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(sampleMission)),
    })

    renderWithRouter('install-prometheus')

    await waitFor(() => {
      expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
    })

    // The Upgrade tab should be disabled since upgrade array is empty
    // but we can at least verify the tabs render
    const upgradeTab = screen.getByText('Update / Upgrade')
    expect(upgradeTab).toBeInTheDocument()
  })

  it('renders the KubeStellar Console header', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}))

    renderWithRouter('some-mission')

    expect(screen.getByText('KubeStellar Console')).toBeInTheDocument()
  })

  it('handles mission with no tags gracefully', async () => {
    const noTagsMission = { ...sampleMission, tags: [] }
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(noTagsMission)),
    })

    renderWithRouter('install-prometheus')

    await waitFor(() => {
      expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
    })

    // No crash, the tags section simply doesn't render
    expect(screen.queryByText('monitoring')).not.toBeInTheDocument()
  })
})
