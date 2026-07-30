import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Helpers — build a minimal SpeechRecognition stub
// ---------------------------------------------------------------------------

function createMockRecognition() {
  return {
    continuous: false,
    interimResults: false,
    lang: '',
    maxAlternatives: 1,
    onstart: null as ((ev: Event) => void) | null,
    onresult: null as ((ev: Event) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
    onend: null as ((ev: Event) => void) | null,
    start: vi.fn(function (this: ReturnType<typeof createMockRecognition>) {
      queueMicrotask(() => this.onstart?.(new Event('start')))
    }),
    stop: vi.fn(),
    abort: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }
}

type MockRecognition = ReturnType<typeof createMockRecognition>

let mockRecognition: MockRecognition
let mockGetUserMedia: ReturnType<typeof vi.fn>
let mockTrackStop: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()

  mockTrackStop = vi.fn()
  const mockStream = { getTracks: () => [{ stop: mockTrackStop }] }

  mockGetUserMedia = vi.fn(() => Promise.resolve(mockStream))

  // Use a real class so `new` works correctly with vitest
  class FakeSpeechRecognition {
    continuous = false
    interimResults = false
    lang = ''
    maxAlternatives = 1
    onstart: ((ev: Event) => void) | null = null
    onresult: ((ev: Event) => void) | null = null
    onerror: ((ev: Event) => void) | null = null
    onend: ((ev: Event) => void) | null = null
    start = vi.fn(() => {
      queueMicrotask(() => this.onstart?.(new Event('start')))
    })
    stop = vi.fn()
    abort = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    dispatchEvent = vi.fn(() => true)

    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      mockRecognition = this as unknown as MockRecognition
    }
  }

  Object.defineProperty(window, 'webkitSpeechRecognition', {
    value: FakeSpeechRecognition,
    writable: true,
    configurable: true,
  })

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

function makeSpeechResult(transcript: string, isFinal: boolean) {
  const alt = { transcript, confidence: 0.9 }
  return {
    resultIndex: 0,
    results: {
      length: 1,
      0: { isFinal, length: 1, 0: alt, item: () => alt },
      item: () => ({ isFinal, length: 1, 0: alt, item: () => alt }),
    },
  } as unknown as Event
}

