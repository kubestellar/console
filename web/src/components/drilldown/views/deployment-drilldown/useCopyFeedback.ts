import { useCallback, useEffect, useRef, useState } from 'react'
import { copyToClipboard } from '../../../../lib/clipboard'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../../lib/constants/network'

export function useCopyFeedback() {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const copiedFieldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback((field: string, value: string) => {
    copyToClipboard(value)
    setCopiedField(field)
    if (copiedFieldTimeoutRef.current) {
      clearTimeout(copiedFieldTimeoutRef.current)
    }
    copiedFieldTimeoutRef.current = setTimeout(() => {
      setCopiedField(null)
      copiedFieldTimeoutRef.current = null
    }, UI_FEEDBACK_TIMEOUT_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (copiedFieldTimeoutRef.current) {
        clearTimeout(copiedFieldTimeoutRef.current)
      }
    }
  }, [])

  return { copiedField, handleCopy }
}
