import React, { useState, useEffect, useMemo, useCallback, useRef, useReducer } from 'react'
// NOTE: Wildcard import is intentional for dynamic card scope
// All Lucide icons are spread into the sandbox scope, allowing dynamic cards
// to reference any icon by name (e.g., <CheckCircle />) without explicit imports.
// Tree-shaking is not applicable here as the entire icon library must be available
// for user-defined dynamic card code at runtime.
import * as LucideIcons from 'lucide-react'
import { cn } from '../cn'
import { useCardData, commonComparators } from '../cards/cardHooks'
import { Skeleton } from '../../components/ui/Skeleton'
import { Pagination } from '../../components/ui/Pagination'

/** Minimum allowed interval for setInterval in dynamic cards (ms) */
const MIN_INTERVAL_MS = 1_000

/** Safe setTimeout wrapper — delegates to the real window.setTimeout */
function safeSetTimeout(callback: TimerHandler, delay?: number, ...args: unknown[]): number {
  return window.setTimeout(callback, delay, ...args)
}

/** Safe clearTimeout wrapper */
function safeClearTimeout(id: number | undefined): void {
  window.clearTimeout(id)
}

/** Safe setInterval wrapper — enforces MIN_INTERVAL_MS minimum to prevent tight loops */
function safeSetInterval(callback: TimerHandler, delay?: number, ...args: unknown[]): number {
  const clamped = Math.max(delay ?? 0, MIN_INTERVAL_MS)
  return window.setInterval(callback, clamped, ...args)
}

/** Safe clearInterval wrapper */
function safeClearInterval(id: number | undefined): void {
  window.clearInterval(id)
}

/**
 * The sandboxed scope of libraries available to Tier 2 dynamic cards.
 *
 * Dynamic card code runs in a controlled environment with only these
 * libraries injected. No access to window, document, fetch, localStorage,
 * or other browser APIs directly.
 */
export function getDynamicScope(): Record<string, unknown> {
  return {
    // React core
    React,
    useState,
    useEffect,
    useMemo,
    useCallback,
    useRef,
    useReducer,

    // Icons (all of lucide-react)
    ...LucideIcons,

    // Utility
    cn,

    // Card hooks
    useCardData,
    commonComparators,

    // UI components
    Skeleton,
    Pagination,

    // Safe timer APIs (setInterval clamped to MIN_INTERVAL_MS minimum)
    setTimeout: safeSetTimeout,
    clearTimeout: safeClearTimeout,
    setInterval: safeSetInterval,
    clearInterval: safeClearInterval,
  }
}
