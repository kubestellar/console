import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

interface SimpleResourceRowProps {
  icon: ReactNode
  name: string
  /** Colored primary status text, e.g. service type or job status */
  primaryText?: ReactNode
  primaryClassName?: string
  /** Additional muted text shown after the primary text */
  secondaryText?: ReactNode
  onClick: () => void
}

/**
 * A single leaf row in the namespace resources tree view (used for
 * Services, Jobs, HPAs, ServiceAccounts, PVCs, ConfigMaps, Secrets).
 * Extracted from NamespaceResources.tsx (#21617) to remove seven
 * near-identical row blocks.
 */
export function SimpleResourceRow({ icon, name, primaryText, primaryClassName, secondaryText, onClick }: SimpleResourceRowProps) {
  return (
    <div
      className="flex items-center gap-2 min-h-11 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
      onClick={onClick}
    >
      {icon}
      <span className="text-foreground truncate max-w-[200px]" title={name}>{name}</span>
      {primaryText !== undefined && <span className={primaryClassName}>{primaryText}</span>}
      {secondaryText !== undefined && <span className="text-muted-foreground">{secondaryText}</span>}
      <ChevronRight className="w-3 h-3 text-primary ml-auto" />
    </div>
  )
}
