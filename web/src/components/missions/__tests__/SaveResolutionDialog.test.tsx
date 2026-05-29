/**
 * SaveResolutionDialog unit tests
 *
 * Covers: closed state, open render, generating state, AI error with retry,
 * form field editing, validation, save success, step management, visibility toggle.
 */

import type React from 'react'
import * as ReactModule from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// ── Hoisted mock refs ────────────────────────────────────────────────────

const { mockSaveResolution, mockDetectIssueSignature, mockAppendWsAuthToken } = vi.hoisted(() => ({
  mockSaveResolution: vi.fn(),
  mockDetectIssueSignature: vi.fn(() => ({
    type: 'CrashLoopBackOff',
    resourceKind: 'Pod',
    errorPattern: undefined,
    namespace: 'default',
  })),
  mockAppendWsAuthToken: vi.fn().mockResolvedValue('ws://mock/ws'),
}))

// ── Module mocks ─────────────────────────────────────────────────────────

vi.mock('../../../hooks/useResolutions', () => ({
  useResolutions: () => ({ saveResolution: mockSaveResolution }),
  detectIssueSignature: mockDetectIssueSignature,
}))

vi.mock('../../../lib/utils/wsAuth', () => ({
  appendWsAuthToken: mockAppendWsAuthToken,
}))

vi.mock('../../../lib/constants', () => ({
  LOCAL_AGENT_WS_URL: 'ws://localhost:8585/ws',
}))

vi.mock('../../../lib/modals/BaseModal', () => ({
  BaseModal: Object.assign(
    ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
      isOpen ? <div role="dialog">{children}</div> : null,
    {
      Header: ({ title, onClose }: { title: string; onClose?: () => void }) => (
        <div>
          <h1>{title}</h1>
          {onClose && <button onClick={onClose} aria-label="close dialog">×</button>}
        </div>
      ),
      Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Footer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }
  ),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const translations: Record<string, string> = {
        'dashboard.missions.saveResolution': 'Save Resolution',
        'dashboard.missions.titleRequired': 'Title is required',
        'dashboard.missions.issueTypeRequired': 'Issue type is required',
        'dashboard.missions.summaryRequired': 'Summary is required',
        'dashboard.missions.failedToSave': 'Failed to save',
        'dashboard.missions.generatingAISummary': 'Generating AI Summary',
        'dashboard.missions.creatingReusablePair': 'Creating a reusable problem/solution pair',
        'dashboard.missions.aiGeneratedReview': 'AI-generated summary - review and edit as needed',
        'dashboard.missions.aiSummaryFallbackNotice': 'AI summary unavailable — using basic extraction.',
        'dashboard.missions.aiSummaryFallbackDetail': 'AI summary unavailable — using basic extraction. {{error}}',
        'dashboard.missions.title': 'Title',
        'dashboard.missions.issueType': 'Issue Type',
        'dashboard.missions.resourceKind': 'Resource Kind',
        'dashboard.missions.problemAndSolution': 'Problem & Solution',
        'dashboard.missions.remediationSteps': 'Remediation Steps',
        'dashboard.missions.yamlConfig': 'YAML / Config',
        'dashboard.missions.visibility': 'Visibility',
        'dashboard.missions.private': 'Private',
        'dashboard.missions.shareToOrg': 'Share to Org',
        'dashboard.missions.regenerate': 'Regenerate',
        'dashboard.missions.generating': 'Generating...',
        'dashboard.missions.addStep': '+ Add step',
        'actions.cancel': 'Cancel',
        'common.saving': 'Saving...',
        'common.retry': 'Retry',
        'dashboard.missions.titlePlaceholder': 'e.g., Fix OOM in payment service',
        'dashboard.missions.issueTypePlaceholder': 'e.g. CrashLoopBackOff',
        'dashboard.missions.resourceKindPlaceholder': 'e.g. Pod',
        'dashboard.missions.problemSolutionPlaceholder': 'Describe the problem and solution',
        'dashboard.missions.stepPlaceholder': 'Step description',
        'dashboard.missions.yamlPlaceholder': 'Paste YAML here (optional)',
      }
      const translation = translations[key] ?? key
      return Object.entries(options ?? {}).reduce(
        (text, [optionKey, value]) => text.replace(`{{${optionKey}}}`, String(value)),
        translation,
      )
    },
  }),
}))

