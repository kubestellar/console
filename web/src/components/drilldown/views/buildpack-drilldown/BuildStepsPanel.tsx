import { History, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../../lib/cn'
import { getBuildStatusLabel, getStatusStyle, mapConditionToBuildpackStatus, sortBuildsByNewest } from './helpers'
import type { KpackBuild, KpackCondition } from './types'

interface BuildStepsPanelProps {
  buildsLoading: boolean
  builds: KpackBuild[]
}

export function BuildStepsPanel({ buildsLoading, builds }: BuildStepsPanelProps) {
  const { t } = useTranslation()

  if (buildsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (builds.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>{t('drilldown.buildpack.noBuilds')}</p>
        <p className="text-xs mt-1">{t('drilldown.buildpack.connectAgentBuilds')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sortBuildsByNewest(builds).map((build, idx) => {
        const buildStatus = build.status?.conditions?.find((c: KpackCondition) => c.type === 'Succeeded')
        const mappedStatus = mapConditionToBuildpackStatus(buildStatus)
        const statusStyle = getStatusStyle(mappedStatus)

        return (
          <div
            key={build.metadata.name}
            className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-sm font-medium">
                {builds.length - idx}
              </div>
              <div>
                <div className="text-sm text-foreground font-mono">{build.metadata.name}</div>
                <div className="text-xs text-muted-foreground">{buildStatus?.reason || 'Build triggered'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn('px-2 py-0.5 rounded text-xs', statusStyle.bg, statusStyle.text)}>
                {getBuildStatusLabel(mappedStatus)}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(build.metadata.creationTimestamp).toLocaleDateString()}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
