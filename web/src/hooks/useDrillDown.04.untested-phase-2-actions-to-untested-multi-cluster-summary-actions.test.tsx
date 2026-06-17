/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { DrillDownProvider, useDrillDown, useDrillDownActions } from './useDrillDown'
import type { DrillDownView } from './useDrillDown'
import { emitDrillDownOpened, emitDrillDownClosed } from '../lib/analytics'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('../lib/analytics', () => ({
  emitDrillDownOpened: vi.fn(),
  emitDrillDownClosed: vi.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DrillDownProvider>{children}</DrillDownProvider>
)

/** Factory for creating a DrillDownView with sensible defaults. */
function makeView(overrides: Partial<DrillDownView> = {}): DrillDownView {
  return {
    type: overrides.type ?? 'cluster',
    title: overrides.title ?? 'test-cluster',
    subtitle: overrides.subtitle,
    data: overrides.data ?? { cluster: 'ctx/test-cluster' },
    customComponent: overrides.customComponent,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.spyOn(window.history, 'go').mockImplementation(() => undefined)
  window.history.replaceState(null, '', window.location.pathname)
})

// ── Provider setup ────────────────────────────────────────────────────────────


describe('untested Phase 2 actions', () => {
  const actionsWrapper = ({ children }: { children: React.ReactNode }) => (
    <DrillDownProvider>{children}</DrillDownProvider>
  )
  function renderBothHooks() {
    const { result } = renderHook(
      () => ({
        drillDown: useDrillDown(),
        actions: useDrillDownActions(),
      }),
      { wrapper: actionsWrapper },
    )
    return result
  }

  it('drillToKustomization opens a kustomization view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToKustomization('ctx/prod', 'flux-system', 'my-kustomization') })

    expect(result.current.drillDown.state.currentView?.type).toBe('kustomization')
    expect(result.current.drillDown.state.currentView?.data.name).toBe('my-kustomization')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Kustomization in flux-system')
  })

  it('drillToBuildpack opens a buildpack view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToBuildpack('ctx/prod', 'default', 'my-buildpack') })

    expect(result.current.drillDown.state.currentView?.type).toBe('buildpack')
    expect(result.current.drillDown.state.currentView?.data.name).toBe('my-buildpack')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Buildpack in default')
  })

  it('drillToDrift opens a drift view with cluster name in subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToDrift('ctx/prod-cluster', { driftCount: 5 }) })

    expect(result.current.drillDown.state.currentView?.type).toBe('drift')
    expect(result.current.drillDown.state.currentView?.title).toBe('Configuration Drift')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('prod-cluster')
    expect(result.current.drillDown.state.currentView?.data.driftCount).toBe(5)
  })

  it('drillToCompliance without filter uses default title', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToCompliance() })

    expect(result.current.drillDown.state.currentView?.type).toBe('compliance')
    expect(result.current.drillDown.state.currentView?.title).toBe('OSCAL Compliance Controls')
  })

  it('drillToCompliance normalizes dashboard status aliases', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToCompliance('failing', { category: 'access' }) })

    expect(result.current.drillDown.state.currentView?.title).toBe('Failing Controls')
    expect(result.current.drillDown.state.currentView?.data.filterStatus).toBe('fail')
    expect(result.current.drillDown.state.currentView?.data.category).toBe('access')
  })

  it('drillToAlert with namespace includes it in subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAlert('ctx/prod', 'monitoring', 'HighCPU') })

    expect(result.current.drillDown.state.currentView?.type).toBe('alert')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Alert in monitoring')
  })

  it('drillToAlert without namespace uses "Cluster Alert" subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAlert('ctx/prod', undefined, 'NodeDown') })

    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Cluster Alert')
  })

  it('drillToAlertRule opens an alertrule view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAlertRule('ctx/prod', 'monitoring', 'CPUThrottle') })

    expect(result.current.drillDown.state.currentView?.type).toBe('alertrule')
    expect(result.current.drillDown.state.currentView?.data.ruleName).toBe('CPUThrottle')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Alert Rule in monitoring')
  })

  it('drillToCost opens a cost view with cluster name in subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToCost('ctx/prod-cluster') })

    expect(result.current.drillDown.state.currentView?.type).toBe('cost')
    expect(result.current.drillDown.state.currentView?.title).toBe('Cost Analysis')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('prod-cluster')
  })

  it('drillToRBAC with namespace includes it in subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToRBAC('ctx/prod', 'default', 'admin-user') })

    expect(result.current.drillDown.state.currentView?.type).toBe('rbac')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('RBAC in default')
    expect(result.current.drillDown.state.currentView?.data.subject).toBe('admin-user')
  })

  it('drillToRBAC without namespace uses "Cluster RBAC" subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToRBAC('ctx/prod', undefined, 'system:admin') })

    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Cluster RBAC')
  })

  it('drillToPolicy without namespace uses "Cluster Policy" subtitle', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToPolicy('ctx/prod', undefined, 'restrict-root') })

    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Cluster Policy')
  })
})


describe('untested multi-cluster summary actions', () => {
  const actionsWrapper = ({ children }: { children: React.ReactNode }) => (
    <DrillDownProvider>{children}</DrillDownProvider>
  )
  function renderBothHooks() {
    const { result } = renderHook(
      () => ({
        drillDown: useDrillDown(),
        actions: useDrillDownActions(),
      }),
      { wrapper: actionsWrapper },
    )
    return result
  }

  it('drillToAllServices opens multi-cluster services view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllServices('loadbalancer') })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-services')
    expect(result.current.drillDown.state.currentView?.title).toBe('Loadbalancer Services')
  })

  it('drillToAllNamespaces with no filter uses default title', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllNamespaces() })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-namespaces')
    expect(result.current.drillDown.state.currentView?.title).toBe('All Namespaces')
    expect(result.current.drillDown.state.currentView?.subtitle).toBe('Across all clusters')
  })

  it('drillToAllAlerts passes filterData through to view data', () => {
    const result = renderBothHooks()
    const filterData = { severity: 'critical', source: 'prometheus' }

    act(() => { result.current.actions.drillToAllAlerts('critical', filterData) })

    expect(result.current.drillDown.state.currentView?.title).toBe('Critical Alerts')
    expect(result.current.drillDown.state.currentView?.data.severity).toBe('critical')
    expect(result.current.drillDown.state.currentView?.data.source).toBe('prometheus')
  })

  it('drillToAllHelm opens multi-cluster helm view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllHelm('outdated') })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-helm')
    expect(result.current.drillDown.state.currentView?.title).toBe('Outdated Helm Releases')
  })

  it('drillToAllOperators opens multi-cluster operators view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllOperators() })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-operators')
    expect(result.current.drillDown.state.currentView?.title).toBe('All Operators')
  })

  it('drillToAllSecurity opens multi-cluster security view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllSecurity('high') })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-security')
    expect(result.current.drillDown.state.currentView?.title).toBe('High Security Issues')
  })

  it('drillToAllGPU opens multi-cluster GPU view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllGPU() })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-gpu')
    expect(result.current.drillDown.state.currentView?.title).toBe('All GPUs')
  })

  it('drillToAllStorage opens multi-cluster storage view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllStorage('warning') })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-storage')
    expect(result.current.drillDown.state.currentView?.title).toBe('Warning Storage')
  })

  it('drillToAllJobs opens multi-cluster jobs view', () => {
    const result = renderBothHooks()

    act(() => { result.current.actions.drillToAllJobs('failed') })

    expect(result.current.drillDown.state.currentView?.type).toBe('all-jobs')
    expect(result.current.drillDown.state.currentView?.title).toBe('Failed Jobs')
  })
})
