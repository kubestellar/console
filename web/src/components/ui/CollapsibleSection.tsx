import { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from './Button'
import { useModalState } from '../../lib/modals'

interface CollapsibleSectionProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  badge?: ReactNode
  className?: string
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  badge,
  className = '',
}: CollapsibleSectionProps) {
  const { isOpen, toggle } = useModalState(defaultOpen)

  return (
    <div className={className}>
      <Button
        variant="ghost"
        size="md"
        onClick={toggle}
        className="w-full justify-start px-2 py-2 font-medium text-foreground"
        fullWidth
        icon={isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        iconRight={badge ? <span className="ml-auto">{badge}</span> : undefined}
      >
        {title}
      </Button>
      {isOpen && (
        <div className="mt-2 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  )
}
