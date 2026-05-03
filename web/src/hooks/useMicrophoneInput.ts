import { useState, useRef, useCallback, useEffect } from 'react'

interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: ((this: SpeechRecognition, ev: Event) => unknown) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null
  onend: ((this: SpeechRecognition, ev: Event) => unknown) | null
}

interface SpeechRecognitionConstructor {
  prototype: SpeechRecognition
  new (): SpeechRecognition
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor | undefined
    webkitSpeechRecognition: SpeechRecognitionConstructor | undefined
  }
}

export interface MicrophoneState {
  isRecording: boolean
  isTranscribing: boolean
  transcript: string
  error: string | null
  isSupported: boolean
}

interface UseMicrophoneInputReturn extends MicrophoneState {
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  clearTranscript: () => void
  clearError: () => void
}

/** Maximum recording duration before auto-stop (ms) */
const RECORDING_TIMEOUT_MS = 60_000

export function useMicrophoneInput(): UseMicrophoneInputReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Check if browser supports Web Speech API
  const isSupported =
    typeof window !== 'undefined' &&
    (typeof window.webkitSpeechRecognition !== 'undefined' || typeof window.SpeechRecognition !== 'undefined')

  const clearError = useCallback(() => setError(null), [])
  const clearTranscript = useCallback(() => setTranscript(''), [])

  const stopRecordingInternal = useCallback(async () => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current)
      recordingTimeoutRef.current = null
    }

    // Abort recognition and clear handlers to prevent stale callbacks
    if (recognitionRef.current) {
      recognitionRef.current.onstart = null
      recognitionRef.current.onresult = null
      recognitionRef.current.onerror = null
      recognitionRef.current.onend = null
      try { recognitionRef.current.abort() } catch { /* already stopped */ }
      recognitionRef.current = null
    }

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop()
      }
      mediaStreamRef.current = null
    }

    setIsRecording(false)
    setIsTranscribing(false)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      clearError()
      clearTranscript()

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      // Initialize Web Speech API for transcription
      const SpeechRecognitionAPI = window.webkitSpeechRecognition || window.SpeechRecognition
      if (!SpeechRecognitionAPI) {
        throw new Error('Speech Recognition not supported in this browser')
      }

      const recognition = new SpeechRecognitionAPI()
      recognitionRef.current = recognition

      // Configure recognition
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onstart = () => {
        setIsRecording(true)
        setIsTranscribing(true)

        // Auto-stop after max duration
        recordingTimeoutRef.current = setTimeout(() => {
          stopRecordingInternal()
        }, RECORDING_TIMEOUT_MS)
      }

      recognition.onresult = (event: Event) => {
        const speechEvent = event as SpeechRecognitionEvent

        for (let i = speechEvent.resultIndex; i < speechEvent.results.length; i++) {
          const transcriptSegment = speechEvent.results[i][0].transcript

          if (speechEvent.results[i].isFinal) {
            setTranscript((prev) => prev + transcriptSegment + ' ')
          }
        }
      }

      recognition.onerror = (event: Event) => {
        const errorEvent = event as SpeechRecognitionErrorEvent
        const errorMessage = getErrorMessage(errorEvent.error)
        setError(errorMessage)
        stopRecordingInternal()
      }

      recognition.onend = () => {
        setIsTranscribing(false)
        stopRecordingInternal()
      }

      recognition.start()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to access microphone'
      setError(errorMessage)
      setIsRecording(false)
    }
  }, [clearError, clearTranscript, stopRecordingInternal])

  const stopRecording = useCallback(async () => {
    try {
      await stopRecordingInternal()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop recording'
      setError(errorMessage)
    }
  }, [stopRecordingInternal])

  // Cleanup on unmount — abort any active recognition and release media stream
  useEffect(() => {
    return () => { stopRecordingInternal() }
  }, [stopRecordingInternal])

  return {
    isRecording,
    isTranscribing,
    transcript,
    error,
    isSupported,
    startRecording,
    stopRecording,
    clearTranscript,
    clearError,
  }
}

function getErrorMessage(error: string): string {
  const errorMap: Record<string, string> = {
    'no-speech': 'No speech detected. Please try again.',
    'audio-capture': 'No microphone found. Please check your device.',
    'network': 'Network error. Please check your connection.',
    'permission-denied': 'Microphone access was denied. Please enable it in settings.',
    'service-not-allowed': 'Speech recognition service not allowed.',
    'bad-grammar': 'Grammar error. Please try again.',
    'aborted': 'Recording was cancelled.',
  }

  return errorMap[error] || `Error: ${error}`
}
