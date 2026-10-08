import { motion, AnimatePresence } from 'framer-motion'
import { Lightbulb, AlertTriangle, TrendingUp, Gauge, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AIInsight } from '../../../lib/llmd/mockData'

const INSIGHT_ICONS = {
  optimization: Lightbulb,
  anomaly: AlertTriangle,
  capacity: Gauge,
  performance: TrendingUp }

const SEVERITY_COLORS = {
  info: { bg: 'bg-blue-950', border: 'border-blue-500/30', text: 'text-blue-400', icon: 'text-blue-400' },
  warning: { bg: 'bg-yellow-950', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: 'text-yellow-400' },
  critical: { bg: 'bg-red-950', border: 'border-red-500/30', text: 'text-red-400', icon: 'text-red-400' } }

interface InsightCardProps {
  insight: AIInsight
  isExpanded: boolean
  onToggle: () => void
}

export function InsightCard({ insight, isExpanded, onToggle }: InsightCardProps) {
  const { t } = useTranslation(['cards', 'common'])
  const Icon = INSIGHT_ICONS[insight.type]
  const colors = SEVERITY_COLORS[insight.severity]

  return (
    <motion.div
      className={`${colors.bg} ${colors.border} border rounded-lg overflow-hidden cursor-pointer`}
      onClick={onToggle}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className={`p-1.5 rounded ${colors.bg}`}>
            <Icon size={14} className={colors.icon} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-y-2">
              <h3 className={`font-medium text-sm ${colors.text}`}>{insight.title}</h3>
              <motion.div
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight size={14} className="text-muted-foreground" />
              </motion.div>
            </div>

            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {insight.description}
            </p>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 pt-3 border-t border-border/50"
            >
              {/* Recommendation */}
              <div className="mb-3">
                <div className="text-xs font-medium text-white mb-1">{t('llmdAIInsights.recommendation')}</div>
                <p className="text-xs text-muted-foreground">{insight.recommendation}</p>
              </div>

              {/* Metrics */}
              {insight.metrics && (
                <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
                  {Object.entries(insight.metrics).map(([key, value]) => (
                    <div key={key} className="bg-secondary rounded p-2 text-center">
                      <div className="text-xs text-muted-foreground truncate">{key}</div>
                      <div className="text-sm font-mono text-white">{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <div className="mt-2 text-xs text-muted-foreground">
                {insight.timestamp.toLocaleTimeString()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