async function startAndFlush(result: { current: ReturnType<typeof import('../useMicrophoneInput').useMicrophoneInput> }) {
  await act(async () => { await result.current.startRecording() })
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMicrophoneInput', () => {
  let useMicrophoneInput: typeof import('../useMicrophoneInput').useMicrophoneInput

  beforeEach(async () => {
    const mod = await import('../useMicrophoneInput')
    useMicrophoneInput = mod.useMicrophoneInput
  })

  it('reports isSupported when webkitSpeechRecognition exists', () => {
    const { result } = renderHook(() => useMicrophoneInput())
    expect(result.current.isSupported).toBe(true)
  })

  it('returns initial idle state', () => {
    const { result } = renderHook(() => useMicrophoneInput())
    expect(result.current.isRecording).toBe(false)
    expect(result.current.isTranscribing).toBe(false)
    expect(result.current.transcript).toBe('')
    expect(result.current.error).toBeNull()
  })

  it('starts recording and sets isRecording + isTranscribing', async () => {
    const { result } = renderHook(() => useMicrophoneInput())
    await startAndFlush(result)

    expect(result.current.isRecording).toBe(true)
    expect(result.current.isTranscribing).toBe(true)
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true })
  })

  it('accumulates final transcript segments', async () => {
    const { result } = renderHook(() => useMicrophoneInput())
    await startAndFlush(result)

    await act(async () => {
      mockRecognition.onresult?.(makeSpeechResult('hello world', true))
    })

    expect(result.current.transcript).toBe('hello world ')
  })

  it('does not accumulate non-final (interim) results', async () => {
    const { result } = renderHook(() => useMicrophoneInput())
    await startAndFlush(result)

    await act(async () => {
      mockRecognition.onresult?.(makeSpeechResult('interim text', false))
    })

    expect(result.current.transcript).toBe('')
  })

  it('stops recording and releases resources', async () => {
    const { result } = renderHook(() => useMicrophoneInput())
    await startAndFlush(result)

    await act(async () => { await result.current.stopRecording() })

    expect(result.current.isRecording).toBe(false)
    expect(mockRecognition.abort).toHaveBeenCalled()
    expect(mockTrackStop).toHaveBeenCalled()
  })

  it('sets error on recognition error and stops', async () => {
    const { result } = renderHook(() => useMicrophoneInput())
    await startAndFlush(result)

    await act(async () => {
      mockRecognition.onerror?.({ error: 'no-speech' } as unknown as Event)
    })

    expect(result.current.error).toBe('No speech detected. Please try again.')
    expect(result.current.isRecording).toBe(false)
  })

  it('maps known error codes to friendly messages', async () => {
    const errorMap: Record<string, string> = {
      'audio-capture': 'No microphone found. Please check your device.',
      'network': 'Network error. Please check your connection.',
      'permission-denied': 'Microphone access was denied. Please enable it in settings.',
      'service-not-allowed': 'Speech recognition service not allowed.',
      'bad-grammar': 'Grammar error. Please try again.',
      'aborted': 'Recording was cancelled.',
    }

    for (const [code, expected] of Object.entries(errorMap)) {
      const { result } = renderHook(() => useMicrophoneInput())
      await startAndFlush(result)

      await act(async () => {
        mockRecognition.onerror?.({ error: code } as unknown as Event)
      })

      expect(result.current.error).toBe(expected)
    }
  })

  it('falls back to generic error for unknown codes', async () => {
    const { result } = renderHook(() => useMicrophoneInput())
    await startAndFlush(result)

    await act(async () => {
      mockRecognition.onerror?.({ error: 'something-weird' } as unknown as Event)
    })

    expect(result.current.error).toBe('Error: something-weird')
  })

  it('auto-stops after RECORDING_TIMEOUT_MS (60s)', async () => {
    const { result } = renderHook(() => useMicrophoneInput())
    await startAndFlush(result)

    expect(result.current.isRecording).toBe(true)

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })

    expect(result.current.isRecording).toBe(false)
  })

  it('stops on recognition end event', async () => {
    const { result } = renderHook(() => useMicrophoneInput())
    await startAndFlush(result)

    await act(async () => {
      mockRecognition.onend?.(new Event('end'))
    })

    expect(result.current.isRecording).toBe(false)
    expect(result.current.isTranscribing).toBe(false)
  })

  it('clearTranscript resets transcript to empty', async () => {
    const { result } = renderHook(() => useMicrophoneInput())
    await startAndFlush(result)

    await act(async () => {
      mockRecognition.onresult?.(makeSpeechResult('some text', true))
    })
    expect(result.current.transcript).toBe('some text ')

    act(() => result.current.clearTranscript())
    expect(result.current.transcript).toBe('')
  })

  it('clearError resets error to null', async () => {
    const { result } = renderHook(() => useMicrophoneInput())
    await startAndFlush(result)

    await act(async () => {
      mockRecognition.onerror?.({ error: 'no-speech' } as unknown as Event)
    })
    expect(result.current.error).not.toBeNull()

    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })

  it('handles getUserMedia rejection gracefully', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'))

    const { result } = renderHook(() => useMicrophoneInput())

    await act(async () => { await result.current.startRecording() })

    expect(result.current.error).toBe('Permission denied')
    expect(result.current.isRecording).toBe(false)
  })

  it('cleans up on unmount', async () => {
    const { result, unmount } = renderHook(() => useMicrophoneInput())
    await startAndFlush(result)

    const recognitionRef = mockRecognition
    unmount()

    expect(recognitionRef.abort).toHaveBeenCalled()
  })
})
