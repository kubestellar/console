/**
 * Lightweight code block component
 * Replaces react-syntax-highlighter to reduce bundle size (saves ~612KB)
 */
import { useState, useEffect, useRef } from 'react'
import { Copy, Check, AlertCircle } from 'lucide-react'

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
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      setCopyFailed(true)
      timeoutRef.current = setTimeout(() => setCopyFailed(false), 2000)
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
          className="p-1.5 rounded bg-gray-200/80 dark:bg-gray-800/80 hover:bg-gray-300/80 dark:hover:bg-gray-700/80 transition-colors"
          title={copied ? 'Copied!' : copyFailed ? 'Copy failed' : 'Copy code'}
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : copyFailed ? (
            <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
          ) : (
            <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          )}
        </button>
      </div>
      <pre className={`bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md p-4 overflow-x-auto ${fontSize === 'lg' ? 'text-sm' : fontSize === 'base' ? 'text-xs' : 'text-[11px]'}`}>
        <code className={`language-${language} text-gray-800 dark:text-gray-300 font-mono`}>
          {children}
        </code>
      </pre>
    </div>
  )
}
