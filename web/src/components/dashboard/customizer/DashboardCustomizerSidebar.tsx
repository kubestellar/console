/**
 * DashboardCustomizerSidebar — left navigation for Console Studio.
 * Clean flat nav with no search (only 5 items) and no footer controls.
 */
import { CUSTOMIZER_NAV, type CustomizerSection } from './customizerNav'
import { cn } from '../../../lib/cn'

interface DashboardCustomizerSidebarProps {
  activeSection: CustomizerSection
  onSectionChange: (section: CustomizerSection) => void
}

export function DashboardCustomizerSidebar({
  activeSection,
  onSectionChange,
}: DashboardCustomizerSidebarProps) {
  return (
    <div data-testid="studio-sidebar" className="w-56 border-r border-border flex flex-col h-full bg-secondary/20">
      <nav className="flex-1 py-2">
        {CUSTOMIZER_NAV.map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id
          return (
            <div key={item.id}>
            {item.dividerBefore && <div className="mx-3 my-2 border-t border-border/40" />}
            <button
              onClick={() => onSectionChange(item.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-purple-500/15 text-purple-400 font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
