import { useEffect, useRef, useState } from 'react'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'

/**
 * Tracks which copy button was last pressed so the caller can show a transient
 * checkmark, and clears the pending timer on unmount.
 */
export function useCopiedStep() {
  const [copiedStep, setCopiedStep] = useState<number | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const handleCopy = async (text: string, stepKey: number) => {
    await copyToClipboard(text)
    setCopiedStep(stepKey)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedStep(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  return { copiedStep, handleCopy }
}
