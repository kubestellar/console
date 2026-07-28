import type { ReactNode } from 'react'
import { VerificationStatus } from './VerificationStatus'

interface CopyableCommandProps {
  command: string
  onCopy: () => void
  copied: boolean
  title: string
  preformatted?: boolean
  className?: string
  rightSlot?: ReactNode
}

export function CopyableCommand({
  command,
  onCopy,
  copied,
  title,
  preformatted = false,
  className,
  rightSlot,
}: CopyableCommandProps) {
  const Block = preformatted ? 'pre' : 'code'

  return (
    <div className={className || 'flex items-center gap-2'}>
      <Block className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto whitespace-pre">
        {command}
      </Block>
      {rightSlot}
      <button
        onClick={onCopy}
        className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title={title}
      >
        <VerificationStatus copied={copied} />
      </button>
    </div>
  )
}
