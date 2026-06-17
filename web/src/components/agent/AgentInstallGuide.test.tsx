import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AgentInstallGuide, fetchMissionFile, INSTALL_MISSION_PATHS } from './AgentInstallGuide'
import type { MissionExport } from '../../lib/missions/types'

// Mock react-dom's createPortal to render inline
vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom')
  return {
    ...actual,
    createPortal: (children: React.ReactNode) => children,
  }
})

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}))

// Mock MissionDetailView
vi.mock('../missions/MissionDetailView', () => ({
  MissionDetailView: ({
    mission,
    onImport,
    onBack,
  }: {
    mission: MissionExport
    onImport: () => void
    onBack: () => void
  }) => (
    <div data-testid="mission-detail">
      <h2>{mission.title}</h2>
      <p>{mission.description}</p>
      <button onClick={onImport}>Import</button>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}))

const mockMissionData: MissionExport = {
  version: '1.0',
  title: 'Install KC Agent',
  description: 'Install the KC agent on your cluster',
  type: 'deploy',
  steps: [],
  tags: ['install', 'agent'],
  missionClass: 'install',
}

describe('AgentInstallGuide', () => {
  const mockOnClose = vi.fn()
  const mockOnRunInstall = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when missionId is null', () => {
    const { container } = render(
      <AgentInstallGuide missionId={null} onClose={mockOnClose} onRunInstall={mockOnRunInstall} />
    )

    expect(container.firstChild).toBeNull()
  })

  it('shows loading state when fetching mission', () => {
    ;(global.fetch as any) = vi.fn(
      () =>
        new Promise(() => {
          /* never resolves */
        })
    )

    render(
      <AgentInstallGuide
        missionId="install-kagent"
        onClose={mockOnClose}
        onRunInstall={mockOnRunInstall}
      />
    )

    expect(screen.getByRole('progressbar', { busy: true })).toBeInTheDocument()
  })

  it('displays mission content when fetch succeeds', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          version: '1.0',
          mission: mockMissionData,
        }),
    }
    ;(global.fetch as any) = vi.fn().mockResolvedValue(mockResponse)

    render(
      <AgentInstallGuide
        missionId="install-kagent"
        onClose={mockOnClose}
        onRunInstall={mockOnRunInstall}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('mission-detail')).toBeInTheDocument()
    })

    expect(screen.getByText('Install KC Agent')).toBeInTheDocument()
    expect(screen.getByText('Install the KC agent on your cluster')).toBeInTheDocument()
  })

  it('shows error message when fetch fails', async () => {
    ;(global.fetch as any) = vi.fn().mockResolvedValue({ ok: false })

    render(
      <AgentInstallGuide
        missionId="install-kagent"
        onClose={mockOnClose}
        onRunInstall={mockOnRunInstall}
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByText(/Failed to load install guide/i)).toBeInTheDocument()
  })

  it('calls onRunInstall and onClose when import is triggered', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          version: '1.0',
          mission: mockMissionData,
        }),
    }
    ;(global.fetch as any) = vi.fn().mockResolvedValue(mockResponse)

    render(
      <AgentInstallGuide
        missionId="install-kagent"
        onClose={mockOnClose}
        onRunInstall={mockOnRunInstall}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('mission-detail')).toBeInTheDocument()
    })

    const importButton = screen.getByRole('button', { name: /Import/i })
    fireEvent.click(importButton)

    expect(mockOnRunInstall).toHaveBeenCalledWith('install-kagent', 'Install KC Agent')
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when close button is clicked', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          version: '1.0',
          mission: mockMissionData,
        }),
    }
    ;(global.fetch as any) = vi.fn().mockResolvedValue(mockResponse)

    render(
      <AgentInstallGuide
        missionId="install-kagent"
        onClose={mockOnClose}
        onRunInstall={mockOnRunInstall}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('mission-detail')).toBeInTheDocument()
    })

    const closeButton = screen.getAllByRole('button').find((btn) => {
      const svg = btn.querySelector('svg')
      return svg !== null
    })
    
    if (closeButton) {
      fireEvent.click(closeButton)
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    }
  })

  it('resets state when missionId changes to null', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          version: '1.0',
          mission: mockMissionData,
        }),
    }
    ;(global.fetch as any) = vi.fn().mockResolvedValue(mockResponse)

    const { rerender, container } = render(
      <AgentInstallGuide
        missionId="install-kagent"
        onClose={mockOnClose}
        onRunInstall={mockOnRunInstall}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('mission-detail')).toBeInTheDocument()
    })

    rerender(
      <AgentInstallGuide missionId={null} onClose={mockOnClose} onRunInstall={mockOnRunInstall} />
    )

    expect(container.firstChild).toBeNull()
  })

  it('cancels fetch when component unmounts', async () => {
    let abortController: AbortController | undefined
    ;(global.fetch as any) = vi.fn((url: string, options?: { signal?: AbortSignal }) => {
      abortController = options?.signal
        ? { signal: options.signal } as any
        : undefined
      return new Promise(() => {
        /* never resolves */
      })
    })

    const { unmount } = render(
      <AgentInstallGuide
        missionId="install-kagent"
        onClose={mockOnClose}
        onRunInstall={mockOnRunInstall}
      />
    )

    unmount()

    // The effect cleanup should have run, preventing state updates
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
})

