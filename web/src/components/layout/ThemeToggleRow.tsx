import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'

interface ThemeToggleRowProps {
  onClick: () => void
  label: string
}

export function ThemeToggleRow({ onClick, label }: ThemeToggleRowProps) {
  const { themeId, isDark } = useTheme()

  const ThemeIcon = themeId === 'system' ? Monitor : isDark ? Moon : Sun

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
    >
      <ThemeIcon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
      {label}
    </button>
  )
}
