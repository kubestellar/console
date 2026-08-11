/**
 * Tests for useDrillDown.actions — Phase 2 and multi-cluster summary actions.
 *
 * The base actions (drillToCluster, drillToNamespace, drillToPod, etc.) and
 * navigation helpers (goBack, canGoBack, closeDrillDown) are covered in
 * useDrillDown.test.tsx. This file covers:
 * - Phase 2: GitOps actions (drillToHelm, drillToArgoApp, drillToKustomization,
 *   drillToBuildpack, drillToDrift)
 * - Phase 2: Policy / compliance actions (drillToPolicy, drillToCompliance,
 *   drillToCRD) — including normalizeComplianceFilterStatus via drillToCompliance
 * - Phase 2: Alerting actions (drillToAlert, drillToAlertRule)
 * - Phase 2: Cost, RBAC, Operator actions (drillToCost, drillToRBAC, drillToOperator)
 * - Phase 1: Additional resource actions (drillToReplicaSet, drillToConfigMap,
 *   drillToSecret, drillToServiceAccount, drillToPVC, drillToJob, drillToHPA,
 *   drillToService)
 * - Multi-cluster summary actions (drillToAllNamespaces, drillToAllDeployments,
 *   drillToAllServices, drillToAllNodes, drillToAllEvents, drillToAllAlerts,
 *   drillToAllHelm, drillToAllOperators, drillToAllSecurity, drillToAllStorage,
 *   drillToAllJobs)
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitDrillDownOpened: vi.fn(),
  emitDrillDownClosed: vi.fn(),
}))

import { DrillDownProvider, useDrillDown, useDrillDownActions } from '../useDrillDown'

function wrapper({ children }: { children: ReactNode }) {
  return React.createElement(DrillDownProvider, null, children)
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.spyOn(window.history, 'go').mockImplementation(() => undefined)
  window.history.replaceState(null, '', window.location.pathname)
})

function useActionsAndDrill() {
  return {
    actions: useDrillDownActions(),
    drill: useDrillDown(),
  }
}

// ---------------------------------------------------------------------------
// Phase 2: GitOps actions
// ---------------------------------------------------------------------------

describe('Phase 2 GitOps actions', () => {
  it('drillToHelm opens a helm view with release data', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToHelm('cluster-1', 'default', 'my-chart', { version: '1.0' }) })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('helm')
    expect(view?.title).toBe('my-chart')
    expect(view?.data).toMatchObject({ cluster: 'cluster-1', namespace: 'default', release: 'my-chart', version: '1.0' })
  })

  it('drillToArgoApp opens an argo view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToArgoApp('cluster-1', 'argocd', 'my-app') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('argoapp')
    expect(view?.title).toBe('my-app')
    expect(view?.data).toMatchObject({ cluster: 'cluster-1', namespace: 'argocd', app: 'my-app' })
  })

  it('drillToKustomization opens a kustomization view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToKustomization('cluster-1', 'flux-system', 'my-kustomization') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('kustomization')
    expect(view?.title).toBe('my-kustomization')
  })

  it('drillToBuildpack opens a buildpack view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToBuildpack('cluster-1', 'default', 'my-build') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('buildpack')
    expect(view?.title).toBe('my-build')
  })

  it('drillToDrift opens a drift view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToDrift('cluster-1', { driftCount: 3 }) })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('drift')
    expect(view?.data).toMatchObject({ cluster: 'cluster-1', driftCount: 3 })
  })
})

// ---------------------------------------------------------------------------
// Phase 2: Policy / compliance actions
// ---------------------------------------------------------------------------

describe('Phase 2 Policy / compliance actions', () => {
  it('drillToPolicy opens a policy view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToPolicy('cluster-1', 'default', 'deny-root') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('policy')
    expect(view?.title).toBe('deny-root')
    expect(view?.data).toMatchObject({ cluster: 'cluster-1', namespace: 'default', policy: 'deny-root' })
  })

  it('drillToPolicy accepts undefined namespace', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToPolicy('cluster-1', undefined, 'global-policy') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('policy')
  })

  it('drillToCompliance opens a compliance view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToCompliance() })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('compliance')
  })

  it('drillToCompliance normalizes "passing" filter to "pass"', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToCompliance('passing') })
    const view = result.current.drill.state.currentView
    expect(view?.data).toMatchObject({ filterStatus: 'pass' })
  })

  it('drillToCompliance normalizes "failing" filter to "fail"', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToCompliance('failing') })
    const view = result.current.drill.state.currentView
    expect(view?.data).toMatchObject({ filterStatus: 'fail' })
  })

  it('drillToCompliance normalizes "warning" filter to "other"', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToCompliance('warning') })
    const view = result.current.drill.state.currentView
    expect(view?.data).toMatchObject({ filterStatus: 'other' })
  })

  it('drillToCompliance normalizes "skipped" filter to "other"', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToCompliance('skipped') })
    const view = result.current.drill.state.currentView
    expect(view?.data).toMatchObject({ filterStatus: 'other' })
  })

  it('drillToCompliance passes through unknown filter values unchanged', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToCompliance('custom-status') })
    const view = result.current.drill.state.currentView
    expect(view?.data).toMatchObject({ filterStatus: 'custom-status' })
  })

  it('drillToCRD opens a crd view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToCRD('cluster-1', 'my-crd.example.com') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('crd')
    expect(view?.title).toBe('my-crd.example.com')
    expect(view?.data).toMatchObject({ cluster: 'cluster-1', crd: 'my-crd.example.com' })
  })
})

// ---------------------------------------------------------------------------
// Phase 2: Alerting actions
// ---------------------------------------------------------------------------

describe('Phase 2 Alerting actions', () => {
  it('drillToAlert opens an alert view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAlert('cluster-1', 'monitoring', 'HighCPU') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('alert')
    expect(view?.title).toBe('HighCPU')
    expect(view?.data).toMatchObject({ cluster: 'cluster-1', namespace: 'monitoring', alert: 'HighCPU' })
  })

  it('drillToAlert accepts undefined namespace', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAlert('cluster-1', undefined, 'GlobalAlert') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('alert')
  })

  it('drillToAlertRule opens an alert-rule view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAlertRule('cluster-1', 'monitoring', 'cpu-rule') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('alertrule')
    expect(view?.title).toBe('cpu-rule')
  })
})

// ---------------------------------------------------------------------------
// Phase 2: Cost, RBAC, Operator actions
// ---------------------------------------------------------------------------

describe('Phase 2 Cost, RBAC, Operator actions', () => {
  it('drillToCost opens a cost view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToCost('cluster-1', { totalCost: 100 }) })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('cost')
    expect(view?.data).toMatchObject({ cluster: 'cluster-1', totalCost: 100 })
  })

  it('drillToRBAC opens an rbac view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToRBAC('cluster-1', 'default', 'alice') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('rbac')
    expect(view?.title).toBe('alice')
    expect(view?.data).toMatchObject({ cluster: 'cluster-1', namespace: 'default', subject: 'alice' })
  })

  it('drillToRBAC accepts undefined namespace', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToRBAC('cluster-1', undefined, 'bob') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('rbac')
    expect(view?.title).toBe('bob')
  })

  it('drillToOperator opens an operator view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToOperator('cluster-1', 'operators', 'cert-manager') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('operator')
    expect(view?.title).toBe('cert-manager')
  })
})

// ---------------------------------------------------------------------------
// Phase 1: Additional resource actions
// ---------------------------------------------------------------------------

describe('Phase 1 additional resource actions', () => {
  it('drillToReplicaSet opens a replicaset view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToReplicaSet('cluster-1', 'default', 'my-rs') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('replicaset')
    expect(view?.title).toBe('my-rs')
  })

  it('drillToConfigMap opens a configmap view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToConfigMap('cluster-1', 'default', 'my-cm') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('configmap')
    expect(view?.title).toBe('my-cm')
  })

  it('drillToSecret opens a secret view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToSecret('cluster-1', 'default', 'my-secret') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('secret')
    expect(view?.title).toBe('my-secret')
  })

  it('drillToServiceAccount opens a serviceaccount view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToServiceAccount('cluster-1', 'default', 'my-sa') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('serviceaccount')
    expect(view?.title).toBe('my-sa')
  })

  it('drillToPVC opens a pvc view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToPVC('cluster-1', 'default', 'my-pvc') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('pvc')
    expect(view?.title).toBe('my-pvc')
  })

  it('drillToJob opens a job view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToJob('cluster-1', 'default', 'my-job') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('job')
    expect(view?.title).toBe('my-job')
  })

  it('drillToHPA opens an hpa view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToHPA('cluster-1', 'default', 'my-hpa') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('hpa')
    expect(view?.title).toBe('my-hpa')
  })

  it('drillToService opens a service view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToService('cluster-1', 'default', 'my-svc') })
    const view = result.current.drill.state.currentView
    expect(view?.type).toBe('service')
    expect(view?.title).toBe('my-svc')
  })
})

// ---------------------------------------------------------------------------
// Multi-cluster summary actions
// ---------------------------------------------------------------------------

describe('Multi-cluster summary actions', () => {
  it('drillToAllNamespaces opens an all-namespaces view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllNamespaces() })
    expect(result.current.drill.state.currentView?.type).toBe('all-namespaces')
    expect(result.current.drill.state.currentView?.title).toBe('All Namespaces')
  })

  it('drillToAllNamespaces uses filter as title prefix when provided', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllNamespaces('active') })
    expect(result.current.drill.state.currentView?.title).toBe('Active Namespaces')
  })

  it('drillToAllDeployments opens an all-deployments view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllDeployments() })
    expect(result.current.drill.state.currentView?.type).toBe('all-deployments')
  })

  it('drillToAllServices opens an all-services view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllServices() })
    expect(result.current.drill.state.currentView?.type).toBe('all-services')
  })

  it('drillToAllNodes opens an all-nodes view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllNodes() })
    expect(result.current.drill.state.currentView?.type).toBe('all-nodes')
  })

  it('drillToAllEvents opens an all-events view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllEvents() })
    expect(result.current.drill.state.currentView?.type).toBe('all-events')
  })

  it('drillToAllAlerts opens an all-alerts view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllAlerts() })
    expect(result.current.drill.state.currentView?.type).toBe('all-alerts')
  })

  it('drillToAllHelm opens an all-helm view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllHelm() })
    expect(result.current.drill.state.currentView?.type).toBe('all-helm')
  })

  it('drillToAllOperators opens an all-operators view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllOperators() })
    expect(result.current.drill.state.currentView?.type).toBe('all-operators')
    expect(result.current.drill.state.currentView?.title).toBe('All Operators')
  })

  it('drillToAllOperators uses filter as title prefix when provided', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllOperators('certified') })
    expect(result.current.drill.state.currentView?.title).toBe('Certified Operators')
  })

  it('drillToAllSecurity opens an all-security view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllSecurity() })
    expect(result.current.drill.state.currentView?.type).toBe('all-security')
    expect(result.current.drill.state.currentView?.title).toBe('Security Issues')
  })

  it('drillToAllSecurity uses filter as title prefix when provided', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllSecurity('critical') })
    expect(result.current.drill.state.currentView?.title).toBe('Critical Security Issues')
  })

  it('drillToAllStorage opens an all-storage view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllStorage() })
    expect(result.current.drill.state.currentView?.type).toBe('all-storage')
    expect(result.current.drill.state.currentView?.title).toBe('All Storage')
  })

  it('drillToAllJobs opens an all-jobs view', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllJobs() })
    expect(result.current.drill.state.currentView?.type).toBe('all-jobs')
    expect(result.current.drill.state.currentView?.title).toBe('All Jobs')
  })

  it('multi-cluster filter data is forwarded into view data', () => {
    const { result } = renderHook(useActionsAndDrill, { wrapper })
    act(() => { result.current.actions.drillToAllDeployments('failed', { region: 'us-east-1' }) })
    const view = result.current.drill.state.currentView
    expect(view?.data).toMatchObject({ filter: 'failed', region: 'us-east-1' })
  })
})
