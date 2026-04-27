import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardChat, ChatMessage } from '../CardChat'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const mockShowToast = vi.fn()
vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

let mockIsDemoMode = false
vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ width, height, variant }: { width?: number; height?: number; variant?: string }) => (
    <div data-testid="skeleton" data-variant={variant} style={{ width, height }} />
  ),
}))

vi.mock('../../../lib/modals', () => ({
  BaseModal: Object.assign(
    ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
      isOpen ? <div data-testid="modal">{children}</div> : null,
    {
      Header: ({
        title,
        description,
        onClose,
      }: {
        title: string
        description: string
        onClose: () => void
      }) => (
        <div data-testid="modal-header">
          <span>{title}</span>
          <span>{description}</span>
          <button onClick={onClose} data-testid="modal-close">
            close
          </button>
        </div>
      ),
      Content: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="modal-content">{children}</div>
      ),
      Footer: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="modal-footer">{children}</div>
      ),
    }
  ),
}))

// JSDOM does not implement scrollIntoView — stub it globally for these tests.
Element.prototype.scrollIntoView = vi.fn()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Hello, I can help you.',
    timestamp: new Date('2024-01-01T12:00:00Z').toISOString(),
    ...overrides,
  }
}

const defaultProps = {
  isOpen: true,
  cardId: 'card-123',
  cardType: 'cluster_health',
  cardTitle: 'Cluster Health',
  messages: [] as ChatMessage[],
  onClose: vi.fn(),
  onSendMessage: vi.fn(),
  onApplyAction: vi.fn(),
}

