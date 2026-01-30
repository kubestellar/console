import React, { useState, useEffect, useMemo, useCallback, useRef, useReducer } from 'react'
import * as LucideIcons from 'lucide-react'
import { cn } from '../cn'
import { useCardData, commonComparators } from '../cards/cardHooks'
import { Skeleton } from '../../components/ui/Skeleton'
import { Pagination } from '../../components/ui/Pagination'

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
  }
}
