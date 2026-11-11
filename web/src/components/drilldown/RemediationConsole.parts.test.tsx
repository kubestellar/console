import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { RemediationAiOutput } from './RemediationConsole.parts'
import type { LogEntry } from './RemediationConsole.types'

const t = ((key: string) => key) as TFunction
const logsEndRef = createRef<HTMLDivElement>()

describe('RemediationAiOutput', () => {
  it('switches from gathering data to the idle prompt', () => {
    const { rerender } = render(<RemediationAiOutput logs={[]} isLoadingInitialData isRunning={false} logsEndRef={logsEndRef} t={t} />)
    expect(screen.getByText('remediation.gatheringData')).toBeInTheDocument()
    rerender(<RemediationAiOutput logs={[]} isLoadingInitialData={false} isRunning={false} logsEndRef={logsEndRef} t={t} />)
    expect(screen.queryByText('remediation.gatheringData')).not.toBeInTheDocument()
    expect(screen.getByText('remediation.clickStart')).toBeInTheDocument()
  })

  it('shows diagnostic results and details without shell-only logs', () => {
    const timestamp = new Date('2026-01-01T00:00:00Z')
    const logs: LogEntry[] = [
      { id: '1', timestamp, type: 'result', message: 'Increase memory', details: '512Mi recommended' },
      { id: '2', timestamp, type: 'command', message: 'kubectl get pods' },
      { id: '3', timestamp, type: 'output', message: 'shell output' },
    ]
    const { rerender } = render(<RemediationAiOutput logs={logs} isLoadingInitialData={false} isRunning logsEndRef={logsEndRef} t={t} />)
    expect(screen.getByText('Increase memory')).toBeInTheDocument()
    expect(screen.getByText('512Mi recommended')).toBeInTheDocument()
    expect(screen.queryByText('kubectl get pods')).not.toBeInTheDocument()
    expect(screen.queryByText('shell output')).not.toBeInTheDocument()
    expect(screen.getByText('common.processing')).toBeInTheDocument()
    rerender(<RemediationAiOutput logs={logs} isLoadingInitialData={false} isRunning={false} logsEndRef={logsEndRef} t={t} />)
    expect(screen.queryByText('common.processing')).not.toBeInTheDocument()
  })
})
