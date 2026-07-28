import { Box, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { HelmResourcesPanelProps } from './types'

export function HelmResourcesPanel({ resourcesLoading, parsedResources, onResourceClick }: HelmResourcesPanelProps) {
  const { t } = useTranslation()

  if (resourcesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (parsedResources.length > 0) {
    return (
      <div className="space-y-2">
        {parsedResources.map((resource, i) => (
          <div
            key={`${resource.kind}-${resource.name}-${i}`}
            className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
            onClick={() => onResourceClick(resource)}
          >
            <div className="flex items-center gap-3">
              <Box className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{resource.name}</span>
            </div>
            <span className="text-xs text-muted-foreground">{resource.kind}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="text-center py-12 text-muted-foreground">
      <Box className="w-12 h-12 mx-auto mb-3 opacity-50" />
      <p>{t('drilldown.helm.noResources')}</p>
      <p className="text-xs mt-1">{t('drilldown.helm.connectManifest')}</p>
    </div>
  )
}
