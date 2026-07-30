import type { ReactNode } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { StatusBadge, type BadgeColor } from '../../ui/StatusBadge'

interface ResourceTypeAccordionProps {
  /** e.g. 'services', 'jobs' — key used to track expand/collapse state */
  typeKey: string
  isExpanded: boolean
  onToggle: (typeKey: string) => void
  badgeColor: BadgeColor
  badgeIcon: ReactNode
  /** Short label shown inside the badge, e.g. "Svc", "Job" */
  label: ReactNode
  /** Text shown after the badge, e.g. "(3)" or "Standalone (2)" */
  countLabel: string
  disabled?: boolean
  children: ReactNode
}

/**
 * Generic collapsible section for a single resource type (Services, Jobs,
 * HPAs, ServiceAccounts, PVCs, ConfigMaps, Secrets, …) in the namespace
 * resources tree view. Extracted from NamespaceResources.tsx (#21617) to
 * remove eight near-identical accordion blocks.
 */
export function ResourceTypeAccordion({
  typeKey,
  isExpanded,
  onToggle,
  badgeColor,
  badgeIcon,
  label,
  countLabel,
  disabled,
  children,
}: ResourceTypeAccordionProps) {
  return (
    <div className="mb-1">
      <button
        onClick={() => onToggle(typeKey)}
        disabled={disabled}
        className="flex min-w-11 items-center gap-1.5 p-3 hover:bg-card/30 rounded w-full text-left min-h-11 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        <StatusBadge color={badgeColor} icon={badgeIcon}>{label}</StatusBadge>
        <span className="text-muted-foreground">{countLabel}</span>
      </button>
      {isExpanded && (
        <div className="ml-4 border-l border-border/30 pl-2">
          {children}
        </div>
      )}
    </div>
  )
}
