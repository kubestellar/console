import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react'

/**
 * A selectable command block with a copy button that flips to a checkmark
 * while `isCopied` is true.
 */
export function CopyableCommand({
  command,
  isCopied,
  onCopy,
  copyTitle,
  multiline = false,
}: {
  command: string
  isCopied: boolean
  onCopy: () => void
  copyTitle: string
  multiline?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      {multiline ? (
        <pre className="flex-1 rounded bg-muted px-3 py-1.5 font-mono text-foreground select-all overflow-x-auto whitespace-pre">
          {command}
        </pre>
      ) : (
        <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
          {command}
        </code>
      )}
      <button
        onClick={onCopy}
        className={`shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors${multiline ? ' self-start' : ''}`}
        title={copyTitle}
      >
        {isCopied ? (
          <Check className="w-3.5 h-3.5 text-green-400" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  )
}

/**
 * Disclosure row used for the optional dev / Kubernetes / security / OAuth guides.
 */
export function CollapsibleGuide({
  isOpen,
  onToggle,
  icon: Icon,
  label,
  children,
}: {
  isOpen: boolean
  onToggle: () => void
  icon: LucideIcon
  label: string
  children: ReactNode
}) {
  return (
    <div className="mt-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        <Icon className="w-3.5 h-3.5" />
        {label}
      </button>
      {isOpen && children}
    </div>
  )
}
