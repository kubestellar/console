/**
 * Lightweight code block component
 * Replaces react-syntax-highlighter to reduce bundle size (saves ~612KB)
 */
import { useState, useEffect, useRef } from 'react'
import { Copy, Check, AlertCircle } from 'lucide-react'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { Button } from './Button'
import { copyToClipboard } from '../../lib/clipboard'

interface CodeBlockProps {
  children: string
  language?: string
  fontSize?: 'sm' | 'base' | 'lg'
}

type CopyStatus = 'idle' | 'copied' | 'failed'

export function CodeBlock({ children, language = 'text', fontSize = 'sm' }: CodeBlockProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const timeoutRef = useRef<number>()

  const handleCopy = async () => {
    // Clear any pending timeout to avoid race conditions
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    const ok = await copyToClipboard(children)
    if (ok) {
      setCopyStatus('copied')
      timeoutRef.current = window.setTimeout(() => setCopyStatus('idle'), UI_FEEDBACK_TIMEOUT_MS)
    } else {
      setCopyStatus('failed')
      timeoutRef.current = window.setTimeout(() => setCopyStatus('idle'), UI_FEEDBACK_TIMEOUT_MS)
    }
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="relative group">
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          className="p-1.5"
          title={copyStatus === 'copied' ? 'Copied!' : copyStatus === 'failed' ? 'Copy failed' : 'Copy code'}
          icon={copyStatus === 'copied' ? (
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : copyStatus === 'failed' ? (
            <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
          ) : (
            <Copy className="w-4 h-4 text-muted-foreground" />
          )}
        />
      </div>
      <pre
        className={`bg-secondary border border-border rounded-md p-4 overflow-x-auto ${
          fontSize === 'lg'
            ? 'text-sm'
            : fontSize === 'base'
            ? 'text-xs'
            : 'text-[11px]'
        }`}
      >
        <code className={`language-${language} text-foreground/80 font-mono`}>
          {children}
        </code>
      </pre>
    </div>
  )
}
