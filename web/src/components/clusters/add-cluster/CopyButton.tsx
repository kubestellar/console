import { useState, useCallback, useRef, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { copyToClipboard } from '../../../lib/clipboard'

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const handleCopy = useCallback(() => {
    copyToClipboard(text)
    setCopied(true)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT_MS)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}