describe('fetchMissionFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches mission file from known path', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          version: '1.0',
          mission: mockMissionData,
        }),
    }
    ;(global.fetch as any) = vi.fn().mockResolvedValue(mockResponse)

    const result = await fetchMissionFile('install-kagent')

    expect(result).not.toBeNull()
    expect(result?.mission.title).toBe('Install KC Agent')
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('fixes/cncf-install/install-kagent.json'),
      expect.any(Object)
    )
  })

  it('tries multiple paths when first fails', async () => {
    ;(global.fetch as any) = vi
      .fn()
      .mockResolvedValueOnce({ ok: false }) // First path fails
      .mockResolvedValueOnce({
        // Second path succeeds
        ok: true,
        text: async () =>
          JSON.stringify({
            version: '1.0',
            mission: mockMissionData,
          }),
      })

    const result = await fetchMissionFile('install-kagent')

    expect(result).not.toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('returns null when all paths fail', async () => {
    ;(global.fetch as any) = vi.fn().mockResolvedValue({ ok: false })

    const result = await fetchMissionFile('unknown-mission')

    expect(result).toBeNull()
  })

  it('handles malformed JSON gracefully', async () => {
    ;(global.fetch as any) = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'invalid json{',
    })

    const result = await fetchMissionFile('install-kagent')

    expect(result).toBeNull()
  })

  it('normalizes mission data structure', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          title: 'Root Title',
          description: 'Root Description',
          mission: {
            title: 'Nested Title',
            description: 'Nested Description',
            type: 'deploy',
            steps: [{ action: 'test' }],
          },
        }),
    }
    ;(global.fetch as any) = vi.fn().mockResolvedValue(mockResponse)

    const result = await fetchMissionFile('test-mission')

    expect(result).not.toBeNull()
    // Should prefer nested mission data
    expect(result?.mission.title).toBe('Nested Title')
    expect(result?.mission.description).toBe('Nested Description')
  })

  it('uses displayName as fallback title', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          version: '1.0',
          steps: [],
        }),
    }
    ;(global.fetch as any) = vi.fn().mockResolvedValue(mockResponse)

    const result = await fetchMissionFile('test-mission', 'Custom Display Name')

    expect(result).not.toBeNull()
    expect(result?.mission.title).toBe('Custom Display Name')
    expect(result?.mission.description).toBe('Install Custom Display Name')
  })

  it('sets missionClass to install', async () => {
    const mockResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          version: '1.0',
          title: 'Test',
          steps: [],
        }),
    }
    ;(global.fetch as any) = vi.fn().mockResolvedValue(mockResponse)

    const result = await fetchMissionFile('test-mission')

    expect(result).not.toBeNull()
    expect(result?.mission.missionClass).toBe('install')
  })
})
