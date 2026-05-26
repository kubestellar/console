/**
 * OrbitMonitorOffer — post-completion inline offer to set up ongoing monitoring.
 *
 * Shown in MissionChat after non-install, non-orbit missions complete.
 * Opens StandaloneOrbitDialog pre-populated with the mission's cluster and
 * a default set of workload resource kinds.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Satellite, X } from 'lucide-react'
import { DEFAULT_MONITOR_KINDS } from '../../lib/constants/k8sResources'
import type { OrbitResourceFilter } from '../../lib/missions/types'
import type { Mission } from '../../hooks/useMissions'

interface OrbitMonitorOfferProps {
  mission: Mission
  onOpenOrbitDialog: (prefill: {
    clusters?: string[]
    resourceFilters?: Record<string, OrbitResourceFilter[]>
  }) => void
}

export function OrbitMonitorOffer({ mission, onOpenOrbitDialog }: OrbitMonitorOfferProps) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const handleSetupMonitor = () => {
    const clusters = mission.cluster ? [mission.cluster] : []
    const resourceFilters: Record<string, OrbitResourceFilter[]> = {}
    if (mission.cluster) {
      resourceFilters[mission.cluster] = DEFAULT_MONITOR_KINDS.map(k => ({ ...k }))
    }
    onOpenOrbitDialog({ clusters, resourceFilters })
  }

  return (
    <div className="mx-4 my-2 rounded-lg border border-purple-500/25 bg-purple-500/5 px-3 py-2.5 flex items-center gap-3">
      <Satellite className="w-4 h-4 text-purple-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground">{t('dialogs.orbitMonitor.title')}</p>
        <p className="text-[10px] text-muted-foreground">{t('dialogs.orbitMonitor.description')}</p>
      </div>
      <button
        onClick={handleSetupMonitor}
        className="shrink-0 text-xs font-medium text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded px-2 py-1 transition-colors hover:bg-purple-500/10"
      >
        {t('dialogs.orbitMonitor.setupMonitor')}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 p-0.5 text-muted-foreground/50 hover:text-muted-foreground rounded transition-colors"
        aria-label={t('actions.dismiss')}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