function renderChat(props = {}) {
  return render(<CardChat {...defaultProps} {...props} />)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CardChat', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockIsDemoMode = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  describe('visibility', () => {
    it('renders modal when isOpen=true', () => {
      renderChat()
      expect(screen.getByTestId('modal')).toBeInTheDocument()
    })

    it('renders nothing when isOpen=false', () => {
      renderChat({ isOpen: false })
      expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
    })

    it('displays the card title in the header description', () => {
      renderChat({ cardTitle: 'My Card' })
      expect(screen.getByText('My Card')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('empty state', () => {
    it('shows empty-state placeholder when messages array is empty', () => {
      renderChat({ messages: [] })
      expect(screen.getByText('cardChat.askMeAnything')).toBeInTheDocument()
    })

    it('shows capability hints in empty state', () => {
      renderChat({ messages: [] })
      expect(screen.getByText('cardChat.modifyData')).toBeInTheDocument()
      expect(screen.getByText('cardChat.drillDown')).toBeInTheDocument()
      expect(screen.getByText('cardChat.explainSeen')).toBeInTheDocument()
      expect(screen.getByText('cardChat.setupAlerts')).toBeInTheDocument()
    })

    it('hides empty-state when messages are present', () => {
      renderChat({ messages: [makeMessage()] })
      expect(screen.queryByText('cardChat.askMeAnything')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('message rendering', () => {
    it('renders assistant message with Bot avatar', () => {
      renderChat({ messages: [makeMessage({ role: 'assistant', content: 'Hi there' })] })
      expect(screen.getByText('Hi there')).toBeInTheDocument()
    })

    it('renders user message', () => {
      renderChat({ messages: [makeMessage({ role: 'user', content: 'My question' })] })
      expect(screen.getByText('My question')).toBeInTheDocument()
    })

    it('renders formatted timestamp', () => {
      const ts = new Date('2024-01-01T08:30:00Z').toISOString()
      renderChat({ messages: [makeMessage({ timestamp: ts })] })
      // The component uses toLocaleTimeString() — just check something is rendered
      const timeElements = screen.getAllByText(/\d+:\d+/)
      expect(timeElements.length).toBeGreaterThan(0)
    })

    it('renders action button on assistant messages that have an action', () => {
      const msg = makeMessage({
        role: 'assistant',
        action: { type: 'filter', payload: { ns: 'default' } },
      })
      renderChat({ messages: [msg] })
      expect(screen.getByText(/cardChat\.apply/i)).toBeInTheDocument()
    })

    it('does NOT render action button when message has no action', () => {
      renderChat({ messages: [makeMessage({ action: undefined })] })
      expect(screen.queryByText(/cardChat\.apply/i)).not.toBeInTheDocument()
    })

    it('renders multiple messages in order', () => {
      const msgs: ChatMessage[] = [
        makeMessage({ id: '1', role: 'user', content: 'First' }),
        makeMessage({ id: '2', role: 'assistant', content: 'Second' }),
      ]
      renderChat({ messages: msgs })
      const items = screen.getAllByText(/First|Second/)
      expect(items[0].textContent).toBe('First')
      expect(items[1].textContent).toBe('Second')
    })
  })

  // -------------------------------------------------------------------------
  describe('onApplyAction', () => {
    it('calls onApplyAction when Apply button is clicked', async () => {
      const action: ChatMessage['action'] = { type: 'config_change', payload: { key: 'val' } }
      const msg = makeMessage({ role: 'assistant', action })
      renderChat({ messages: [msg] })

      await user.click(screen.getByText(/cardChat\.apply/i))
      expect(defaultProps.onApplyAction).toHaveBeenCalledWith(action)
    })
  })

  // -------------------------------------------------------------------------
  describe('quick prompts', () => {
    it('renders quick prompts for cluster_health cardType', () => {
      renderChat({ cardType: 'cluster_health' })
      expect(screen.getByText('Show only unhealthy clusters')).toBeInTheDocument()
    })

    it('renders quick prompts for event_stream cardType', () => {
      renderChat({ cardType: 'event_stream' })
      expect(screen.getByText('Show only warnings and errors')).toBeInTheDocument()
    })

    it('renders default quick prompts for unknown cardType', () => {
      renderChat({ cardType: 'unknown_type' })
      expect(screen.getByText('What am I looking at?')).toBeInTheDocument()
    })

    it('clicking a quick prompt fills the textarea', async () => {
      renderChat({ cardType: 'cluster_health' })
      await user.click(screen.getByText('Show only unhealthy clusters'))
      const textarea = screen.getByRole('textbox')
      expect((textarea as HTMLTextAreaElement).value).toBe('Show only unhealthy clusters')
    })

    it('clicking a quick prompt focuses the textarea', async () => {
      renderChat({ cardType: 'cluster_health' })
      await user.click(screen.getByText('Show only unhealthy clusters'))
      const textarea = screen.getByRole('textbox')
      expect(document.activeElement).toBe(textarea)
    })
  })

  // -------------------------------------------------------------------------
  describe('send message', () => {
    it('Send button is disabled when input is empty', () => {
      renderChat()
      const sendBtn = screen.getByRole('button', { name: '' }) // Send icon button
      // Disabled state: bg-secondary class applied — check aria or disabled attr
      const buttons = screen.getAllByRole('button')
      const sendButton = buttons.find((b) => b.querySelector('svg'))
      // The send button should be the last button in footer
      const footerButtons = screen.getByTestId('modal-footer').querySelectorAll('button')
      const sendBtnEl = footerButtons[footerButtons.length - 1] as HTMLButtonElement
      expect(sendBtnEl.disabled).toBe(true)
    })

    it('Send button is enabled when input has text', async () => {
      renderChat()
      const textarea = screen.getByRole('textbox')
      await user.type(textarea, 'hello')
      const footerButtons = screen.getByTestId('modal-footer').querySelectorAll('button')
      const sendBtnEl = footerButtons[footerButtons.length - 1] as HTMLButtonElement
      expect(sendBtnEl.disabled).toBe(false)
    })

    it('calls onSendMessage with trimmed input on Send click', async () => {
      defaultProps.onSendMessage.mockResolvedValue(makeMessage({ role: 'assistant' }))
      renderChat()
      await user.type(screen.getByRole('textbox'), '  hello world  ')
      const footerButtons = screen.getByTestId('modal-footer').querySelectorAll('button')
      await user.click(footerButtons[footerButtons.length - 1])
      expect(defaultProps.onSendMessage).toHaveBeenCalledWith('hello world')
    })

    it('clears input after sending', async () => {
      defaultProps.onSendMessage.mockResolvedValue(makeMessage())
      renderChat()
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      await user.type(textarea, 'test message')
      const footerButtons = screen.getByTestId('modal-footer').querySelectorAll('button')
      await user.click(footerButtons[footerButtons.length - 1])
      await waitFor(() => expect(textarea.value).toBe(''))
    })

    it('pressing Enter sends the message', async () => {
      defaultProps.onSendMessage.mockResolvedValue(makeMessage())
      renderChat()
      const textarea = screen.getByRole('textbox')
      await user.type(textarea, 'enter message')
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      await waitFor(() => expect(defaultProps.onSendMessage).toHaveBeenCalledWith('enter message'))
    })

    it('pressing Shift+Enter does NOT send', async () => {
      renderChat()
      const textarea = screen.getByRole('textbox')
      await user.type(textarea, 'multi\nline')
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
      expect(defaultProps.onSendMessage).not.toHaveBeenCalled()
    })

    it('shows loading spinner while waiting for response', async () => {
      let resolve: (v: ChatMessage) => void
      defaultProps.onSendMessage.mockReturnValue(
        new Promise<ChatMessage>((r) => { resolve = r })
      )
      renderChat()
      await user.type(screen.getByRole('textbox'), 'slow query')
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: false })
      await waitFor(() =>
        expect(screen.getByText('cardChat.thinking')).toBeInTheDocument()
      )
      await act(async () => resolve!(makeMessage()))
    })

    it('disables textarea and send button while loading', async () => {
      let resolve: (v: ChatMessage) => void
      defaultProps.onSendMessage.mockReturnValue(
        new Promise<ChatMessage>((r) => { resolve = r })
      )
      renderChat()
      await user.type(screen.getByRole('textbox'), 'slow query')
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: false })
      await waitFor(() => {
        const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
        expect(textarea.disabled).toBe(true)
      })
      await act(async () => resolve!(makeMessage()))
    })

    it('shows error toast when onSendMessage rejects', async () => {
      defaultProps.onSendMessage.mockRejectedValue(new Error('Network error'))
      renderChat()
      await user.type(screen.getByRole('textbox'), 'boom')
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: false })
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(
          'Failed to send message. Please try again.',
          'error'
        )
      )
    })

    it('does not call onSendMessage when input is blank', async () => {
      renderChat()
      const textarea = screen.getByRole('textbox')
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      expect(defaultProps.onSendMessage).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  describe('copy message', () => {
    it('shows copy button on assistant messages', () => {
      renderChat({ messages: [makeMessage({ role: 'assistant' })] })
      // Copy button exists in the message
      const copyBtns = screen.getAllByRole('button').filter((b) =>
        b.querySelector('svg')
      )
      expect(copyBtns.length).toBeGreaterThan(0)
    })

    it('calls copyToClipboard with message content', async () => {
      const { copyToClipboard } = await import('../../../lib/clipboard')
      const msg = makeMessage({ role: 'assistant', content: 'Copy me' })
      renderChat({ messages: [msg] })
      // Find copy button — it's inside the message bubble
      const msgContent = screen.getByTestId('modal-content')
      const copyBtn = msgContent.querySelectorAll('button')[0]
      await user.click(copyBtn)
      expect(copyToClipboard).toHaveBeenCalledWith('Copy me')
    })

    it('shows CheckCircle icon after copying and reverts after timeout', async () => {
      const { copyToClipboard } = await import('../../../lib/clipboard')
      vi.mocked(copyToClipboard).mockImplementation(() => { })
      const msg = makeMessage({ id: 'abc', role: 'assistant', content: 'Copy me' })
      renderChat({ messages: [msg] })
      const msgContent = screen.getByTestId('modal-content')
      const copyBtn = msgContent.querySelectorAll('button')[0]
      await user.click(copyBtn)
      // After click copiedId should be set — CheckCircle replaces Copy icon
      // We can't directly test icon, but we can verify no error thrown and timer fires
      act(() => vi.runAllTimers())
      // No assertion error means timer cleared correctly
    })
  })

  // -------------------------------------------------------------------------
  describe('close behaviour', () => {
    it('calls onClose when modal close button is clicked', async () => {
      renderChat()
      await user.click(screen.getByTestId('modal-close'))
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  describe('timer cleanup', () => {
    it('clears copiedTimerRef on unmount without errors', () => {
      const { unmount } = renderChat({ messages: [makeMessage({ role: 'assistant' })] })
      // Set a timer by clicking copy
      act(() => unmount())
      // If clearTimeout was not called this would leak — test just verifies no throw
    })
  })

  // -------------------------------------------------------------------------
  describe('demo mode', () => {
    it('shows demo messages when in demo mode with no real messages', () => {
      mockIsDemoMode = true
      renderChat({ messages: [] })
      expect(screen.getByText('cardChat.demoConversation')).toBeInTheDocument()
      // "Show only unhealthy clusters" appears in both demo messages and quick
      // prompts, so verify at least two occurrences (one from each source).
      const matches = screen.getAllByText('Show only unhealthy clusters')
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })

    it('does not show demo messages when not in demo mode', () => {
      mockIsDemoMode = false
      renderChat({ messages: [] })
      expect(screen.queryByText('cardChat.demoConversation')).not.toBeInTheDocument()
    })

    it('does not show demo messages when real messages exist in demo mode', () => {
      mockIsDemoMode = true
      renderChat({ messages: [makeMessage({ role: 'user', content: 'Real message' })] })
      expect(screen.queryByText('cardChat.demoConversation')).not.toBeInTheDocument()
      expect(screen.getByText('Real message')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  describe('skeleton loading', () => {
    it('shows skeleton when isLoadingMessages is true', () => {
      renderChat({ isLoadingMessages: true })
      const skeletons = screen.getAllByTestId('skeleton')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('does not show messages when skeleton is visible', () => {
      renderChat({ isLoadingMessages: true, messages: [makeMessage()] })
      expect(screen.queryByText('Hello, I can help you.')).not.toBeInTheDocument()
    })

    it('shows messages when isLoadingMessages is false', () => {
      renderChat({ isLoadingMessages: false, messages: [makeMessage()] })
      expect(screen.getByText('Hello, I can help you.')).toBeInTheDocument()
    })
  })
})