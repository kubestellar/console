import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, ReactNode } from 'react'
import { emitDrillDownOpened, emitDrillDownClosed } from '../lib/analytics'
import type { DrillDownView, DrillDownState, DrillDownContextType } from './useDrillDown.types'
import {
  canUseBrowserHistory,
  getCurrentBrowserHistoryState,
  getDrillDownHistoryEntryId,
  DRILLDOWN_HISTORY_STATE_KEY,
  MAX_DRILLDOWN_HISTORY_ENTRIES,
  BrowserHistoryState,
} from './useDrillDown.history'

export { DrillDownContextType }

export const DrillDownContext = createContext<DrillDownContextType | null>(null)

export const CLOSED_DRILLDOWN_STATE: DrillDownState = {
  isOpen: false,
  stack: [],
  currentView: null,
}

// Helper to generate a unique key for a view to detect duplicates
export function getViewKey(view: DrillDownView): string {
  const { type, data } = view
  switch (type) {
    case 'cluster':
      return `cluster:${data.cluster}`
    case 'namespace':
      return `namespace:${data.cluster}:${data.namespace}`
    case 'deployment':
      return `deployment:${data.cluster}:${data.namespace}:${data.deployment}`
    case 'replicaset':
      return `replicaset:${data.cluster}:${data.namespace}:${data.replicaset}`
    case 'pod':
      return `pod:${data.cluster}:${data.namespace}:${data.pod}`
    case 'configmap':
      return `configmap:${data.cluster}:${data.namespace}:${data.configmap}`
    case 'secret':
      return `secret:${data.cluster}:${data.namespace}:${data.secret}`
    case 'serviceaccount':
      return `serviceaccount:${data.cluster}:${data.namespace}:${data.serviceaccount}`
    case 'pvc':
      return `pvc:${data.cluster}:${data.namespace}:${data.pvc}`
    case 'job':
      return `job:${data.cluster}:${data.namespace}:${data.job}`
    case 'hpa':
      return `hpa:${data.cluster}:${data.namespace}:${data.hpa}`
    case 'service':
      return `service:${data.cluster}:${data.namespace}:${data.service}`
    case 'node':
    case 'gpu-node':
      return `node:${data.cluster}:${data.node}`
    case 'gpu-namespace':
      return `gpu-namespace:${data.namespace}`
    case 'logs':
      return `logs:${data.cluster}:${data.namespace}:${data.pod}:${data.container || ''}`
    case 'events':
      return `events:${data.cluster}:${data.namespace || ''}:${data.objectName || ''}`
    // Phase 2: GitOps and operational views
    case 'helm':
      return `helm:${data.cluster}:${data.namespace}:${data.release}`
    case 'argoapp':
      return `argoapp:${data.cluster}:${data.namespace}:${data.app}`
    case 'kustomization':
      return `kustomization:${data.cluster}:${data.namespace}:${data.name}`
    case 'buildpack':
      return `buildpack:${data.cluster}:${data.namespace}:${data.name}`
    case 'drift':
      return `drift:${data.cluster}`
    // Phase 2: Policy and compliance views
    case 'policy':
      return `policy:${data.cluster}:${data.namespace || ''}:${data.policy}`
    case 'compliance':
      return `compliance:${data.filterStatus || 'all'}`
    case 'crd':
      return `crd:${data.cluster}:${data.crd}`
    // Phase 2: Alerting and monitoring views
    case 'alert':
      return `alert:${data.cluster}:${data.namespace || ''}:${data.alert}`
    case 'alertrule':
      return `alertrule:${data.cluster}:${data.namespace}:${data.ruleName}`
    // Phase 2: Cost and RBAC views
    case 'cost':
      return `cost:${data.cluster}`
    case 'rbac':
      return `rbac:${data.cluster}:${data.namespace || ''}:${data.subject}`
    // Phase 2: Operator views
    case 'operator':
      return `operator:${data.cluster}:${data.namespace}:${data.operator}`
    // Multi-cluster summary views
    case 'all-clusters':
      return `all-clusters:${data.filter || 'all'}`
    case 'all-namespaces':
      return `all-namespaces:${data.filter || 'all'}`
    case 'all-deployments':
      return `all-deployments:${data.filter || 'all'}`
    case 'all-pods':
      return `all-pods:${data.filter || 'all'}`
    case 'all-services':
      return `all-services:${data.filter || 'all'}`
    case 'all-nodes':
      return `all-nodes:${data.filter || 'all'}`
    case 'all-events':
      return `all-events:${data.filter || 'all'}`
    case 'all-alerts':
      return `all-alerts:${data.filter || 'all'}`
    case 'all-helm':
      return `all-helm:${data.filter || 'all'}`
    case 'all-operators':
      return `all-operators:${data.filter || 'all'}`
    case 'all-security':
      return `all-security:${data.filter || 'all'}`
    case 'all-gpu':
      return `all-gpu:${data.filter || 'all'}`
    case 'all-storage':
      return `all-storage:${data.filter || 'all'}`
    case 'all-jobs':
      return `all-jobs:${data.filter || 'all'}`
    default:
      return `${type}:${JSON.stringify(data)}`
  }
}

