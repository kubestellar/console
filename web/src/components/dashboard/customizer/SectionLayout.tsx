/**
 * SectionLayout — shared layout wrapper for Console Studio sections.
 * Enforces consistent structure: description → content → optional footer.
 */
import { ReactNode } from 'react'

interface SectionLayoutProps {
  /** Description text shown at the top */
  description?: string
  /** Main scrollable content */
  children: ReactNode
  /** Optional sticky footer (e.g., "Add N cards" button) */
  footer?: ReactNode
}

export function SectionLayout({ description, children, footer }: SectionLayoutProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {description && (
          <p className="text-xs text-muted-foreground mb-3">{description}</p>
        )}
        {children}
      </div>
      {footer && (
        <div className="border-t border-border px-4 py-3 flex items-center justify-between">
          {footer}
        </div>
      )}
    </div>
  )
}
