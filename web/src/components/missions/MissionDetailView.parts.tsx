import { useState, useEffect, useRef } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { MissionStep } from '../../lib/missions/types'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'

// Extract code blocks from markdown-style description
export function extractCodeBlocks(text: string): { before: string; code: string; after: string }[] {
  const parts: { before: string; code: string; after: string }[] = []
  const regex = /```[\w]*\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).trim()
    const code = match[1].trim()
    lastIndex = match.index + match[0].length
    parts.push({ before, code, after: '' })
  }

  // Remaining text after last code block
  const remaining = text.slice(lastIndex).trim()
  if (parts.length === 0) {
    return [{ before: text, code: '', after: '' }]
  }
  if (remaining) {
    parts[parts.length - 1].after = remaining
  }

  return parts
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) clearTimeout(copiedTimeoutRef.current)
    }
  }, [])

  const handleCopy = () => {
    copyToClipboard(text).then(() => {
      setCopied(true)
      if (copiedTimeoutRef.current !== null) clearTimeout(copiedTimeoutRef.current)
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT_MS)
    }).catch(() => { /* clipboard access may be denied in non-HTTPS contexts */ })
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

export function StepCard({ step, index, accentColor }: { step: MissionStep; index: number; accentColor: string }) {
  const blocks = extractCodeBlocks(step.description)

  return (
    <div className="flex gap-3 p-4 rounded-lg bg-secondary/50 border border-border">
      <span
        className={cn(
          'shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold',
          accentColor
        )}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold text-foreground">{step.title}</p>
        {blocks.map((block, bi) => (
          <div key={bi}>
            {block.before && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{block.before}</p>
            )}
            {block.code && (
              <div className="relative mt-2 mb-2">
                <pre className="max-w-[85vw] p-3 rounded-lg bg-background text-xs text-foreground font-mono border border-border overflow-x-auto whitespace-pre-wrap">
                  {block.code}
                </pre>
                <CopyButton text={block.code} />
              </div>
            )}
            {block.after && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{block.after}</p>
            )}
          </div>
        ))}
        {step.command && (
          <div className="relative mt-2">
            <pre className="max-w-[85vw] block p-2 rounded bg-background text-xs text-foreground font-mono border border-border whitespace-pre-wrap overflow-x-auto">
              {step.command}
            </pre>
            <CopyButton text={step.command} />
          </div>
        )}
        {step.yaml && (
          <div className="relative mt-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">YAML</span>
            </div>
            <pre className="max-w-[85vw] p-3 rounded-lg bg-background text-xs text-foreground font-mono border border-border overflow-x-auto whitespace-pre-wrap">
              {step.yaml}
            </pre>
            <CopyButton text={step.yaml} />
          </div>
        )}
      </div>
    </div>
  )
}

export function SectionBadge({ present, label }: { present: boolean; label: string }) {
  return (
    <span
      className={cn(
        'px-2 py-0.5 text-xs rounded-full border',
        present
          ? 'bg-green-500/10 text-green-400 border-green-500/20'
          : 'bg-muted/30 text-muted-foreground/50 border-border/50'
      )}
    >
      {present ? '✓' : '○'} {label}
    </span>
  )
}
