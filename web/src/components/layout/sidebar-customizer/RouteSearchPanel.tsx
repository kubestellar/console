import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search } from 'lucide-react'
import type { ReactNode } from 'react'

export interface KnownRoute {
  href: string
  name: string
  description: string
  icon: string
  category: string
}

interface RouteSearchPanelProps {
  availableRoutes: KnownRoute[]
  routeSearch: string
  onSearchChange: (value: string) => void
  onAdd: (route: KnownRoute) => void
  renderIcon: (iconName: string, className?: string) => ReactNode
}

export function RouteSearchPanel({
  availableRoutes,
  routeSearch,
  onSearchChange,
  onAdd,
  renderIcon,
}: RouteSearchPanelProps) {
  const { t } = useTranslation(['common', 'cards'])

  const memoizedAvailableRoutes = useMemo(() => availableRoutes, [availableRoutes])
  const matchingRoutes = useMemo(() => {
    const searchLower = routeSearch.toLowerCase()

    if (!searchLower) {
      return memoizedAvailableRoutes
    }

    return memoizedAvailableRoutes.filter((route) =>
      route.name.toLowerCase().includes(searchLower) ||
      route.description.toLowerCase().includes(searchLower)
    )
  }, [memoizedAvailableRoutes, routeSearch])

  return (
    <>
      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-2">
          {t('sidebar.customizer.searchHint')}
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={routeSearch}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('sidebar.customizer.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
          />
        </div>
      </div>

      {memoizedAvailableRoutes.length === 0 ? null : matchingRoutes.length === 0 ? (
        <div className="mb-4 text-sm text-muted-foreground text-center py-2">
          {t('sidebar.customizer.noMatchingDashboards')}
        </div>
      ) : (
        <div className="mb-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            {t('sidebar.customizer.availableToAdd')} ({matchingRoutes.length})
          </h3>
          <div className="space-y-1 max-h-64 overflow-y-auto rounded-lg border border-border">
            {matchingRoutes.map((route) => (
              <button
                key={route.href}
                onClick={() => onAdd(route)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50 transition-colors"
              >
                {renderIcon(route.icon, 'w-4 h-4 text-muted-foreground')}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">{route.name}</span>
                  <span className="text-xs text-muted-foreground/50 ml-1.5">{route.description}</span>
                </div>
                <Plus className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
