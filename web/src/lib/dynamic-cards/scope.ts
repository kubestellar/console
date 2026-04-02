import React, { useState, useEffect, useMemo, useCallback, useRef, useReducer } from 'react'
import { Loader2 } from 'lucide-react'
import { iconRegistry } from '../icons'
import { cn } from '../cn'
import { useCardData, commonComparators } from '../cards/cardHooks'
import { createCardFetchScope } from './useCardFetch'
import { Skeleton } from '../../components/ui/Skeleton'
import { Pagination } from '../../components/ui/Pagination'

/**
 * A simple spinner component available to dynamic card code as `<Spinner />`.
 * Wraps the Loader2 lucide icon with sensible defaults.
 */
function Spinner({ className }: { className?: string }) {
  return React.createElement(Loader2, { className: cn('w-5 h-5 animate-spin text-muted-foreground', className) })
}

/**
 * A centering wrapper for a spinner, available as `<SpinWrapper />`.
 * Renders children (or a default Spinner) centered in the card.
 */
function SpinWrapper({ children, className }: { children?: React.ReactNode; className?: string }) {
  return React.createElement(
    'div',
    { className: cn('h-full flex items-center justify-center', className) },
    children ?? React.createElement(Spinner, null),
  )
}

/** Minimum allowed interval for setInterval in dynamic cards (ms) */
const MIN_INTERVAL_MS = 1_000

/** Maximum concurrent timers a single card sandbox scope can hold */
const MAX_ACTIVE_TIMERS = 20

/** Validate delay is a finite number, defaulting to 0 if NaN/undefined */
function sanitizeDelay(delay: unknown): number {
  const n = Number(delay)
  return Number.isFinite(n) ? n : 0
}

/**
 * Creates a sandboxed timer API set with:
 * - String callback rejection (prevents eval-like code execution)
 * - NaN delay protection (sanitized to 0)
 * - setInterval clamped to MIN_INTERVAL_MS minimum
 * - Per-scope timer tracking with MAX_ACTIVE_TIMERS cap
 * - clearAll() for bulk cleanup on card unmount
 */
export function createTimerScope() {
  const activeTimers = new Set<number>()

  function trackTimer(id: number): number {
    activeTimers.add(id)
    return id
  }

  function safeSetTimeout(callback: unknown, delay?: unknown, ...args: unknown[]): number {
    if (typeof callback !== 'function') {
      throw new TypeError('setTimeout callback must be a function (string callbacks are blocked)')
    }
    if (activeTimers.size >= MAX_ACTIVE_TIMERS) {
      throw new Error(`Timer limit exceeded (max ${MAX_ACTIVE_TIMERS} concurrent timers per card)`)
    }
    const id = window.setTimeout((...a: unknown[]) => {
      activeTimers.delete(id)
      ;(callback as (...a: unknown[]) => void)(...a)
    }, sanitizeDelay(delay), ...args)
    return trackTimer(id)
  }

  function safeClearTimeout(id: number | undefined): void {
    if (id != null) activeTimers.delete(id)
    window.clearTimeout(id)
  }

  function safeSetInterval(callback: unknown, delay?: unknown, ...args: unknown[]): number {
    if (typeof callback !== 'function') {
      throw new TypeError('setInterval callback must be a function (string callbacks are blocked)')
    }
    if (activeTimers.size >= MAX_ACTIVE_TIMERS) {
      throw new Error(`Timer limit exceeded (max ${MAX_ACTIVE_TIMERS} concurrent timers per card)`)
    }
    const clamped = Math.max(sanitizeDelay(delay), MIN_INTERVAL_MS)
    const id = window.setInterval(callback as (...a: unknown[]) => void, clamped, ...args)
    return trackTimer(id)
  }

  function safeClearInterval(id: number | undefined): void {
    if (id != null) activeTimers.delete(id)
    window.clearInterval(id)
  }

  /** Clear all timers created by this scope (called on card unmount) */
  function clearAll(): void {
    for (const id of activeTimers) {
      window.clearTimeout(id)
      window.clearInterval(id)
    }
    activeTimers.clear()
  }

  return { safeSetTimeout, safeClearTimeout, safeSetInterval, safeClearInterval, clearAll }
}

/**
 * The sandboxed scope of libraries available to Tier 2 dynamic cards.
 *
 * Dynamic card code runs in a controlled environment with only these
 * libraries injected. No access to window, document, fetch, localStorage,
 * or other browser APIs directly.
 */
export function getDynamicScope(): Record<string, unknown> {
  const timers = createTimerScope()
  const fetches = createCardFetchScope()

  return {
    // React core
    React,
    useState,
    useEffect,
    useMemo,
    useCallback,
    useRef,
    useReducer,

    // Icons – spread from the centralized registry (tree-shakeable named imports)
    ...iconRegistry,

    // Utility
    cn,

    // Card hooks
    useCardData,
    commonComparators,

    // Data fetching — routes through /api/card-proxy to avoid CORS and keep
    // fetch/XMLHttpRequest blocked. Usage: useCardFetch('https://api.example.com/data')
    useCardFetch: fetches.useCardFetch,

    // UI components
    Skeleton,
    Pagination,

    // Convenience spinner components — commonly used in AI-generated card code.
    // Loader2 is already spread from LucideIcons above; these aliases ensure that
    // code referencing the generic names `Spinner` and `SpinWrapper` also works.
    Spinner,
    SpinWrapper,

    // Safe timer APIs — function-only callbacks, NaN-safe delays,
    // setInterval clamped to MIN_INTERVAL_MS, max MAX_ACTIVE_TIMERS per card.
    // These override the BLOCKED_GLOBALS entries via the `if (!(name in scope))` check.
    setTimeout: timers.safeSetTimeout,
    clearTimeout: timers.safeClearTimeout,
    setInterval: timers.safeSetInterval,
    clearInterval: timers.safeClearInterval,

    // Internal: used by CardWrapper to clean up leaked timers + fetch state on unmount
    __timerCleanup: () => {
      timers.clearAll()
      fetches.resetCount()
    },
  }
}
