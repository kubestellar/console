/**
 * Single row in the StackSelector dropdown list.
 */
import { useMemo, memo, useCallback } from 'react'
import { Server, Cpu } from 'lucide-react'
import type { LLMdStack } from '../../../hooks/useStackDiscovery'
import { STATUS_COLORS, estimateAccelerators } from './StackSelector.utils'

interface StackOptionProps {
  stack: LLMdStack
  isSelected: boolean
  onSelect: (stackId: string) => void
}

// Memoize StackOption to prevent re-renders when scrolling through large lists
export const StackOption = memo(function StackOption({ stack, isSelected, onSelect }: StackOptionProps) {
  const handleClick = useCallback(() => {
    onSelect(stack.id)
  }, [onSelect, stack.id])

  // Memoize expensive calculations to avoid recalculating on every scroll
  const { prefillCount, decodeCount, unifiedCount, gpuInfo } = useMemo(() => ({
    prefillCount: stack.components.prefill.reduce((sum, c) => sum + c.replicas, 0),
    decodeCount: stack.components.decode.reduce((sum, c) => sum + c.replicas, 0),
    unifiedCount: stack.components.both.reduce((sum, c) => sum + c.replicas, 0),
    gpuInfo: estimateAccelerators(stack) }), [stack])

  return (
    <button
      onClick={handleClick}
      className={`w-full px-3 py-2.5 text-left hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-0 ${
        isSelected ? 'bg-secondary/70' : ''
      }`}
    >
      {/* Row 1: Name and replica counts */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[stack.status]}`} />

          {/* Stack name */}
          <span className="text-sm font-medium text-white truncate max-w-[200px]">
            {stack.name}
          </span>
        </div>

        {/* Replica counts - show all non-zero counts */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          {prefillCount > 0 && (
            <span className="text-purple-400" title="Prefill replicas">
              P:{prefillCount}
            </span>
          )}
          {decodeCount > 0 && (
            <span className="text-green-400" title="Decode replicas">
              D:{decodeCount}
            </span>
          )}
          {unifiedCount > 0 && prefillCount === 0 && decodeCount === 0 && (
            <span title="Unified replicas">
              <Server className="w-3 h-3 inline mr-0.5" />
              {unifiedCount}
            </span>
          )}
          {prefillCount === 0 && decodeCount === 0 && unifiedCount === 0 && (
            <span className="text-muted-foreground italic" title="No running pods - scaled to 0">
              0 pods
            </span>
          )}
        </div>
      </div>

      {/* Row 2: Namespace and metadata */}
      <div className="flex items-center gap-2 text-2xs">
        {/* Namespace (primary context) */}
        <span className="px-1.5 py-0.5 rounded bg-secondary/80 text-foreground font-medium">
          ns:{stack.namespace}
        </span>

        {/* Cluster */}
        <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
          {stack.cluster}
        </span>

        {/* GPU count and type */}
        {gpuInfo.count > 0 && (
          <span
            className="flex items-center gap-1 text-cyan-400"
            title={`${gpuInfo.count}× ${gpuInfo.type}`}
          >
            <Cpu className="w-3 h-3" />
            <span>{gpuInfo.count}×</span>
            <span className="text-cyan-400/70 truncate max-w-[80px]">{gpuInfo.type.replace('NVIDIA ', '')}</span>
          </span>
        )}

        {/* Autoscaler indicator with value */}
        {stack.autoscaler && (
          <span
            className={`px-1 py-0.5 rounded font-medium ${
              stack.autoscaler.type === 'WVA' ? 'bg-purple-500/20 text-purple-400' :
              stack.autoscaler.type === 'HPA' ? 'bg-blue-500/20 text-blue-400' :
              'bg-green-500/20 text-green-400'
            }`}
            title={`${stack.autoscaler.type}: ${stack.autoscaler.name || 'enabled'}${
              stack.autoscaler.minReplicas !== undefined ? ` (min: ${stack.autoscaler.minReplicas}, max: ${stack.autoscaler.maxReplicas})` : ''
            }`}
          >
            {stack.autoscaler.type === 'VPA' ? 'VPA' : (
              `${stack.autoscaler.type}: ${stack.autoscaler.desiredReplicas ?? stack.autoscaler.currentReplicas ?? (
                stack.autoscaler.minReplicas !== undefined ? `${stack.autoscaler.minReplicas}-${stack.autoscaler.maxReplicas}` : '?'
              )}`
            )}
          </span>
        )}

        {/* Model name */}
        {stack.model && (
          <span className="text-muted-foreground truncate max-w-[120px] ml-auto" title={`model: ${stack.model}`}>
            {stack.model}
          </span>
        )}
      </div>
    </button>
  )
})
