import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import * as Icons from 'lucide-react'
import { Plus, Pencil, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SnoozedCards } from './SnoozedCards'
import { SidebarCustomizer } from './SidebarCustomizer'
import { useSidebarConfig, SidebarItem } from '../../hooks/useSidebarConfig'
import { useClusters } from '../../hooks/useMCP'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'

export function Sidebar() {
  const { config, toggleCollapsed } = useSidebarConfig()
  const { clusters } = useClusters()
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false)
  const dashboardContext = useDashboardContextOptional()

  const healthyClusters = clusters.filter((c) => c.healthy).length
  const unhealthyClusters = clusters.filter((c) => !c.healthy).length

  const renderIcon = (iconName: string, className?: string) => {
    const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName]
    return IconComponent ? <IconComponent className={className} /> : null
  }

  const renderNavItem = (item: SidebarItem) => (
    <NavLink
      key={item.id}
      to={item.href}
      className={({ isActive }) => cn(
        'flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-purple-500/20 text-purple-400'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
        config.collapsed ? 'justify-center p-3' : 'px-3 py-2'
      )}
      title={config.collapsed ? item.name : undefined}
    >
      {renderIcon(item.icon, config.collapsed ? 'w-6 h-6' : 'w-5 h-5')}
      {!config.collapsed && item.name}
    </NavLink>
  )

  return (
    <>
      <aside data-tour="sidebar" className={cn(
        'fixed left-0 top-16 bottom-0 glass border-r border-border/50 overflow-y-auto transition-all duration-300',
        config.collapsed ? 'w-20 p-3' : 'w-64 p-4'
      )}>
        {/* Collapse toggle */}
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-6 p-1 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground z-10"
        >
          {config.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Primary navigation */}
        <nav className="space-y-1">
          {config.primaryNav.map(renderNavItem)}
        </nav>

        {/* Divider */}
        <div className="my-6 border-t border-border/50" />

        {/* Secondary navigation */}
        <nav className="space-y-1">
          {config.secondaryNav.map(renderNavItem)}
        </nav>

        {/* Snoozed card swaps */}
        {!config.collapsed && <div data-tour="snoozed"><SnoozedCards /></div>}

        {/* Add card button */}
        {!config.collapsed && (
          <div className="mt-6">
            <button
              onClick={() => dashboardContext?.openAddCardModal()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-purple-500/50 hover:bg-purple-500/10 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Add Card</span>
            </button>
          </div>
        )}

        {/* Cluster status summary */}
        {config.showClusterStatus && !config.collapsed && (
          <div className="mt-6 p-4 rounded-lg bg-secondary/30">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Cluster Status
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  Healthy
                </span>
                <span className="text-sm font-medium text-green-400">{healthyClusters}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                  Warning
                </span>
                <span className="text-sm font-medium text-yellow-400">0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                  Critical
                </span>
                <span className="text-sm font-medium text-red-400">{unhealthyClusters}</span>
              </div>
            </div>
          </div>
        )}

        {/* Customize button */}
        <div className="mt-4">
          <button
            onClick={() => setIsCustomizerOpen(true)}
            className={cn(
              'flex items-center gap-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors',
              config.collapsed ? 'justify-center w-full p-3' : 'px-3 py-2 text-xs'
            )}
            title={config.collapsed ? 'Customize sidebar' : undefined}
          >
            <Pencil className={config.collapsed ? 'w-5 h-5' : 'w-3 h-3'} />
            {!config.collapsed && 'Customize'}
          </button>
        </div>
      </aside>

      {/* Sidebar Customizer Modal */}
      <SidebarCustomizer
        isOpen={isCustomizerOpen}
        onClose={() => setIsCustomizerOpen(false)}
      />
    </>
  )
}
