// Command history state for the Kubectl card, persisted to localStorage.
// Extracted from Kubectl.tsx (issue #24058) — behavior unchanged.
import { useState, useEffect } from 'react'
import { STORAGE_KEY_KUBECTL_HISTORY } from '../../lib/constants'
import type { CommandHistoryItem } from './Kubectl.types'

/** Maximum number of history entries persisted to localStorage. */
const MAX_PERSISTED_HISTORY = 100

export function useKubectlCommandHistory() {
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>([])

  // Load command history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_KUBECTL_HISTORY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setCommandHistory(parsed.map((item: CommandHistoryItem) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        })))
      } catch {
        // Ignore parse errors
      }
    }
  }, [])

  // Save command history to localStorage
  useEffect(() => {
    if (commandHistory.length > 0) {
      localStorage.setItem(STORAGE_KEY_KUBECTL_HISTORY, JSON.stringify(commandHistory.slice(-MAX_PERSISTED_HISTORY)))
    }
  }, [commandHistory])

  return { commandHistory, setCommandHistory }
}
