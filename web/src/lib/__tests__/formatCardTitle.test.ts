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

  // Regression test for issue #5902: defensive guard against undefined
  // card_type. Stale dashboard layouts could contain entries without a
  // card_type field, which used to crash with
  // "can't access property 'replace', cardType is undefined".
  it('returns a fallback title when cardType is undefined', () => {
    expect(formatCardTitle(undefined)).toBe('Unknown Card')
  })

  it('returns a fallback title when cardType is null', () => {
    expect(formatCardTitle(null)).toBe('Unknown Card')
  })

  it('handles all-acronym type', () => {
    expect(formatCardTitle('gpu_cpu_ai')).toBe('GPU CPU AI')
  })

  it('handles PVC acronym', () => {
    expect(formatCardTitle('pvc_status')).toBe('PVC Status')
  })

  it('handles CRD acronym', () => {
    expect(formatCardTitle('crd_viewer')).toBe('CRD Viewer')
  })

  it('handles multiple underscores', () => {
    expect(formatCardTitle('multi_word_card_title')).toBe('Multi Word Card Title')
  })

  it('handles IAM acronym', () => {
    expect(formatCardTitle('iam_policies')).toBe('IAM Policies')
  })

  it('handles VPC acronym', () => {
    expect(formatCardTitle('vpc_overview')).toBe('VPC Overview')
  })

  it('handles EKS acronym', () => {
    expect(formatCardTitle('eks_clusters')).toBe('EKS Clusters')
  })

  it('handles GKE acronym', () => {
    expect(formatCardTitle('gke_status')).toBe('GKE Status')
  })

  it('handles OLM acronym', () => {
    expect(formatCardTitle('olm_operators')).toBe('OLM Operators')
  })

  it('returns custom title for deployment_missions', () => {
    expect(formatCardTitle('deployment_missions')).toBe('Deployment Missions')
  })

  it('returns custom title for resource_marshall', () => {
    expect(formatCardTitle('resource_marshall')).toBe('Resource Marshall')
  })

  it('returns custom title for llmd_stack_monitor', () => {
    expect(formatCardTitle('llmd_stack_monitor')).toBe('llm-d Stack Monitor')
  })

  it('returns custom title for pd_disaggregation', () => {
    expect(formatCardTitle('pd_disaggregation')).toBe('P/D Disaggregation')
  })

  it('handles mixed acronyms and regular words', () => {
    expect(formatCardTitle('gpu_memory_ai_status')).toBe('GPU Memory AI Status')
  })

  it('lowercases non-acronym words beyond first letter', () => {
    expect(formatCardTitle('CUSTOM_CARD')).toBe('Custom Card')
  })
})
