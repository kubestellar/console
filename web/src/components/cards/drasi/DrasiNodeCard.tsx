/**
 * Node card components for the Drasi Reactive Graph.
 *
 * Exports: NodeCard, NodeControls, StatusDot, SourceIconEl, ReactionIconEl
 */
import React from 'react'
import { motion } from 'framer-motion'
import {
  Database, Globe, Radio,
  Maximize2, Pin, Square, Settings, Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SourceKind, ReactionKind } from './DrasiTypes'

// ---------------------------------------------------------------------------
// NodeControls
// ---------------------------------------------------------------------------

interface NodeControlsProps {
  isStopped: boolean
  isPinned?: boolean
  showPin?: boolean
  showGear?: boolean
  showDelete?: boolean
  onStop: () => void
  onPin?: () => void
  onExpand: () => void
  onConfigure?: () => void
  onDelete?: () => void
}

export function NodeControls({
  isStopped, isPinned = false, showPin = false, showGear = false, showDelete = false,
  onStop, onPin, onExpand, onConfigure, onDelete,
}: NodeControlsProps) {
  const { t } = useTranslation()
  const handle = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn?.()
  }
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <button
        type="button"
        onClick={handle(onStop)}
        className={`w-5 h-5 flex items-center justify-center rounded border transition-colors ${
          isStopped
            ? 'bg-slate-700/60 border-slate-500/50 text-muted-foreground'
            : 'bg-red-500/20 hover:bg-red-500/40 border-red-500/40 text-red-400'
        }`}
        aria-label={isStopped ? 'Start' : 'Stop'}
        title={isStopped ? 'Start' : 'Stop'}
      >
        <Square className="w-2.5 h-2.5" fill="currentColor" />
      </button>
      <button
        type="button"
        onClick={handle(onExpand)}
        className="w-5 h-5 flex items-center justify-center rounded bg-slate-700/40 hover:bg-cyan-500/30 border border-slate-600/40 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-300 transition-colors"
        aria-label="Expand"
        title="Expand details"
      >
        <Maximize2 className="w-2.5 h-2.5" />
      </button>
      {showPin && (
        <button
          type="button"
          onClick={handle(onPin)}
          className={`w-5 h-5 flex items-center justify-center rounded border transition-colors ${
            isPinned
              ? 'bg-amber-500/30 border-amber-500/60 text-amber-300'
              : 'bg-slate-700/40 hover:bg-slate-700/60 border-slate-600/40 text-slate-400'
          }`}
          aria-label={isPinned ? 'Unpin' : 'Pin'}
          title={isPinned ? 'Unpin' : 'Pin'}
        >
          <Pin className="w-2.5 h-2.5" fill={isPinned ? 'currentColor' : 'none'} />
        </button>
      )}
      {showGear && (
        <button
          type="button"
          onClick={handle(onConfigure)}
          className="w-5 h-5 flex items-center justify-center rounded bg-slate-700/40 hover:bg-cyan-500/30 border border-slate-600/40 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-300 transition-colors"
          aria-label="Configure"
          title="Configure"
        >
          <Settings className="w-2.5 h-2.5" />
        </button>
      )}
      {showDelete && (
        <button
          type="button"
          onClick={handle(onDelete)}
          className="w-5 h-5 flex items-center justify-center rounded bg-slate-700/40 hover:bg-red-500/40 border border-slate-600/40 hover:border-red-500/60 text-slate-400 hover:text-red-300 transition-colors"
          aria-label={t('actions.delete')}
          title={t('actions.delete')}
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatusDot
// ---------------------------------------------------------------------------

export function StatusDot({ status, isStopped }: { status: 'ready' | 'error' | 'pending'; isStopped: boolean }) {
  const color = isStopped
    ? 'bg-slate-500'
    : status === 'ready' ? 'bg-green-400' : status === 'error' ? 'bg-red-400' : 'bg-yellow-400'
  return (
    <motion.div
      className={`w-2 h-2 rounded-full ${color}`}
      animate={!isStopped && status === 'ready' ? { scale: [1, 1.3, 1] } : {}}
      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
    />
  )
}

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

export function SourceIconEl({ kind }: { kind: SourceKind }) {
  if (kind === 'HTTP') return <Globe className="w-3.5 h-3.5 text-emerald-400" />
  return <Database className="w-3.5 h-3.5 text-emerald-400" />
}

export function ReactionIconEl({ kind }: { kind: ReactionKind }) {
  // All reaction kinds currently use the Radio icon; the kind prop is retained
  // for future differentiation without a breaking interface change.
  void kind
  return <Radio className="w-3.5 h-3.5 text-emerald-400" />
}

// ---------------------------------------------------------------------------
// NodeCard
// ---------------------------------------------------------------------------

interface NodeCardProps {
  nodeRef: (el: HTMLDivElement | null) => void
  title: string
  subtitle: string
  icon: React.ReactNode
  status: 'ready' | 'error' | 'pending'
  accentColor: 'emerald' | 'cyan'
  isSelected?: boolean
  isStopped: boolean
  isPinned?: boolean
  showPin?: boolean
  showGear?: boolean
  showDelete?: boolean
  /** When true, the card is faded because another node is being hovered. */
  isDimmed?: boolean
  onClick?: () => void
  onStop: () => void
  onPin?: () => void
  onExpand: () => void
  onConfigure?: () => void
  onDelete?: () => void
  onHoverEnter?: () => void
  onHoverLeave?: () => void
  children?: React.ReactNode
}

export function NodeCard({
  nodeRef, title, subtitle, icon, status, accentColor,
  isSelected, isStopped, isPinned, showPin, showGear, showDelete, isDimmed,
  onClick, onStop, onPin, onExpand, onConfigure, onDelete, onHoverEnter, onHoverLeave, children,
}: NodeCardProps) {
  const borderClass = isSelected
    ? accentColor === 'cyan' ? 'border-cyan-400/70 ring-1 ring-cyan-400/30' : 'border-emerald-400/70 ring-1 ring-emerald-400/30'
    : accentColor === 'cyan' ? 'border-cyan-500/30' : 'border-emerald-500/30'
  // Dim wins over stopped — the user explicitly hovered a different node.
  const opacityClass = isDimmed ? 'opacity-25' : isStopped ? 'opacity-60' : ''
  return (
    <motion.div
      ref={nodeRef}
      className={`bg-slate-900/80 border rounded-lg p-2.5 transition-opacity ${borderClass} ${opacityClass} ${onClick ? 'cursor-pointer' : ''}`}
      whileHover={onClick ? { scale: 1.02 } : {}}
      onClick={onClick}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-white text-xs font-semibold truncate flex-1">{title}</span>
        <StatusDot status={status} isStopped={isStopped} />
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{subtitle}</div>
      <NodeControls
        isStopped={isStopped}
        isPinned={isPinned}
        showPin={showPin}
        showGear={showGear}
        showDelete={showDelete}
        onStop={onStop}
        onPin={onPin}
        onExpand={onExpand}
        onConfigure={onConfigure}
        onDelete={onDelete}
      />
      {children}
    </motion.div>
  )
}