// ── WebSocket mock ────────────────────────────────────────────────────────

type WsCallback = (event: unknown) => void

class MockWebSocket {
  static lastInstance: MockWebSocket | null = null
  onopen: WsCallback | null = null
  onmessage: WsCallback | null = null
  onerror: WsCallback | null = null
  onclose: WsCallback | null = null
  sent: string[] = []
  readyState = 0

  constructor(public url: string) {
    MockWebSocket.lastInstance = this
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 3
  }

  // Test helpers
  simulateOpen() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }

  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
  }

  simulateError() {
    this.onerror?.(new Event('error'))
  }

  simulateClose(code = 1000) {
    this.onclose?.(new CloseEvent('close', { code }))
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────

const BASE_MISSION = {
  id: 'mission-1',
  title: 'Debug nginx crash',
  description: 'nginx pod keeps crashing with OOM',
  agent: 'claude',
  cluster: 'prod-us',
  messages: [
    { role: 'user', content: 'nginx pod is crashloopbackoff' },
    { role: 'assistant', content: 'Let me check the logs...' },
  ],
  status: 'complete',
  createdAt: '2026-01-01T00:00:00Z',
}

const DEFAULT_PROPS = {
  mission: BASE_MISSION as never,
  isOpen: true,
  onClose: vi.fn(),
  onSaved: vi.fn(),
}

const SAVE_DIALOG_STATE_CALLS_PER_RENDER = 11

function mockUseStateAtCall(callIndex: number, forcedValue: unknown) {
  const actualUseState = ReactModule.useState
  let callCount = 0

  return vi.spyOn(ReactModule, 'useState').mockImplementation(((initial: unknown) => {
    callCount += 1
    if (
      callCount >= callIndex
      && (callCount - callIndex) % SAVE_DIALOG_STATE_CALLS_PER_RENDER === 0
    ) {
      return [forcedValue, vi.fn()] as never
    }

    return actualUseState(initial as never)
  }) as typeof ReactModule.useState)
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function renderDialogAndWaitForError(props = DEFAULT_PROPS) {
  // Make WS error immediately: after appendWsAuthToken resolves, WS is created,
  // then we simulate error so generateSummary catch fires → isGenerating=false
  global.WebSocket = MockWebSocket as unknown as typeof WebSocket
  const result = render(<SaveResolutionDialog {...props} />)

  await act(async () => {
    await Promise.resolve() // let appendWsAuthToken resolve
    await Promise.resolve() // let new WebSocket(url) be created
    MockWebSocket.lastInstance?.simulateError()
    await Promise.resolve() // let catch + state updates propagate
  })

  return result
}

// ── Tests ─────────────────────────────────────────────────────────────────

import { SaveResolutionDialog } from '../SaveResolutionDialog'

describe('SaveResolutionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockWebSocket.lastInstance = null
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket
    mockAppendWsAuthToken.mockResolvedValue('ws://mock/ws')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Closed / open ────────────────────────────────────────────────────

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <SaveResolutionDialog mission={BASE_MISSION as never} isOpen={false} onClose={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the dialog title when open', async () => {
    render(<SaveResolutionDialog {...DEFAULT_PROPS} />)
    expect(screen.getByRole('heading', { name: /Save Resolution/i })).toBeInTheDocument()
  })

  // ── Generating state ─────────────────────────────────────────────────

  it('shows generating indicator immediately on open', async () => {
    // appendWsAuthToken takes time, so isGenerating=true during that time
    mockAppendWsAuthToken.mockReturnValue(new Promise(() => {})) // never resolves
    render(<SaveResolutionDialog {...DEFAULT_PROPS} />)
    expect(await screen.findByText('Generating AI Summary')).toBeInTheDocument()
  })

  it('pre-fills title from mission while generating', async () => {
    mockAppendWsAuthToken.mockReturnValue(new Promise(() => {}))
    render(<SaveResolutionDialog {...DEFAULT_PROPS} />)
    const titleInput = screen.getByPlaceholderText('e.g., Fix OOM in payment service') as HTMLInputElement
    await waitFor(() => {
      expect(titleInput.value).toBe(BASE_MISSION.title)
    })
  })

  it('disables form inputs while generating', async () => {
    mockAppendWsAuthToken.mockReturnValue(new Promise(() => {}))
    render(<SaveResolutionDialog {...DEFAULT_PROPS} />)
    const titleInput = screen.getByPlaceholderText('e.g., Fix OOM in payment service')
    await waitFor(() => {
      expect(titleInput).toBeDisabled()
    })
  })

  // ── AI error state ───────────────────────────────────────────────────

  it('shows AI error message after WebSocket failure', async () => {
    await renderDialogAndWaitForError()
    expect(await screen.findByText(/Could not reach the local agent/i)).toBeInTheDocument()
  })

  it('shows retry button after AI error', async () => {
    await renderDialogAndWaitForError()
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  })

  it('re-triggers AI generation when retry button is clicked', async () => {
    await renderDialogAndWaitForError()
    const retryBtn = screen.getByRole('button', { name: /Retry/i })
    await act(async () => {
      fireEvent.click(retryBtn)
    })
    expect(mockAppendWsAuthToken).toHaveBeenCalledTimes(2)
  })

  it('enables form fields after AI error', async () => {
    await renderDialogAndWaitForError()
    const titleInput = screen.getByPlaceholderText('e.g., Fix OOM in payment service')
    expect(titleInput).not.toBeDisabled()
  })

  // ── Form interaction ─────────────────────────────────────────────────

  it('allows editing the title field', async () => {
    await renderDialogAndWaitForError()
    const input = screen.getByPlaceholderText('e.g., Fix OOM in payment service') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'My custom fix' } })
    expect(input.value).toBe('My custom fix')
  })

  it('allows editing the issue type field', async () => {
    await renderDialogAndWaitForError()
    const input = screen.getByPlaceholderText('e.g. CrashLoopBackOff') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'OOMKilled' } })
    expect(input.value).toBe('OOMKilled')
  })

  it('allows editing the summary textarea', async () => {
    await renderDialogAndWaitForError()
    const textarea = screen.getByPlaceholderText('Describe the problem and solution') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Fixed by increasing memory limit' } })
    expect(textarea.value).toBe('Fixed by increasing memory limit')
  })

  // ── Step management ──────────────────────────────────────────────────

  it('adds a new step when Add step is clicked', async () => {
    await renderDialogAndWaitForError()
    const addBtn = screen.getByText('+ Add step')
    fireEvent.click(addBtn)
    const inputs = screen.getAllByPlaceholderText('Step description')
    expect(inputs.length).toBe(2)
  })

  it('removes a step when the remove button is clicked', async () => {
    await renderDialogAndWaitForError()
    const addBtn = screen.getByText('+ Add step')
    fireEvent.click(addBtn)
    const removeButtons = screen.getAllByRole('button').filter(b =>
      b.querySelector('svg') && b.className.includes('hover:bg-red'),
    )
    expect(removeButtons.length).toBeGreaterThan(0)
    fireEvent.click(removeButtons[0])
    const inputs = screen.getAllByPlaceholderText('Step description')
    expect(inputs.length).toBe(1)
  })

  it('allows editing step content', async () => {
    await renderDialogAndWaitForError()
    const input = screen.getByPlaceholderText('Step description') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'kubectl apply -f fix.yaml' } })
    expect(input.value).toBe('kubectl apply -f fix.yaml')
  })

  // ── Visibility toggle ────────────────────────────────────────────────

  it('defaults to private visibility', async () => {
    await renderDialogAndWaitForError()
    const privateBtn = screen.getByRole('button', { name: /Private/i })
    expect(privateBtn.className).toContain('bg-primary')
  })

  it('switches to shared visibility on click', async () => {
    await renderDialogAndWaitForError()
    const shareBtn = screen.getByRole('button', { name: /Share to Org/i })
    fireEvent.click(shareBtn)
    expect(shareBtn.className).toContain('bg-blue-500')
  })

  // ── Validation ───────────────────────────────────────────────────────

  it('shows error when saving with empty title', async () => {
    await renderDialogAndWaitForError()
    const titleInput = screen.getByPlaceholderText('e.g., Fix OOM in payment service') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Resolution/i }))
    await waitFor(() => {
      expect(screen.getByText('Title is required')).toBeInTheDocument()
    })
  })

  it('shows error when saving with empty issue type', async () => {
    await renderDialogAndWaitForError()
    // Set title but clear issue type
    const titleInput = screen.getByPlaceholderText('e.g., Fix OOM in payment service')
    fireEvent.change(titleInput, { target: { value: 'My Title' } })
    const issueInput = screen.getByPlaceholderText('e.g. CrashLoopBackOff') as HTMLInputElement
    fireEvent.change(issueInput, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Resolution/i }))
    await waitFor(() => {
      expect(screen.getByText('Issue type is required')).toBeInTheDocument()
    })
  })

  it('shows error when saving with empty summary', async () => {
    await renderDialogAndWaitForError()
    const titleInput = screen.getByPlaceholderText('e.g., Fix OOM in payment service')
    fireEvent.change(titleInput, { target: { value: 'My Title' } })
    const issueInput = screen.getByPlaceholderText('e.g. CrashLoopBackOff')
    fireEvent.change(issueInput, { target: { value: 'CrashLoopBackOff' } })
    // summary textarea is empty by default after error
    fireEvent.click(screen.getByRole('button', { name: /Save Resolution/i }))
    await waitFor(() => {
      expect(screen.getByText('Summary is required')).toBeInTheDocument()
    })
  })

  // ── Save success ─────────────────────────────────────────────────────

  it('shows a spinner while saving', () => {
    mockUseStateAtCall(8, true)
    mockAppendWsAuthToken.mockReturnValue(new Promise(() => {}))

    render(<SaveResolutionDialog {...DEFAULT_PROPS} />)

    const saveButton = screen.getByRole('button', { name: /Saving/i })
    expect(saveButton).toBeDisabled()
    expect(saveButton.querySelector('svg.animate-spin')).toBeInTheDocument()
  })

  it('calls saveResolution and closes on valid save', async () => {
    const onClose = vi.fn()
    const onSaved = vi.fn()
    await renderDialogAndWaitForError({ ...DEFAULT_PROPS, onClose, onSaved })

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('e.g., Fix OOM in payment service'), { target: { value: 'Nginx OOM fix' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. CrashLoopBackOff'), { target: { value: 'OOMKilled' } })
    fireEvent.change(screen.getByPlaceholderText('Describe the problem and solution'), { target: { value: 'Increased memory limit' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Resolution/i }))
    })

    expect(mockSaveResolution).toHaveBeenCalledTimes(1)
    expect(mockSaveResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: 'mission-1',
        title: 'Nginx OOM fix',
        visibility: 'private',
      }),
    )
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // ── Cancel / Regenerate ──────────────────────────────────────────────

  it('calls onClose when cancel is clicked', async () => {
    const onClose = vi.fn()
    render(<SaveResolutionDialog mission={BASE_MISSION as never} isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls appendWsAuthToken when regenerate is clicked', async () => {
    await renderDialogAndWaitForError()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Regenerate/i }))
    })
    expect(mockAppendWsAuthToken).toHaveBeenCalledTimes(2)
  })
})
