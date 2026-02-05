/**
 * Stack Selector Component
 *
 * Dropdown for selecting an llm-d stack to focus visualizations on.
 * Shows stack health, component counts, and cluster info.
 */
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Server, Layers, RefreshCw, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOptionalStack } from '../../../contexts/StackContext'
import type { LLMdStack } from '../../../hooks/useStackDiscovery'

const STATUS_COLORS = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  unhealthy: 'bg-red-500',
  unknown: 'bg-slate-500',
}

interface StackOptionProps {
  stack: LLMdStack
  isSelected: boolean
  onSelect: () => void
}

function StackOption({ stack, isSelected, onSelect }: StackOptionProps) {
  const prefillCount = stack.components.prefill.reduce((sum, c) => sum + c.replicas, 0)
  const decodeCount = stack.components.decode.reduce((sum, c) => sum + c.replicas, 0)
  const unifiedCount = stack.components.both.reduce((sum, c) => sum + c.replicas, 0)

  return (
    <button
      onClick={onSelect}
      className={`w-full px-3 py-2 text-left hover:bg-slate-700/50 transition-colors ${
        isSelected ? 'bg-slate-700/70' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[stack.status]}`} />

          {/* Stack name */}
          <span className="text-sm font-medium text-white truncate max-w-[150px]">
            {stack.name}
          </span>
        </div>

        {/* Replica counts */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {stack.hasDisaggregation ? (
            <>
              <span className="text-purple-400" title="Prefill replicas">
                P:{prefillCount}
              </span>
              <span className="text-green-400" title="Decode replicas">
                D:{decodeCount}
              </span>
            </>
          ) : unifiedCount > 0 ? (
            <span title="Unified replicas">
              <Server className="w-3 h-3 inline mr-0.5" />
              {unifiedCount}
            </span>
          ) : null}
        </div>
      </div>

      {/* Cluster badge */}
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
          {stack.cluster}
        </span>
        {stack.model && (
          <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
            {stack.model}
          </span>
        )}
      </div>
    </button>
  )
}

export function StackSelector() {
  const stackContext = useOptionalStack()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // If no context, show placeholder
  if (!stackContext) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/50 text-slate-500 text-sm">
        <Layers className="w-4 h-4" />
        <span>No stack data</span>
      </div>
    )
  }

  const { stacks, isLoading, selectedStack, selectedStackId, setSelectedStackId, refetch } = stackContext

  // Group stacks by cluster
  const stacksByCluster = stacks.reduce((acc, stack) => {
    if (!acc[stack.cluster]) {
      acc[stack.cluster] = []
    }
    acc[stack.cluster].push(stack)
    return acc
  }, {} as Record<string, LLMdStack[]>)

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-all ${
          isOpen
            ? 'bg-slate-700 border-slate-600'
            : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
        }`}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        ) : selectedStack ? (
          <>
            <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[selectedStack.status]}`} />
            <span className="text-sm font-medium text-white max-w-[140px] truncate">
              {selectedStack.name}
            </span>
            <span className="text-xs text-slate-500">@{selectedStack.cluster}</span>
          </>
        ) : (
          <>
            <Layers className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400">Select stack</span>
          </>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
              <span className="text-xs font-medium text-slate-400">
                LLM-d Stacks ({stacks.length})
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  refetch()
                }}
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                title="Refresh stacks"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Stack list */}
            <div className="max-h-80 overflow-y-auto">
              {Object.entries(stacksByCluster).map(([cluster, clusterStacks]) => (
                <div key={cluster}>
                  {/* Cluster header */}
                  <div className="px-3 py-1.5 bg-slate-900/50 border-b border-slate-700">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      {cluster}
                    </span>
                  </div>

                  {/* Stacks in cluster */}
                  {clusterStacks.map(stack => (
                    <StackOption
                      key={stack.id}
                      stack={stack}
                      isSelected={stack.id === selectedStackId}
                      onSelect={() => {
                        setSelectedStackId(stack.id)
                        setIsOpen(false)
                      }}
                    />
                  ))}
                </div>
              ))}

              {stacks.length === 0 && !isLoading && (
                <div className="px-3 py-4 text-center text-slate-500 text-sm">
                  No llm-d stacks found
                </div>
              )}
            </div>

            {/* Footer stats */}
            <div className="px-3 py-2 border-t border-slate-700 bg-slate-900/50 flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-slate-400">
                  {stacks.filter(s => s.status === 'healthy').length} healthy
                </span>
              </span>
              <span className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                <span className="text-slate-400">
                  {stacks.filter(s => s.hasDisaggregation).length} disaggregated
                </span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default StackSelector
