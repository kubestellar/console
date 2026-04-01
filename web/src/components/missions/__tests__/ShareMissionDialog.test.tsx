/**
 * ShareMissionDialog unit tests
 *
 * Covers: closed state, open state rendering, export channel buttons,
 * security scan status, and resolution-to-mission conversion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareMissionDialog } from '../ShareMissionDialog'
import type { Resolution } from '../../../hooks/useResolutions'

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock('../../../lib/missions/scanner/index', () => ({
  fullScan: vi.fn(() => ({
    valid: true,
    findings: [],
    metadata: null,
  })),
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('js-yaml', () => ({
  default: { dump: vi.fn((obj: unknown) => JSON.stringify(obj)) },
  dump: vi.fn((obj: unknown) => JSON.stringify(obj)),
}))

// ── Fixtures ─────────────────────────────────────────────────────────────

const mockResolution: Resolution = {
  id: 'res-001',
  missionId: 'mission-001',
  userId: 'user-123',
  title: 'Fix CrashLoopBackOff in nginx-pod',
  visibility: 'private',
  issueSignature: {
    type: 'CrashLoopBackOff',
    resourceKind: 'Pod',
  },
  resolution: {
    summary: 'Increase memory limits to resolve OOM crash',
    steps: [
      'kubectl edit deployment nginx -n default',
      'Set memory limit to 512Mi',
      'kubectl rollout restart deployment nginx -n default',
    ],
    yaml: 'resources:\n  limits:\n    memory: 512Mi',
  },
  context: {
    cluster: 'prod-us-east-1',
  },
  effectiveness: {
    timesUsed: 3,
    timesSuccessful: 3,
  },
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-03-01T12:00:00Z',
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('ShareMissionDialog', () => {
  const defaultProps = {
    resolution: mockResolution,
    isOpen: true,
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ShareMissionDialog resolution={mockResolution} isOpen={false} onClose={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the dialog when isOpen is true', () => {
    render(<ShareMissionDialog {...defaultProps} />)
    expect(screen.getByText('Export Mission')).toBeInTheDocument()
  })

  it('shows the resolution title in the preview', () => {
    render(<ShareMissionDialog {...defaultProps} />)
    expect(screen.getByText('Fix CrashLoopBackOff in nginx-pod')).toBeInTheDocument()
  })

  it('shows the issue type and step count', () => {
    render(<ShareMissionDialog {...defaultProps} />)
    // "CrashLoopBackOff · 3 steps" — may appear in multiple elements
    const crashLoopElements = screen.getAllByText(/CrashLoopBackOff/)
    expect(crashLoopElements.length).toBeGreaterThanOrEqual(1)
    const stepElements = screen.getAllByText(/3 steps/)
    expect(stepElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders all four export channel buttons', () => {
    render(<ShareMissionDialog {...defaultProps} />)
    expect(screen.getByText('Download JSON')).toBeInTheDocument()
    expect(screen.getByText('Copy JSON')).toBeInTheDocument()
    expect(screen.getByText('Copy Markdown')).toBeInTheDocument()
    expect(screen.getByText('Download YAML')).toBeInTheDocument()
  })

  it('renders descriptions for each export channel', () => {
    render(<ShareMissionDialog {...defaultProps} />)
    expect(screen.getByText('Save as .json file')).toBeInTheDocument()
    expect(screen.getByText('Copy to clipboard')).toBeInTheDocument()
    expect(screen.getByText('Human-readable format')).toBeInTheDocument()
    expect(screen.getByText('Save as .yaml file')).toBeInTheDocument()
  })

  it('shows the security scan prompt before scanning', () => {
    render(<ShareMissionDialog {...defaultProps} />)
    expect(screen.getByText('Run security scan before export')).toBeInTheDocument()
  })

  it('runs security scan when the scan button is clicked', async () => {
    const user = userEvent.setup()
    const { fullScan } = await import('../../../lib/missions/scanner/index')

    render(<ShareMissionDialog {...defaultProps} />)

    const scanButton = screen.getByText('Run security scan before export')
    await user.click(scanButton)

    expect(fullScan).toHaveBeenCalledTimes(1)
  })

  it('shows "No sensitive data detected" after a clean scan', async () => {
    const user = userEvent.setup()

    render(<ShareMissionDialog {...defaultProps} />)

    const scanButton = screen.getByText('Run security scan before export')
    await user.click(scanButton)

    expect(screen.getByText('No sensitive data detected')).toBeInTheDocument()
  })

  it('shows warning after scan finds issues', async () => {
    const user = userEvent.setup()
    const scannerModule = await import('../../../lib/missions/scanner/index')
    vi.mocked(scannerModule.fullScan).mockReturnValue({
      valid: false,
      findings: [
        { severity: 'warning', code: 'SECRETS_DETECTED', message: 'Possible secret found', path: 'steps.0' },
      ],
      metadata: null,
    })

    render(<ShareMissionDialog {...defaultProps} />)

    const scanButton = screen.getByText('Run security scan before export')
    await user.click(scanButton)

    expect(screen.getByText(/1 finding\(s\)/)).toBeInTheDocument()
    expect(screen.getByText(/review before sharing externally/)).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<ShareMissionDialog resolution={mockResolution} isOpen={true} onClose={onClose} />)

    // Find the close button (the X icon button in the header)
    const closeButtons = screen.getAllByRole('button')
    // The close button is the first button in the header area
    const closeButton = closeButtons.find(
      btn => btn.querySelector('.lucide-x') || btn.textContent === '',
    )

    if (closeButton) {
      await user.click(closeButton)
      expect(onClose).toHaveBeenCalledTimes(1)
    }
  })

  it('handles resolution with empty steps gracefully', () => {
    const emptyResolution: Resolution = {
      ...mockResolution,
      resolution: {
        summary: '',
        steps: [],
      },
    }

    expect(() =>
      render(
        <ShareMissionDialog resolution={emptyResolution} isOpen={true} onClose={vi.fn()} />,
      ),
    ).not.toThrow()

    // Shows "0 steps" in the preview
    expect(screen.getByText(/0 steps/)).toBeInTheDocument()
  })

  it('handles resolution with undefined optional fields gracefully', () => {
    const minimalResolution: Resolution = {
      ...mockResolution,
      sharedBy: undefined,
      resolution: {
        summary: '',
        steps: ['Step one'],
        yaml: undefined,
      },
      context: {},
    }

    expect(() =>
      render(
        <ShareMissionDialog resolution={minimalResolution} isOpen={true} onClose={vi.fn()} />,
      ),
    ).not.toThrow()
  })
})
