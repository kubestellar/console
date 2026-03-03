/**
 * Lightweight code block component
 * Replaces react-syntax-highlighter to reduce bundle size (saves ~612KB)
 */
import { useState, useEffect, useRef } from 'react'
import { Copy, Check, AlertCircle } from 'lucide-react'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'

interface CodeBlockProps {
  children: string
  language?: string
  fontSize?: 'sm' | 'base' | 'lg'
}

export function CodeBlock({ children, language = 'text', fontSize = 'sm' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const timeoutRef = useRef<number>()

  const handleCopy = async () => {
    // Clear any pending timeout to avoid race conditions
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      setCopyFailed(false)
      timeoutRef.current = setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT_MS)
    } catch (err) {
      console.error('Failed to copy:', err)
      setCopyFailed(true)
      timeoutRef.current = setTimeout(() => setCopyFailed(false), UI_FEEDBACK_TIMEOUT_MS)
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
        <button
          onClick={handleCopy}
          className="p-1.5 rounded bg-secondary/80 hover:bg-secondary/60 text-secondary-foreground transition-colors"
          title={copied ? 'Copied!' : copyFailed ? 'Copy failed' : 'Copy code'}
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : copyFailed ? (
            <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
          ) : (
            <Copy className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
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
