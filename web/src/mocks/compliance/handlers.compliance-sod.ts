import { http, HttpResponse, delay } from 'msw'
import {
  pruneRegistry,
  savedCards,
  DEMO_30_SEC_MS,
  DEMO_45_SEC_MS,
  DEMO_1_MIN_MS,
  DEMO_90_SEC_MS,
  DEMO_2_MIN_MS,
  DEMO_150_SEC_MS,
  DEMO_3_MIN_MS,
  DEMO_4_MIN_MS,
  DEMO_5_MIN_MS,
  DEMO_6_MIN_MS,
  DEMO_7_MIN_MS,
  DEMO_8_MIN_MS,
  DEMO_10_MIN_MS,
  DEMO_15_MIN_MS,
  DEMO_20_MIN_MS,
  DEMO_30_MIN_MS,
  DEMO_45_MIN_MS,
  DEMO_50_MIN_MS,
  DEMO_1_HOUR_MS,
  DEMO_75_MIN_MS,
  DEMO_90_MIN_MS,
  DEMO_2_HOUR_MS,
  DEMO_150_MIN_MS,
  DEMO_3_HOUR_MS,
  DEMO_4_HOUR_MS,
  DEMO_8_HOUR_MS,
  DEMO_12_HOUR_MS,
  DEMO_1_DAY_MS,
  DEMO_2_DAY_MS,
  DEMO_3_DAY_MS,
  DEMO_1_WEEK_MS,
  DEMO_30_DAY_MS,
} from './handlers.fixtures'



export function createComplianceSodHandlers() {
  return [
  http.get('/api/compliance/sod/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_rules: 8, total_principals: 12, total_violations: 2,
      by_severity: { high: 1, medium: 1 },
      by_conflict_type: { deployment: 1, access: 1 },
      compliance_score: 83, clean_principals: 10, conflicted_principals: 2,
    })
  }),

  http.get('/api/compliance/sod/rules', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'sod-1', name: 'Deployment ≠ Approval', description: 'Users who deploy cannot approve their own deployments', role_a: 'deployer', role_b: 'approver', conflict_type: 'deployment', severity: 'high', regulation: 'SOX §404' },
      { id: 'sod-2', name: 'Admin ≠ Auditor', description: 'Cluster admins cannot hold auditor role', role_a: 'cluster-admin', role_b: 'auditor', conflict_type: 'access', severity: 'critical', regulation: 'PCI-DSS 7.1' },
      { id: 'sod-3', name: 'Secret Access ≠ Deployment', description: 'Users with secret access cannot deploy workloads', role_a: 'secret-reader', role_b: 'deployer', conflict_type: 'access', severity: 'high', regulation: 'SOC2 CC6.1' },
      { id: 'sod-4', name: 'Network Policy ≠ Workload Owner', description: 'Network policy editors cannot own workloads in same namespace', role_a: 'network-admin', role_b: 'workload-owner', conflict_type: 'access', severity: 'medium', regulation: 'NIST AC-5' },
      { id: 'sod-5', name: 'RBAC Admin ≠ Developer', description: 'RBAC administrators cannot hold developer roles', role_a: 'rbac-admin', role_b: 'developer', conflict_type: 'access', severity: 'high', regulation: 'SOX §404' },
      { id: 'sod-6', name: 'Release Manager ≠ QA', description: 'Release managers cannot perform QA sign-off', role_a: 'release-manager', role_b: 'qa-signer', conflict_type: 'deployment', severity: 'medium', regulation: 'ISO 27001 A.6.1.2' },
      { id: 'sod-7', name: 'Backup Admin ≠ Restore', description: 'Backup administrators cannot perform restores', role_a: 'backup-admin', role_b: 'restore-operator', conflict_type: 'access', severity: 'medium', regulation: 'SOC2 CC6.3' },
      { id: 'sod-8', name: 'Monitoring ≠ Alert Suppression', description: 'Monitoring editors cannot suppress alerts', role_a: 'monitoring-editor', role_b: 'alert-manager', conflict_type: 'access', severity: 'medium', regulation: 'PCI-DSS 10.6' },
    ])
  }),

  http.get('/api/compliance/sod/principals', async () => {
    await delay(150)
    return HttpResponse.json([
      { name: 'alice@example.com', type: 'user', roles: ['deployer', 'developer'], clusters: ['prod-east', 'staging'] },
      { name: 'bob@example.com', type: 'user', roles: ['approver', 'auditor'], clusters: ['prod-east', 'prod-west'] },
      { name: 'carol@example.com', type: 'user', roles: ['cluster-admin'], clusters: ['staging'] },
      { name: 'ci-bot', type: 'serviceaccount', roles: ['deployer'], clusters: ['prod-east', 'prod-west', 'staging'] },
      { name: 'dave@example.com', type: 'user', roles: ['developer', 'qa-signer'], clusters: ['staging'] },
      { name: 'eve@example.com', type: 'user', roles: ['network-admin'], clusters: ['prod-east'] },
    ])
  }),

  http.get('/api/compliance/sod/violations', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'sv-1', rule_id: 'sod-1', principal: 'frank@example.com', principal_type: 'user', role_a: 'deployer', role_b: 'approver', clusters: ['prod-east'], severity: 'high', description: 'User frank@ holds both deployer and approver roles in prod-east' },
      { id: 'sv-2', rule_id: 'sod-4', principal: 'staging-netops', principal_type: 'serviceaccount', role_a: 'network-admin', role_b: 'workload-owner', clusters: ['staging'], severity: 'medium', description: 'Service account staging-netops manages network policies and owns workloads' },
    ])
  }),

  // ── Change Control mock handlers (demo mode) ───────────────────────
  ]
}
