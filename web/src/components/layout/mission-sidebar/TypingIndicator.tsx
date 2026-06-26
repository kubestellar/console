import { useState, useEffect } from 'react'
import { THINKING_MESSAGES } from './types'

// Animated typing indicator with 3 bouncing dots and optional rotating message
export function TypingIndicator({ showMessage = false }: { showMessage?: boolean }) {
  const [messageIndex, setMessageIndex] = useState(0)

  // Rotate through messages every 2 seconds
  useEffect(() => {
    if (!showMessage) return
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % THINKING_MESSAGES.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [showMessage])

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
      </div>
      {showMessage && (
        <span className="text-xs text-muted-foreground animate-pulse">
          {THINKING_MESSAGES[messageIndex]}
        </span>
      )}
    </div>
  )
}
