import type { ReactNode } from 'react'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'

/**
 * Sanitized external link row shared by the request item sub-components.
 */
export function ExternalLinkRow({
  href,
  colorClass,
  compact = false,
  children,
}: {
  href: string
  colorClass: string
  compact?: boolean
  children: ReactNode
}) {
  return (
    <a
      href={sanitizeUrl(href)}
      target="_blank"
      rel="noopener noreferrer"
      className={`${compact ? 'text-xs text-muted-foreground hover:text-foreground' : 'text-xs flex items-center gap-1 mt-1.5'} ${colorClass} flex items-center gap-1`}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  )
}
