/**
 * Shared color utilities for llm-d card components.
 *
 * Provides load-percentage → color mappings used by LLMdFlow, EPPRouting,
 * and horseshoe gauge nodes.
 */

// ── Threshold constants ─────────────────────────────────────────────────
const LOAD_CRITICAL_PCT = 90
const LOAD_HIGH_PCT = 70
const LOAD_MEDIUM_PCT = 50

// ── Color palette ───────────────────────────────────────────────────────
const LOAD_CRITICAL = { start: '#ef4444', end: '#f87171', glow: '#ef4444' }
const LOAD_HIGH = { start: '#f59e0b', end: '#fbbf24', glow: '#f59e0b' }
const LOAD_MEDIUM = { start: '#eab308', end: '#facc15', glow: '#eab308' }
const LOAD_LOW = { start: '#22c55e', end: '#4ade80', glow: '#22c55e' }

export interface LoadColorSet {
  start: string
  end: string
  glow: string
}

export function getLoadColors(load: number): LoadColorSet {
  if (load >= LOAD_CRITICAL_PCT) return LOAD_CRITICAL
  if (load >= LOAD_HIGH_PCT) return LOAD_HIGH
  if (load >= LOAD_MEDIUM_PCT) return LOAD_MEDIUM
  return LOAD_LOW
}

export function getHorseshoeColor(pct: number): string {
  if (pct >= LOAD_CRITICAL_PCT) return '#ef4444'
  if (pct >= LOAD_HIGH_PCT) return '#f59e0b'
  if (pct >= LOAD_MEDIUM_PCT) return '#eab308'
  return '#22c55e'
}
