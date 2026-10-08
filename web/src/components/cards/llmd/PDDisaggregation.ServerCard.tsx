// Per-server stats tile for the PDDisaggregation card.
// Extracted from PDDisaggregation.tsx (issue #24058) — markup unchanged.
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Acronym } from './shared/PortalTooltip'
import type { ServerStats } from './PDDisaggregation.data'

interface ServerCardProps {
  server: ServerStats
  isHighlighted?: boolean
}

export function ServerCard({ server, isHighlighted }: ServerCardProps) {
  const { t } = useTranslation(['cards', 'common'])
  const isPrefill = server.type === 'prefill'
  const color = isPrefill ? '#9333ea' : '#22c55e'
  const bgColor = isPrefill ? 'bg-purple-500/10' : 'bg-green-500/10'
  const borderColor = isPrefill ? 'border-purple-500/30' : 'border-green-500/30'

  return (
    <motion.div
      className={`${bgColor} ${borderColor} border rounded-lg p-3 ${
        isHighlighted ? 'ring-2 ring-white/30' : ''
      }`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
        <span className="font-medium text-foreground text-sm">{server.name}</span>
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: server.load > 70 ? 'var(--color-warning)' : color }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">{t('llmd.load')}</span>
          <div className="flex items-center gap-1 mt-0.5">
            <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: server.load > 70 ? 'var(--color-warning)' : color }}
                initial={{ width: 0 }}
                animate={{ width: `${server.load}%` }}
              />
            </div>
            <span className="text-foreground font-mono w-8">{server.load}%</span>
          </div>
        </div>

        <div>
          <span className="text-muted-foreground">{t('llmd.queue')}</span>
          <div className="text-foreground font-mono mt-0.5">{server.queueDepth}</div>
        </div>

        <div>
          <span className="text-muted-foreground">{t('llmd.throughput')}</span>
          <div className="text-foreground font-mono mt-0.5">{server.throughput} {t('llmd.rps').toLowerCase()}</div>
        </div>

        <div>
          <span className="text-muted-foreground">{isPrefill ? <Acronym term="TTFT" /> : <Acronym term="TPOT" />}</span>
          <div className="text-foreground font-mono mt-0.5">{server.latencyMs}ms</div>
        </div>
      </div>

      {/* GPU memory bar */}
      <div className="mt-2">
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-muted-foreground"><Acronym term="GPU" /> Mem</span>
          <span className="text-foreground font-mono">{server.gpuMemory}%</span>
        </div>
        <div className="h-1 bg-border rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundColor: server.gpuMemory > 85 ? 'var(--color-error)' : server.gpuMemory > 70 ? 'var(--color-warning)' : 'var(--color-success)' }}
            animate={{ width: `${server.gpuMemory}%` }}
          />
        </div>
      </div>
    </motion.div>
  )
}
