/**
 * GPUTaintFilter — taint-aware GPU node filtering (taint-filter feature).
 *
 * The GPU Utilization and GPU Inventory cards both count GPU capacity from a
 * list of {@link GPUNode}s. If a node carries a `NoSchedule` / `NoExecute`
 * taint, those GPUs are *not actually available* to the current user unless
 * the user is willing/able to tolerate the taint. Previously both cards
 * silently counted tainted nodes as available, which led Mike Spreitzer to
 * see "11 GPUs available" when 8 of them were reserved for another user via
 * `dedicated=ofer:NoSchedule`.
 *
 * This module exposes:
 *   - {@link useGPUTaintFilter}, a stateful hook that owns the set of
 *     tolerated taints and returns a predicate for filtering GPU nodes.
 *   - {@link GPUTaintFilterControl}, a small dropdown control that matches the
 *     visual style of {@link CardClusterFilter} so cards can render it in
 *     their header row with the existing cluster/time-range controls.
 *
 * State is deliberately component-local — no localStorage, no context, no URL
 * sync. Mike's ask is for an interactive checkbox list per card, not a
 * persisted global preference. The default (nothing tolerated) intentionally
 * matches the "what's actually available to me right now" semantic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// Note: we deliberately avoid pruning stale tolerations in a `useEffect`
// hook — the `react-hooks/set-state-in-effect` lint rule forbids it. Instead
// we intersect the stored toleration set with the currently-distinct taints
// via `useMemo`, so stale entries are filtered on read without any setState.
import { createPortal } from 'react-dom'
import { Filter, ChevronDown } from 'lucide-react'
import type { GPUNode, GPUTaint } from '../../hooks/mcp/types'

/** Stable serialization of a taint for set/membership comparisons. */
export const TAINT_SEPARATOR = '='
export const TAINT_EFFECT_SEPARATOR = ':'
/** Node-level taint effects that actually gate scheduling. */
export const EFFECT_NO_SCHEDULE = 'NoSchedule'
export const EFFECT_NO_EXECUTE = 'NoExecute'
/** Minimum number of distinct taints required to show the filter at all. */
const MIN_TAINTS_FOR_FILTER = 1
/** Pixel offset between the trigger button and the portaled dropdown. */
const DROPDOWN_OFFSET_PX = 4
/** Minimum horizontal gutter when portaling the dropdown. */
const DROPDOWN_EDGE_GUTTER_PX = 8
/** Dropdown width in pixels — matches CardClusterFilter sizing. */
const DROPDOWN_WIDTH_PX = 224

/**
 * Build a stable string key for a taint. Two taints are considered the same
 * "kind" iff their (key, value, effect) triple matches.
 */
export function taintKey(t: GPUTaint): string {
  const value = t.value ?? ''
  return `${t.key}${TAINT_SEPARATOR}${value}${TAINT_EFFECT_SEPARATOR}${t.effect}`
}

/**
 * Compute the sorted, de-duplicated list of distinct taints across a set of
 * GPU nodes. Only taints that actually gate scheduling are returned.
 */
export function collectDistinctTaints(nodes: GPUNode[]): GPUTaint[] {
  const seen = new Map<string, GPUTaint>()
  for (const node of (nodes || [])) {
    for (const taint of (node.taints || [])) {
      if (taint.effect !== EFFECT_NO_SCHEDULE && taint.effect !== EFFECT_NO_EXECUTE) continue
      const key = taintKey(taint)
      if (!seen.has(key)) seen.set(key, taint)
    }
  }
  return Array.from(seen.values()).sort((a, b) => taintKey(a).localeCompare(taintKey(b)))
}

/**
 * Returns `true` iff every scheduling-gating taint on the node is in the
 * `tolerated` set. Nodes with no taints are always visible.
 */
export function nodeToleratesAll(node: GPUNode, tolerated: Set<string>): boolean {
  const taints = node.taints || []
  for (const t of taints) {
    if (t.effect !== EFFECT_NO_SCHEDULE && t.effect !== EFFECT_NO_EXECUTE) continue
    if (!tolerated.has(taintKey(t))) return false
  }
  return true
}

export interface UseGPUTaintFilterResult {
  /** All distinct scheduling-gating taints discovered across `nodes`. */
  distinctTaints: GPUTaint[]
  /** The set of currently-tolerated taint keys (see {@link taintKey}). */
  toleratedKeys: Set<string>
  /** Toggle tolerance for a single taint. */
  toggle: (t: GPUTaint) => void
  /** Clear all tolerations (revert to "show only untainted" view). */
  clear: () => void
  /** Filter predicate for GPU nodes. */
  isVisible: (node: GPUNode) => boolean
  /** Convenience: the input `nodes` array filtered through `isVisible`. */
  visibleNodes: GPUNode[]
  /** Number of GPUs hidden because of untolerated taints. */
  hiddenGPUCount: number
}

/**
 * Hook owning the tolerated-taint state for a single card. Component-local
 * state only — not persisted.
 */
