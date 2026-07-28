import { Box, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../../lib/cn'
import { getHealthStatusStyle } from './helpers'
import type { ArgoResourcesTabProps } from './types'

export function ArgoResourcesTab({ resourcesLoading, appResources, onResourceClick }: ArgoResourcesTabProps) {
  const { t } = useTranslation()

  if (resourcesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (appResources && appResources.length > 0) {
    return (
      <div className="space-y-2">
        {appResources.map((resource, i) => {
          const resHealthStyle = getHealthStatusStyle(resource.health || 'Unknown')
          return (
            <div
              key={`${resource.kind}-${resource.name}-${i}`}
              onClick={() => onResourceClick(resource)}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Box className="w-4 h-4 text-muted-foreground" />
                <div>
                  <span className="text-sm font-medium text-foreground">{resource.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">({resource.namespace})</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{resource.kind}</span>
                {resource.health && (
                  <span className={cn('px-2 py-0.5 rounded text-xs', resHealthStyle.bg, resHealthStyle.text)}>
                    {resource.health}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="text-center py-12 text-muted-foreground">
      <Box className="w-12 h-12 mx-auto mb-3 opacity-50" />
      <p>{t('drilldown.argoApp.noResourcesFound')}</p>
    </div>
  )
}
