import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface InstructionStepCardProps {
  title: ReactNode
  icon: ReactNode
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}

export function InstructionStepCard({ title, icon, isOpen, onToggle, children }: InstructionStepCardProps) {
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
        {icon}
        {title}
      </button>
      {isOpen && children}
    </div>
  )
}