export function DrillDownProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DrillDownState>(CLOSED_DRILLDOWN_STATE)
  const stateRef = useRef<DrillDownState>(CLOSED_DRILLDOWN_STATE)
  const historyEntriesRef = useRef(new Map<number, DrillDownState>())
  const nextHistoryEntryIdRef = useRef(1)

  const applyState = useCallback((nextState: DrillDownState) => {
    stateRef.current = nextState
    setState(nextState)
  }, [])

  const persistHistoryEntry = useCallback((nextState: DrillDownState, mode: 'push' | 'replace') => {
    if (!canUseBrowserHistory()) return

    const entryId = nextHistoryEntryIdRef.current
    nextHistoryEntryIdRef.current += 1
    historyEntriesRef.current.set(entryId, nextState)

    while (historyEntriesRef.current.size > MAX_DRILLDOWN_HISTORY_ENTRIES) {
      const oldestEntryId = historyEntriesRef.current.keys().next().value
      if (typeof oldestEntryId !== 'number') break
      historyEntriesRef.current.delete(oldestEntryId)
    }

    const nextHistoryState: BrowserHistoryState = {
      ...getCurrentBrowserHistoryState(),
      [DRILLDOWN_HISTORY_STATE_KEY]: entryId,
    }
    const nextUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`

    if (mode === 'push') {
      window.history.pushState(nextHistoryState, '', nextUrl)
      return
    }

    window.history.replaceState(nextHistoryState, '', nextUrl)
  }, [])

  const navigateHistory = useCallback((delta: number) => {
    if (!canUseBrowserHistory() || delta === 0) return false
    if (getDrillDownHistoryEntryId(window.history.state) === null) return false
    window.history.go(delta)
    return true
  }, [])

  const open = useCallback((view: DrillDownView) => {
    const nextState = {
      isOpen: true,
      stack: [view],
      currentView: view,
    }
    applyState(nextState)
    emitDrillDownOpened(view.type)
    persistHistoryEntry(nextState, 'push')
  }, [applyState, persistHistoryEntry])

  const push = useCallback((view: DrillDownView) => {
    const prev = stateRef.current
    const wasOpen = prev.isOpen
    const nextState = wasOpen
      ? {
          ...prev,
          stack: [...prev.stack, view],
          currentView: view,
        }
      : {
          isOpen: true,
          stack: [view],
          currentView: view,
        }
    applyState(nextState)
    if (!wasOpen) {
      emitDrillDownOpened(view.type)
    }
    persistHistoryEntry(nextState, 'push')
  }, [applyState, persistHistoryEntry])

  const pop = useCallback(() => {
    const prev = stateRef.current
    if (prev.stack.length === 0) return

    if (prev.stack.length === 1) {
      if (prev.currentView) {
        emitDrillDownClosed(prev.currentView.type, prev.stack.length)
      }
      applyState(CLOSED_DRILLDOWN_STATE)
      navigateHistory(-1)
      return
    }

    const newStack = prev.stack.slice(0, -1)
    const nextState = {
      ...prev,
      stack: newStack,
      currentView: newStack[newStack.length - 1],
    }
    applyState(nextState)
    navigateHistory(-1)
  }, [applyState, navigateHistory])

  const goTo = useCallback((index: number) => {
    const prev = stateRef.current
    if (index < 0 || index >= prev.stack.length) return

    const newStack = prev.stack.slice(0, index + 1)
    const nextState = {
      ...prev,
      stack: newStack,
      currentView: newStack[newStack.length - 1],
    }
    applyState(nextState)
    navigateHistory(index + 1 - prev.stack.length)
  }, [applyState, navigateHistory])

  const close = useCallback(() => {
    const prev = stateRef.current
    if (!prev.isOpen) return

    if (prev.currentView) {
      emitDrillDownClosed(prev.currentView.type, prev.stack.length)
    }
    applyState(CLOSED_DRILLDOWN_STATE)
    navigateHistory(-prev.stack.length)
  }, [applyState, navigateHistory])

  const replace = useCallback((view: DrillDownView) => {
    const prev = stateRef.current
    const newStack = prev.stack.length > 0 ? [...prev.stack.slice(0, -1), view] : [view]
    const nextState = {
      ...prev,
      isOpen: newStack.length > 0,
      stack: newStack,
      currentView: view,
    }
    applyState(nextState)
    if (nextState.isOpen) {
      persistHistoryEntry(nextState, 'replace')
    }
  }, [applyState, persistHistoryEntry])

  // Open-or-push that reads state via a ref to guarantee freshness even when
  // the calling component hasn't re-rendered yet.
  const openOrPushFn = useCallback((view: DrillDownView) => {
    const prev = stateRef.current
    if (!prev.isOpen) {
      open(view)
      return
    }

    const viewKey = getViewKey(view)
    const existingIndex = prev.stack.findIndex(v => getViewKey(v) === viewKey)

    if (existingIndex >= 0) {
      goTo(existingIndex)
      return
    }

    push(view)
  }, [goTo, open, push])

  useEffect(() => {
    if (!canUseBrowserHistory()) return undefined

    const handlePopState = (event: PopStateEvent) => {
      const previousState = stateRef.current
      const entryId = getDrillDownHistoryEntryId(event.state)
      const nextState = entryId !== null ? historyEntriesRef.current.get(entryId) ?? null : null

      if (nextState) {
        applyState(nextState)
        if (!previousState.isOpen && nextState.currentView) {
          emitDrillDownOpened(nextState.currentView.type)
        }
        return
      }

      if (previousState.isOpen && previousState.currentView) {
        emitDrillDownClosed(previousState.currentView.type, previousState.stack.length)
      }
      applyState(CLOSED_DRILLDOWN_STATE)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [applyState])

  // #6149 — Memoize the provider value so consumers don't re-render every
  // time DrillDownProvider itself re-renders for an unrelated reason.
  const contextValue = useMemo(
    () => ({ state, open, push, pop, goTo, close, replace, openOrPush: openOrPushFn }),
    [state, open, push, pop, goTo, close, replace, openOrPushFn]
  )

  return (
    <DrillDownContext.Provider value={contextValue}>
      {children}
    </DrillDownContext.Provider>
  )
}

export function useDrillDown() {
  const context = useContext(DrillDownContext)
  if (!context) {
    throw new Error('useDrillDown must be used within a DrillDownProvider')
  }
  return context
}