export function useGPUTaintFilter(nodes: GPUNode[]): UseGPUTaintFilterResult {
  const distinctTaints = useMemo(() => collectDistinctTaints(nodes || []), [nodes])
  const [storedToleratedKeys, setStoredToleratedKeys] = useState<Set<string>>(() => new Set())

  // Effective toleration set = stored set intersected with currently-distinct
  // taints. This drops stale entries (e.g. a tainted node disappeared) on
  // read without the `react-hooks/set-state-in-effect` lint violation that
  // the obvious "useEffect + setState" implementation would produce.
  const toleratedKeys = useMemo(() => {
    if (storedToleratedKeys.size === 0) return storedToleratedKeys
    const validKeys = new Set(distinctTaints.map(taintKey))
    const next = new Set<string>()
    for (const key of storedToleratedKeys) {
      if (validKeys.has(key)) next.add(key)
    }
    return next.size === storedToleratedKeys.size ? storedToleratedKeys : next
  }, [distinctTaints, storedToleratedKeys])

  const toggle = useCallback((t: GPUTaint) => {
    const key = taintKey(t)
    setStoredToleratedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const clear = useCallback(() => setStoredToleratedKeys(new Set()), [])

  const isVisible = useCallback(
    (node: GPUNode) => nodeToleratesAll(node, toleratedKeys),
    [toleratedKeys],
  )

  const visibleNodes = useMemo(
    () => (nodes || []).filter(isVisible),
    [nodes, isVisible],
  )

  const hiddenGPUCount = useMemo(() => {
    let hidden = 0
    for (const node of (nodes || [])) {
      if (!isVisible(node)) hidden += node.gpuCount
    }
    return hidden
  }, [nodes, isVisible])

  return { distinctTaints, toleratedKeys, toggle, clear, isVisible, visibleNodes, hiddenGPUCount }
}

export interface GPUTaintFilterControlProps {
  distinctTaints: GPUTaint[]
  toleratedKeys: Set<string>
  onToggle: (t: GPUTaint) => void
  onClear: () => void
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  containerRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Dropdown control for selecting which GPU node taints the user is willing to
 * tolerate. Visual style mirrors {@link CardClusterFilter} so the two controls
 * can sit side-by-side in a card header without looking inconsistent.
 *
 * Renders nothing when fewer than {@link MIN_TAINTS_FOR_FILTER} distinct
 * taints exist — taint-aware filtering is meaningless in that case and would
 * just add visual noise.
 */
export function GPUTaintFilterControl({
  distinctTaints,
  toleratedKeys,
  onToggle,
  onClear,
  isOpen,
  setIsOpen,
  containerRef,
}: GPUTaintFilterControlProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + DROPDOWN_OFFSET_PX,
        left: Math.max(DROPDOWN_EDGE_GUTTER_PX, rect.right - DROPDOWN_WIDTH_PX),
      })
    } else {
      setDropdownPos(null)
    }
  }, [isOpen])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!isOpen) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      setIsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, setIsOpen, containerRef])

  if (distinctTaints.length < MIN_TAINTS_FOR_FILTER) return null

  const activeCount = toleratedKeys.size

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
          activeCount > 0
            ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
            : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
        }`}
        title="Tolerate scheduling taints on GPU nodes" // ai-quality-ignore — tooltip, not a card title
        aria-label="Tolerate GPU node taints" // ai-quality-ignore — a11y attribute, not displayed text
      >
        <Filter className="w-3 h-3" />
        <span className="hidden @sm:inline">Taints</span>
        {activeCount > 0 && <span className="font-mono">{activeCount}</span>}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && dropdownPos && createPortal(
        <div
          role="menu"
          aria-label="Tolerate GPU node taints" // ai-quality-ignore — a11y attribute, not displayed text
          className="fixed max-h-72 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-dropdown"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: DROPDOWN_WIDTH_PX }}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
            e.preventDefault()
            const items = e.currentTarget.querySelectorAll<HTMLElement>('button, label')
            const idx = Array.from(items).indexOf(document.activeElement?.closest('button, label') as HTMLElement)
            if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
            else items[Math.max(idx - 1, 0)]?.focus()
          }}
        >
          <div className="p-1">
            <div className="px-2 py-1.5 text-2xs text-muted-foreground uppercase tracking-wide">
              Tolerate taints
            </div>
            <button
              onClick={onClear}
              className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                activeCount === 0
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'hover:bg-secondary text-foreground'
              }`}
            >
              None (show only untainted)
            </button>
            {distinctTaints.map((taint) => {
              const key = taintKey(taint)
              const checked = toleratedKeys.has(key)
              const label = taint.value ? `${taint.key}=${taint.value}` : taint.key
              return (
                <label
                  key={key}
                  className="w-full px-2 py-1.5 text-xs rounded transition-colors flex items-center gap-2 hover:bg-secondary cursor-pointer"
                  title={`${label}:${taint.effect}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(taint)}
                    className="shrink-0 accent-amber-500"
                  />
                  <span className="flex-1 min-w-0 truncate text-foreground">{label}</span>
                  <span className="text-2xs text-muted-foreground shrink-0">{taint.effect}</span>
                </label>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
