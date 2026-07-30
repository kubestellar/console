import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Mission, MissionActionBundle } from '../../../../../hooks/useMissions.types'
import { MAX_MESSAGE_SIZE_CHARS } from '../../../../../lib/constants'

interface UseMissionChatComposerParams {
  mission: Mission
  sendMessage: MissionActionBundle['sendMessage']
  editAndResend: MissionActionBundle['editAndResend']
}

/**
 * Owns the message composer: the input value, validation error, command history
 * navigation, and the handlers for sending, editing, dictation, and keyboard
 * shortcuts. Keeps all input-related hook state out of the container.
 */
export function useMissionChatComposer({ mission, sendMessage, editAndResend }: UseMissionChatComposerParams) {
  const { t } = useTranslation('common')
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const savedInputRef = useRef('')

  useEffect(() => {
    setInputError(null)
  }, [mission.id])

  useEffect(() => {
    if (mission.status === 'waiting_input') {
      inputRef.current?.focus()
    }
  }, [mission.status])

  const handleSend = useCallback(() => {
    if (!input.trim()) return

    if (input.length > MAX_MESSAGE_SIZE_CHARS) {
      setInputError(
        t('missionChat.messageTooLong', {
          current: input.length.toLocaleString(),
          max: MAX_MESSAGE_SIZE_CHARS.toLocaleString(),
          defaultValue: 'Message is too long ({{current}} characters). Maximum is {{max}} characters.',
        })
      )
      return
    }

    setCommandHistory((previous) => [...previous, input.trim()])
    setHistoryIndex(-1)
    savedInputRef.current = ''
    sendMessage(mission.id, input.trim())
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [input, mission.id, sendMessage, t])

  const handleMicrophoneTranscript = useCallback((text: string) => {
    setInput((previous) => previous ? `${previous} ${text}` : text)
    inputRef.current?.focus()
  }, [])

  const handleEditMessage = useCallback((messageId: string) => {
    const content = editAndResend(mission.id, messageId)
    if (content) {
      setInput(content)
      setInputError(null)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [editAndResend, mission.id])

  const handleKeyDown = useCallback((event: ReactKeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
      return
    }

    if (event.key === 'ArrowUp' && commandHistory.length > 0) {
      event.preventDefault()
      if (historyIndex === -1) {
        savedInputRef.current = input
        setHistoryIndex(commandHistory.length - 1)
        setInput(commandHistory[commandHistory.length - 1])
      } else if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1)
        setInput(commandHistory[historyIndex - 1])
      }
      return
    }

    if (event.key === 'ArrowDown' && historyIndex !== -1) {
      event.preventDefault()
      if (historyIndex < commandHistory.length - 1) {
        setHistoryIndex(historyIndex + 1)
        setInput(commandHistory[historyIndex + 1])
      } else {
        setHistoryIndex(-1)
        setInput(savedInputRef.current)
      }
    }
  }, [commandHistory, handleSend, historyIndex, input])

  const handleInputChange = useCallback((value: string) => {
    setInput(value)
    setInputError(null)
  }, [])

  return {
    input,
    inputError,
    inputRef,
    handleSend,
    handleKeyDown,
    handleInputChange,
    handleMicrophoneTranscript,
    handleEditMessage,
  }
}
