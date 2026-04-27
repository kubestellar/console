import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AlertListItem } from '../AlertListItem'
import type { Alert } from '../../../types/alerts'

/* ---------- Mocks ---------- */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.count !== undefined) return `${opts.count} ${key}`
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../ui/Button', () => ({
  Button: ({ children, onClick, ...rest }: Record<string, unknown>) => (
    <button onClick={onClick as () => void} data-variant={rest.variant as string}>
      {children as React.ReactNode}
    </button>
  ),
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardAIActions: ({ onDiagnose }: { onDiagnose: (e: React.MouseEvent) => void }) => (
    <button data-testid="ai-diagnose-btn" onClick={onDiagnose}>
      AI Diagnose
    </button>
  ),
}))

vi.mock('../../../types/alerts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../types/alerts')>()
  return {
    ...actual,
    getSeverityIcon: (severity: string) => `icon-${severity}`,
  }
})

/* ---------- Fixtures ---------- */

const BASE_ALERT: Alert = {
  id: 'alert-1',
  ruleId: 'rule-1',
  ruleName: 'HighCPU',
  severity: 'critical',
  status: 'firing',
  message: 'CPU usage above 90%',
  details: {},
  cluster: 'prod-cluster',
  firedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
}

const mockOnAlertClick = vi.fn()
const mockOnAcknowledge = vi.fn()
const mockOnAIDiagnose = vi.fn()
const mockOnOpenMission = vi.fn()

function renderAlertListItem(overrides: Partial<Parameters<typeof AlertListItem>[0]> = {}) {
  return render(
    <AlertListItem
      alert={BASE_ALERT}
      mission={null}
      onAlertClick={mockOnAlertClick}
      onAcknowledge={mockOnAcknowledge}
      onAIDiagnose={mockOnAIDiagnose}
      onOpenMission={mockOnOpenMission}
      {...overrides}
    />
  )
}

/* ---------- Tests ---------- */

describe('AlertListItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders rule name and severity badge', () => {
    renderAlertListItem()

    expect(screen.getByText('HighCPU')).toBeInTheDocument()
    expect(screen.getByText('critical')).toBeInTheDocument()
  })

  it('renders alert message', () => {
    renderAlertListItem()

    expect(screen.getByText('CPU usage above 90%')).toBeInTheDocument()
  })

  it('renders cluster name when provided', () => {
    renderAlertListItem()

    expect(screen.getByText('prod-cluster')).toBeInTheDocument()
  })

  it('does not render cluster name when not provided', () => {
    renderAlertListItem({
      alert: { ...BASE_ALERT, cluster: undefined },
    })

    expect(screen.queryByText('prod-cluster')).not.toBeInTheDocument()
  })

  it('calls onAlertClick when the row is clicked', () => {
    renderAlertListItem()

    const clickable = screen.getByRole('button', { name: /viewAlertDetailsAria/i })
    fireEvent.click(clickable)

    expect(mockOnAlertClick).toHaveBeenCalledWith(BASE_ALERT)
  })

  it('renders acknowledge button when alert is not acknowledged', () => {
    renderAlertListItem()

    expect(screen.getByText('activeAlerts.acknowledge')).toBeInTheDocument()
  })

  it('does not render acknowledge button when alert is acknowledged', () => {
    renderAlertListItem({
      alert: { ...BASE_ALERT, acknowledgedAt: '2026-01-01T00:00:00Z' },
    })

    expect(screen.queryByText('activeAlerts.acknowledge')).not.toBeInTheDocument()
  })

  it('shows acknowledged label when alert has acknowledgedAt', () => {
    renderAlertListItem({
      alert: { ...BASE_ALERT, acknowledgedAt: '2026-01-01T00:00:00Z' },
    })

    expect(screen.getByText('activeAlerts.acknowledged')).toBeInTheDocument()
  })

  it('calls onAcknowledge when acknowledge button is clicked', () => {
    renderAlertListItem()

    const ackBtn = screen.getByText('activeAlerts.acknowledge')
    fireEvent.click(ackBtn)

    expect(mockOnAcknowledge).toHaveBeenCalledWith(expect.any(Object), 'alert-1')
  })

  it('shows AI Diagnose button when no mission exists', () => {
    renderAlertListItem({ mission: null })

    expect(screen.getByTestId('ai-diagnose-btn')).toBeInTheDocument()
  })

  it('shows View Diagnosis button when mission exists', () => {
    const mission = { id: 'mission-1', name: 'Diagnose HighCPU' } as Parameters<typeof AlertListItem>[0]['mission']

    renderAlertListItem({ mission })

    expect(screen.getByText('activeAlerts.viewDiagnosis')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-diagnose-btn')).not.toBeInTheDocument()
  })

  it('calls onOpenMission when View Diagnosis is clicked', () => {
    const mission = { id: 'mission-1', name: 'Diagnose HighCPU' } as Parameters<typeof AlertListItem>[0]['mission']

    renderAlertListItem({ mission })

    const viewBtn = screen.getByText('activeAlerts.viewDiagnosis')
    fireEvent.click(viewBtn)

    expect(mockOnOpenMission).toHaveBeenCalledWith(expect.any(Object), BASE_ALERT)
  })

  it('renders AI indicator when mission exists', () => {
    const mission = { id: 'mission-1', name: 'Diagnose HighCPU' } as Parameters<typeof AlertListItem>[0]['mission']

    renderAlertListItem({ mission })

    expect(screen.getByText('AI')).toBeInTheDocument()
  })

  it('renders severity colors for different severities', () => {
    const { rerender } = render(
      <AlertListItem
        alert={{ ...BASE_ALERT, severity: 'warning' }}
        mission={null}
        onAlertClick={mockOnAlertClick}
        onAcknowledge={mockOnAcknowledge}
        onAIDiagnose={mockOnAIDiagnose}
        onOpenMission={mockOnOpenMission}
      />
    )

    expect(screen.getByText('warning')).toBeInTheDocument()

    rerender(
      <AlertListItem
        alert={{ ...BASE_ALERT, severity: 'info' }}
        mission={null}
        onAlertClick={mockOnAlertClick}
        onAcknowledge={mockOnAcknowledge}
        onAIDiagnose={mockOnAIDiagnose}
        onOpenMission={mockOnOpenMission}
      />
    )

    expect(screen.getByText('info')).toBeInTheDocument()
  })
})
