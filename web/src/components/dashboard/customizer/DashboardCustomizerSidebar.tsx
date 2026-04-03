/**
 * DashboardCustomizerSidebar — left navigation for the unified customizer.
 *
 * Pattern: Notion/Linear settings sidebar with grouped sections and
 * a global search input at the top (VS Code Settings pattern).
 */
import { useTranslation } from 'react-i18next'
import { Search, Undo2, Redo2, RotateCcw } from 'lucide-react'
import { CUSTOMIZER_NAV, type CustomizerSection } from './customizerNav'
import { cn } from '../../../lib/cn'

interface DashboardCustomizerSidebarProps {
  activeSection: CustomizerSection
  onSectionChange: (section: CustomizerSection) => void
  globalSearch: string
  onGlobalSearchChange: (value: string) => void
  /** Undo/redo callbacks — hidden when not available */
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  /** Reset callback */
  onReset?: () => void
  isCustomized?: boolean
}

export function DashboardCustomizerSidebar({
  activeSection,
  onSectionChange,
  globalSearch,
  onGlobalSearchChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onReset,
  isCustomized = false,
}: DashboardCustomizerSidebarProps) {
  const { t: _t } = useTranslation()
  const t = _t as (key: string, defaultValue?: string) => string

  return (
    <div className="w-56 border-r border-border flex flex-col h-full bg-secondary/20">
      {/* Global search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => onGlobalSearchChange(e.target.value)}
            placeholder={t('dashboard.studio.search', 'Search cards, dashboards, templates...')}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
        </div>
      </div>

      {/* Navigation groups */}
      <nav className="flex-1 overflow-y-auto py-2">
        {CUSTOMIZER_NAV.map((group) => (
          <div key={group.labelKey} className="mb-3">
            <div className="px-3 py-1 text-2xs font-medium text-muted-foreground uppercase tracking-wider">
              {t(group.labelKey)}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onSectionChange(item.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-purple-500/15 text-purple-400 font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{t(item.labelKey)}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer: Undo/Redo/Reset */}
      <div className="border-t border-border p-2 flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={t('dashboard.undo', 'Undo')}
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={t('dashboard.redo', 'Redo')}
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
        {isCustomized && onReset && (
          <button
            onClick={onReset}
            className="ml-auto p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={t('dashboard.resetToDefaults', 'Reset to defaults')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
