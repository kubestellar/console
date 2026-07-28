import { Settings } from 'lucide-react'

interface ThemeToggleRowProps {
  onClick: () => void
  label: string
}

export function ThemeToggleRow({ onClick, label }: ThemeToggleRowProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
    >
      <Settings className="w-4 h-4 text-muted-foreground" />
      {label}
    </button>
  )
}
