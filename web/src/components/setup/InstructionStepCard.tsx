import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'

interface InstructionStepCardProps {
  icon: ComponentType<{ className?: string }>
  label: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
  containerClassName?: string
}

export function InstructionStepCard({ icon: Icon, label, isOpen, onToggle, children, containerClassName }: InstructionStepCardProps) {
  return (
    <div className="mt-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
      >
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <Icon className="w-3.5 h-3.5" />
        {label}
      </button>
      {isOpen && (
        <div className={containerClassName || 'mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2'}>
          {children}
        </div>
      )}
    </div>
  )
}
