import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TFunction } from 'i18next'
import {
  RemediationAiOutput,
  RemediationHeader,
  RemediationTabs,
  handleButtonLikeKeyDown,
} from './RemediationConsole.parts'
import type { LogEntry } from './RemediationConsole.types'

const t = ((key: string) => key) as unknown as TFunction
const FOCUS_DELAY_MS = 50

describe('handleButtonLikeKeyDown', () => {
  const makeEvent = (key: string) => ({ key, preventDefault: vi.fn() }) as unknown as Parameters<typeof handleButtonLikeKeyDown>[0]

  it('runs the action on Enter and Space', () => {
    const action = vi.fn()
    const enter = makeEvent('Enter')
    handleButtonLikeKeyDown(enter, action)
    handleButtonLikeKeyDown(makeEvent(' '), action)
    expect(action).toHaveBeenCalledTimes(2)
    expect(enter.preventDefault).toHaveBeenCalled()
  })

  it('ignores other keys and disabled state', () => {
    const action = vi.fn()
    handleButtonLikeKeyDown(makeEvent('a'), action)
    handleButtonLikeKeyDown(makeEvent('Enter'), action, true)
    expect(action).not.toHaveBeenCalled()
  })
})

describe('RemediationHeader', () => {
  it('shows the AI title and closes via click and keyboard', () => {
    const onClose = vi.fn()
    render(<RemediationHeader activeTab="ai" resourceType="pod" resourceName="p1" onClose={onClose} titleId="tid" t={t} />)
    expect(screen.getByText('remediation.title')).toHaveAttribute('id', 'tid')
    expect(screen.getByText('remediation.resourceType')).toBeInTheDocument()
    const close = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(close)
    fireEvent.keyDown(close, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows the shell title on the shell tab', () => {
    render(<RemediationHeader activeTab="shell" resourceType="node" resourceName="n1" onClose={vi.fn()} titleId="tid" t={t} />)
    expect(screen.getByText('remediation.shellTitle')).toBeInTheDocument()
  })
})

describe('RemediationTabs', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const renderTabs = (activeTab: 'ai' | 'shell', setActiveTab = vi.fn(), shellInputRef = createRef<HTMLInputElement>()) =>
    render(
      <RemediationTabs
        activeTab={activeTab}
        tabListProps={{ role: 'tablist' } as never}
        getTabProps={((tab: string) => ({ role: 'tab', 'data-tab': tab })) as never}
        setActiveTab={setActiveTab}
        shellInputRef={shellInputRef}
        focusDelayMs={FOCUS_DELAY_MS}
        t={t}
      />
    )

  it('switches to the shell tab on click', () => {
    const setActiveTab = vi.fn()
    renderTabs('ai', setActiveTab)
    fireEvent.click(screen.getByRole('tab', { name: 'remediation.shell' }))
    expect(setActiveTab).toHaveBeenCalledWith('shell')
  })

  it('focuses the shell input after the delay when shell is active', () => {
    vi.useFakeTimers()
    const input = document.createElement('input')
    const focusSpy = vi.spyOn(input, 'focus')
    renderTabs('shell', vi.fn(), { current: input })
    expect(focusSpy).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(FOCUS_DELAY_MS)
    })
    expect(focusSpy).toHaveBeenCalled()
  })
})

describe('RemediationAiOutput', () => {
  const logsEndRef = createRef<HTMLDivElement>()
  const makeLog = (id: string, type: LogEntry['type'], message: string, details?: string): LogEntry => ({
    id,
    type,
    message,
    details,
    timestamp: new Date(0),
  })

  it('shows the loading state when no logs and loading', () => {
    render(<RemediationAiOutput logs={[]} isLoadingInitialData isRunning={false} logsEndRef={logsEndRef} t={t} />)
    expect(screen.getByText('remediation.gatheringData')).toBeInTheDocument()
  })

  it('shows the start prompt when idle with no logs', () => {
    render(<RemediationAiOutput logs={[]} isLoadingInitialData={false} isRunning={false} logsEndRef={logsEndRef} t={t} />)
    expect(screen.getByText('remediation.clickStart')).toBeInTheDocument()
    expect(screen.getByText('remediation.claudeWillAnalyze')).toBeInTheDocument()
  })

  it('renders visible log types, details, and hides command/output entries', () => {
    const logs = [
      makeLog('1', 'thinking', 'thinking msg'),
      makeLog('2', 'error', 'error msg', 'stack details'),
      makeLog('3', 'command', 'kubectl get pods'),
      makeLog('4', 'output', 'raw output'),
    ]
    render(<RemediationAiOutput logs={logs} isLoadingInitialData={false} isRunning logsEndRef={logsEndRef} t={t} />)
    expect(screen.getByText('thinking msg')).toBeInTheDocument()
    expect(screen.getByText('error msg')).toBeInTheDocument()
    expect(screen.getByText('stack details')).toBeInTheDocument()
    expect(screen.queryByText('kubectl get pods')).not.toBeInTheDocument()
    expect(screen.queryByText('raw output')).not.toBeInTheDocument()
    expect(screen.getByText('common.processing')).toBeInTheDocument()
  })

  it('hides the processing indicator when not running', () => {
    render(<RemediationAiOutput logs={[makeLog('1', 'info', 'hello')]} isLoadingInitialData={false} isRunning={false} logsEndRef={logsEndRef} t={t} />)
    expect(screen.queryByText('common.processing')).not.toBeInTheDocument()
  })
})
