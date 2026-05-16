// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MicrophoneButton } from './MicrophoneButton'
import { useMicrophoneInput } from '../../hooks/useMicrophoneInput'

// Mock the hook
vi.mock('../../hooks/useMicrophoneInput', () => ({
  useMicrophoneInput: vi.fn(),
}))

// Mock i18next
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue: string }) => options?.defaultValue || key,
  }),
}))

describe('MicrophoneButton Component', () => {
  const mockOnTranscript = vi.fn()
  
  const defaultMockReturn = {
    isRecording: false,
    isTranscribing: false,
    transcript: '',
    error: null,
    isSupported: true,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    clearTranscript: vi.fn(),
    clearError: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMicrophoneInput).mockReturnValue(defaultMockReturn)
  })

  it('renders nothing if not supported', () => {
    vi.mocked(useMicrophoneInput).mockReturnValue({
      ...defaultMockReturn,
      isSupported: false,
    })
    const { container } = render(<MicrophoneButton onTranscript={mockOnTranscript} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders microphone icon when idle', () => {
    render(<MicrophoneButton onTranscript={mockOnTranscript} />)
    const button = screen.getByTestId('microphone-button')
    expect(button).toBeInTheDocument()
    // Lucide Mic icon should be present (we can check for title or class if needed)
    expect(button).toHaveAttribute('title', 'Start recording')
  })

  it('renders stop icon when recording', () => {
    vi.mocked(useMicrophoneInput).mockReturnValue({
      ...defaultMockReturn,
      isRecording: true,
    })
    render(<MicrophoneButton onTranscript={mockOnTranscript} />)
    const button = screen.getByTestId('microphone-button')
    expect(button).toHaveAttribute('title', 'Stop recording')
    expect(screen.getByText('Recording...')).toBeInTheDocument()
  })

  it('calls startRecording when clicked while idle', () => {
    const startRecording = vi.fn()
    vi.mocked(useMicrophoneInput).mockReturnValue({
      ...defaultMockReturn,
      startRecording,
    })
    render(<MicrophoneButton onTranscript={mockOnTranscript} />)
    fireEvent.click(screen.getByTestId('microphone-button'))
    expect(startRecording).toHaveBeenCalled()
  })

  it('calls stopRecording when clicked while recording', () => {
    const stopRecording = vi.fn()
    vi.mocked(useMicrophoneInput).mockReturnValue({
      ...defaultMockReturn,
      isRecording: true,
      stopRecording,
    })
    render(<MicrophoneButton onTranscript={mockOnTranscript} />)
    fireEvent.click(screen.getByTestId('microphone-button'))
    expect(stopRecording).toHaveBeenCalled()
  })

  it('shows processing indicator when transcribing', () => {
    vi.mocked(useMicrophoneInput).mockReturnValue({
      ...defaultMockReturn,
      isTranscribing: true,
    })
    render(<MicrophoneButton onTranscript={mockOnTranscript} />)
    expect(screen.getByText('Processing...')).toBeInTheDocument()
  })

  it('shows error message when error exists', () => {
    vi.mocked(useMicrophoneInput).mockReturnValue({
      ...defaultMockReturn,
      error: 'Mic access denied',
    })
    render(<MicrophoneButton onTranscript={mockOnTranscript} />)
    expect(screen.getByText('Mic access denied')).toBeInTheDocument()
  })

  it('calls onTranscript when recording stops and transcript is available', () => {
    const { rerender } = render(<MicrophoneButton onTranscript={mockOnTranscript} />)
    
    // Simulate recording stopped with transcript
    vi.mocked(useMicrophoneInput).mockReturnValue({
      ...defaultMockReturn,
      isRecording: false,
      isTranscribing: false,
      transcript: 'Hello world',
    })
    
    rerender(<MicrophoneButton onTranscript={mockOnTranscript} />)
    
    expect(mockOnTranscript).toHaveBeenCalledWith('Hello world')
  })

  it('is disabled when disabled prop is true', () => {
    render(<MicrophoneButton onTranscript={mockOnTranscript} disabled />)
    expect(screen.getByTestId('microphone-button')).toBeDisabled()
  })
})
