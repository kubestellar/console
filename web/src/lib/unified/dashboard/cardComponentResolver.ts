/**
 * Card component resolver injection point for DashboardGrid.
 *
 * DashboardGrid needs to resolve component-only cards (cards with no config
 * file) to their React component. Importing `getCardComponent` from
 * components/cards/cardRegistry directly created a circular dependency
 * (cardRegistry -> cardRegistry.compliance -> AirGapDashboard ->
 * UnifiedDashboard -> DashboardGrid -> cardRegistry). Instead, the card
 * registry registers its resolver here when it loads, and DashboardGrid
 * reads it through this dependency-free module.
 */
import { useSyncExternalStore } from 'react'
import type { CardComponent } from '../../../components/cards/cardRegistry.types'

export type CardComponentResolver = (cardType: string) => CardComponent | undefined

let resolver: CardComponentResolver | null = null
const listeners = new Set<() => void>()

export function registerCardComponentResolver(fn: CardComponentResolver): void {
  resolver = fn
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot(): CardComponentResolver | null {
  return resolver
}

/** Returns the registered resolver, re-rendering if it is registered later. */
export function useCardComponentResolver(): CardComponentResolver | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
