import { Zap, CircleDot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Acronym } from '../shared/PortalTooltip'
import { StatusBadge } from '../../../ui/StatusBadge'
import type { CSSProperties } from 'react'
import type { LLMdStack } from '../../../../hooks/useStackDiscovery'
import type { RoutingSummaryMetrics, ViewMode } from './useEPPRoutingData'

const EPPROUTING_DIV_STYLE_1: CSSProperties = { boxShadow: '0 0 6px #9333ea' }
const EPPROUTING_DIV_STYLE_2: CSSProperties = { boxShadow: '0 0 6px #22c55e' }

interface EPPRoutingConfigProps {
  isDemoMode: boolean
  metrics: RoutingSummaryMetrics
  onToggleParticles: () => void
  onToggleViewMode: () => void
  selectedStack: LLMdStack | null
  showParticles: boolean
  viewMode: ViewMode
}

export function EPPRoutingConfig({
  isDemoMode,
  metrics,
  onToggleParticles,
  onToggleViewMode,
  selectedStack,
  showParticles,
  viewMode,
}: EPPRoutingConfigProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-yellow-500/20">
            <Zap size={14} className="text-yellow-400" />
          </div>
          <span className="font-medium text-white text-sm"><Acronym term="EPP" /> Routing</span>
        </div>

        <div className="flex items-center gap-2">
          {selectedStack && (
            <div className="flex items-center gap-1 text-xs">
              <span
                className={`px-1.5 py-0.5 rounded font-medium truncate max-w-[180px] ${
                  isDemoMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
                }`}
                title={selectedStack.name}
              >
                {selectedStack.name}
              </span>
              {isDemoMode && (
                <StatusBadge color="yellow" size="xs">{t('common:common.demo')}</StatusBadge>
              )}
            </div>
          )}

          <button
            onClick={onToggleViewMode}
            className={`px-2 py-1 text-xs rounded font-medium transition-all flex items-center gap-1 ${
              viewMode === 'horseshoe'
                ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                : 'bg-secondary/50 text-muted-foreground'
            }`}
            title={t('llmd.toggleHorseshoe')}
          >
            <CircleDot size={12} />
          </button>
          <button
            onClick={onToggleParticles}
            className={`px-3 py-1 text-xs rounded font-medium transition-all ${
              showParticles
                ? 'bg-yellow-500/20 text-yellow-400 shadow-lg shadow-yellow-500/20'
                : 'bg-secondary/50 text-muted-foreground'
            }`}
          >
            {showParticles ? t('common:common.pause') : t('common:common.play')}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{t('common:common.total')}:</span>
          <span className="text-white font-mono">{metrics.totalRps} <Acronym term="RPS" /></span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-purple-500" style={EPPROUTING_DIV_STYLE_1} />
          <span className="text-purple-400 font-mono">{metrics.prefillPercent}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" style={EPPROUTING_DIV_STYLE_2} />
          <span className="text-green-400 font-mono">{metrics.decodePercent}%</span>
        </div>
      </div>
    </>
  )
}
