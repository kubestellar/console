/**
 * CardPreview — renders a mini card visualization preview.
 *
 * Extracted from AddCardModal.tsx for reuse in the unified DashboardCustomizer.
 */
import { useTranslation } from 'react-i18next'
import type { HoveredCard } from './cardCatalog'

export function CardPreview({ card }: { card: HoveredCard }) {
  const { t } = useTranslation()
  const renderVisualization = () => {
    switch (card.visualization) {
      case 'gauge':
        return (
          <div className="flex items-center justify-center flex-1">
            <div className="relative w-14 h-14">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-purple-400" strokeDasharray="70 30" strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-2xs font-medium">70%</span>
            </div>
          </div>
        )
      case 'donut':
        return (
          <div className="flex items-center justify-center flex-1">
            <div className="relative w-12 h-12">
              <svg className="w-full h-full" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="12" fill="none" stroke="currentColor" strokeWidth="6" className="text-green-400" strokeDasharray="60 40" />
                <circle cx="18" cy="18" r="12" fill="none" stroke="currentColor" strokeWidth="6" className="text-yellow-400" strokeDasharray="25 75" strokeDashoffset="-60" />
                <circle cx="18" cy="18" r="12" fill="none" stroke="currentColor" strokeWidth="6" className="text-red-400" strokeDasharray="15 85" strokeDashoffset="-85" />
              </svg>
            </div>
            <div className="ml-2 space-y-0.5">
              <div className="flex items-center gap-1 text-[8px]">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-muted-foreground">{t('common.healthy')}</span>
              </div>
              <div className="flex items-center gap-1 text-[8px]">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                <span className="text-muted-foreground">{t('common.warning')}</span>
              </div>
              <div className="flex items-center gap-1 text-[8px]">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="text-muted-foreground">{t('common.critical')}</span>
              </div>
            </div>
          </div>
        )
      case 'bar':
        return (
          <div className="flex-1 px-2 flex items-end justify-center gap-1 pb-2">
            <div className="w-3 bg-purple-400 rounded-t" style={{ height: '60%' }} />
            <div className="w-3 bg-purple-400 rounded-t" style={{ height: '45%' }} />
            <div className="w-3 bg-purple-400 rounded-t" style={{ height: '80%' }} />
            <div className="w-3 bg-purple-400 rounded-t" style={{ height: '55%' }} />
            <div className="w-3 bg-purple-400 rounded-t" style={{ height: '70%' }} />
            <div className="w-3 bg-purple-400 rounded-t" style={{ height: '40%' }} />
          </div>
        )
      case 'timeseries':
      case 'sparkline':
        return (
          <div className="flex-1 px-2 pb-2">
            <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
              <path
                d="M0,30 L10,25 L20,28 L30,15 L40,20 L50,10 L60,18 L70,12 L80,8 L90,15 L100,5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-purple-400"
              />
              <path
                d="M0,30 L10,25 L20,28 L30,15 L40,20 L50,10 L60,18 L70,12 L80,8 L90,15 L100,5 L100,40 L0,40 Z"
                fill="currentColor"
                className="text-purple-400/60"
              />
            </svg>
          </div>
        )
      case 'table':
        return (
          <div className="flex-1 p-2 space-y-1">
            <div className="flex gap-1 pb-1 border-b border-border/50">
              <div className="h-1.5 w-1/4 bg-muted-foreground/30 rounded" />
              <div className="h-1.5 w-1/4 bg-muted-foreground/30 rounded" />
              <div className="h-1.5 w-1/4 bg-muted-foreground/30 rounded" />
              <div className="h-1.5 w-1/4 bg-muted-foreground/30 rounded" />
            </div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-1">
                <div className="h-1.5 w-1/4 bg-purple-400/20 rounded" />
                <div className="h-1.5 w-1/4 bg-secondary rounded" />
                <div className="h-1.5 w-1/4 bg-secondary rounded" />
                <div className={`h-1.5 w-1/4 rounded ${i === 1 ? 'bg-yellow-400/40' : i === 3 ? 'bg-red-400/40' : 'bg-green-400/40'}`} />
              </div>
            ))}
          </div>
        )
      case 'events':
        return (
          <div className="flex-1 p-2 space-y-1.5 overflow-hidden">
            {[
              { color: 'bg-blue-400', time: '2m ago' },
              { color: 'bg-yellow-400', time: '5m ago' },
              { color: 'bg-green-400', time: '8m ago' },
              { color: 'bg-red-400', time: '12m ago' },
            ].map((event, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${event.color} shrink-0`} />
                <div className="h-1.5 flex-1 bg-secondary rounded" />
                <span className="text-[7px] text-muted-foreground/60">{event.time}</span>
              </div>
            ))}
          </div>
        )
      case 'status':
      default:
        return (
          <div className="flex-1 p-2">
            <div className="grid grid-cols-3 gap-1">
              {['gke-prod', 'eks-dev', 'aks-stg', 'kind-local', 'k3s-edge', 'gke-dr'].map((name, i) => (
                <div key={i} className={`rounded p-1 ${i === 3 ? 'bg-yellow-500/30' : i === 5 ? 'bg-red-500/30' : 'bg-green-500/30'}`}>
                  <div className="text-[6px] text-foreground/80 truncate">{name}</div>
                </div>
              ))}
            </div>
          </div>
        )
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden h-32 flex flex-col">
      <div className="px-2 py-1.5 border-b border-border/50 bg-secondary/30 flex items-center justify-between">
        <span className="text-[9px] font-medium text-foreground truncate">{card.title}</span>
        <div className="flex gap-0.5">
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
        </div>
      </div>
      {renderVisualization()}
    </div>
  )
}
