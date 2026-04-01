import { describe, it, expect } from 'vitest'
import { formatCardTitle } from '../formatCardTitle'

describe('formatCardTitle', () => {
  it('returns custom title for known card types', () => {
    expect(formatCardTitle('app_status')).toBe('Workload Status')
    expect(formatCardTitle('chart_versions')).toBe('Helm Chart Versions')
    expect(formatCardTitle('helm_release_status')).toBe('Helm Release Status')
    expect(formatCardTitle('llmd_flow')).toBe('llm-d Request Flow')
    expect(formatCardTitle('kvcache_monitor')).toBe('KV Cache Monitor')
    expect(formatCardTitle('epp_routing')).toBe('EPP Routing')
  })

  it('capitalizes words from snake_case', () => {
    expect(formatCardTitle('my_custom_card')).toBe('My Custom Card')
  })

  it('uppercases known acronyms', () => {
    expect(formatCardTitle('opa_policies')).toBe('OPA Policies')
    expect(formatCardTitle('gpu_usage')).toBe('GPU Usage')
    expect(formatCardTitle('cpu_metrics')).toBe('CPU Metrics')
    expect(formatCardTitle('rbac_audit')).toBe('RBAC Audit')
    expect(formatCardTitle('dns_health')).toBe('DNS Health')
    expect(formatCardTitle('api_status')).toBe('API Status')
  })

  it('handles ArgoCD special case', () => {
    expect(formatCardTitle('argocd_sync')).toBe('ArgoCD Sync')
  })

  it('handles single word', () => {
    expect(formatCardTitle('health')).toBe('Health')
  })

  it('handles empty string', () => {
    expect(formatCardTitle('')).toBe('')
  })

  it('handles all-acronym type', () => {
    expect(formatCardTitle('gpu_cpu_ai')).toBe('GPU CPU AI')
  })
})
