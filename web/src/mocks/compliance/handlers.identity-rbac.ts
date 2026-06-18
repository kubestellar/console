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



export function createIdentityRbacHandlers() {
  return [
  http.get('/api/identity/rbac/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_bindings: 147, cluster_role_bindings: 34,
      role_bindings: 113, over_privileged: 8,
      unused_bindings: 12, compliance_score: 78,
      evaluated_at: new Date().toISOString(),
    })
  }),

  http.get('/api/identity/rbac/bindings', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'rb-1', name: 'admin-binding', kind: 'ClusterRoleBinding', subject_kind: 'User', subject_name: 'alice@company.com', role_name: 'cluster-admin', namespace: '', cluster: 'prod-east', risk_level: 'critical', last_used: new Date(Date.now() - DEMO_1_DAY_MS).toISOString() },
      { id: 'rb-2', name: 'dev-edit-binding', kind: 'RoleBinding', subject_kind: 'Group', subject_name: 'developers', role_name: 'edit', namespace: 'app-dev', cluster: 'prod-east', risk_level: 'medium', last_used: new Date(Date.now() - DEMO_2_DAY_MS).toISOString() },
      { id: 'rb-3', name: 'ci-deploy', kind: 'RoleBinding', subject_kind: 'ServiceAccount', subject_name: 'ci-deployer', role_name: 'deploy-manager', namespace: 'ci-cd', cluster: 'prod-east', risk_level: 'high', last_used: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString() },
      { id: 'rb-4', name: 'monitoring-view', kind: 'ClusterRoleBinding', subject_kind: 'ServiceAccount', subject_name: 'prometheus', role_name: 'view', namespace: '', cluster: 'prod-west', risk_level: 'low', last_used: new Date(Date.now() - DEMO_5_MIN_MS).toISOString() },
      { id: 'rb-5', name: 'qa-edit-binding', kind: 'RoleBinding', subject_kind: 'Group', subject_name: 'qa-team', role_name: 'edit', namespace: 'qa', cluster: 'staging', risk_level: 'medium', last_used: new Date(Date.now() - DEMO_1_WEEK_MS).toISOString() },
      { id: 'rb-6', name: 'old-admin-binding', kind: 'ClusterRoleBinding', subject_kind: 'User', subject_name: 'former-admin@company.com', role_name: 'cluster-admin', namespace: '', cluster: 'prod-east', risk_level: 'critical', last_used: new Date(Date.now() - DEMO_30_DAY_MS).toISOString() },
      { id: 'rb-7', name: 'secrets-reader', kind: 'RoleBinding', subject_kind: 'ServiceAccount', subject_name: 'vault-agent', role_name: 'secret-reader', namespace: 'vault', cluster: 'prod-east', risk_level: 'high', last_used: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString() },
      { id: 'rb-8', name: 'ingress-controller', kind: 'ClusterRoleBinding', subject_kind: 'ServiceAccount', subject_name: 'nginx-ingress', role_name: 'ingress-nginx', namespace: '', cluster: 'prod-east', risk_level: 'medium', last_used: new Date(Date.now() - DEMO_10_MIN_MS).toISOString() },
      { id: 'rb-9', name: 'dev-readonly', kind: 'RoleBinding', subject_kind: 'Group', subject_name: 'interns', role_name: 'view', namespace: 'sandbox', cluster: 'staging', risk_level: 'low', last_used: new Date(Date.now() - DEMO_3_DAY_MS).toISOString() },
      { id: 'rb-10', name: 'backup-operator', kind: 'ClusterRoleBinding', subject_kind: 'ServiceAccount', subject_name: 'velero', role_name: 'backup-admin', namespace: '', cluster: 'prod-west', risk_level: 'high', last_used: new Date(Date.now() - DEMO_12_HOUR_MS).toISOString() },
      { id: 'rb-11', name: 'app-deployer', kind: 'RoleBinding', subject_kind: 'Group', subject_name: 'sre-team', role_name: 'admin', namespace: 'production', cluster: 'prod-east', risk_level: 'high', last_used: new Date(Date.now() - DEMO_30_MIN_MS).toISOString() },
      { id: 'rb-12', name: 'log-collector', kind: 'ClusterRoleBinding', subject_kind: 'ServiceAccount', subject_name: 'fluentd', role_name: 'log-reader', namespace: '', cluster: 'prod-east', risk_level: 'low', last_used: new Date(Date.now() - DEMO_2_MIN_MS).toISOString() },
    ])
  }),

  http.get('/api/identity/rbac/findings', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'find-1', finding_type: 'cluster_admin_user', severity: 'critical', subject: 'alice@company.com', description: 'User has cluster-admin role bound directly. This grants unrestricted access to all resources.', cluster: 'prod-east', namespace: '*', recommendation: 'Replace with scoped roles targeting specific namespaces and resources.' },
      { id: 'find-2', finding_type: 'stale_binding', severity: 'high', subject: 'former-admin@company.com', description: 'ClusterRoleBinding for cluster-admin has not been used in 30+ days. User may have left the organization.', cluster: 'prod-east', namespace: '*', recommendation: 'Remove the binding and verify user employment status.' },
      { id: 'find-3', finding_type: 'wildcard_resource', severity: 'high', subject: 'ci-deployer', description: 'ServiceAccount has wildcard resource permissions in the ci-cd namespace.', cluster: 'prod-east', namespace: 'ci-cd', recommendation: 'Restrict to specific resource types: deployments, services, configmaps.' },
      { id: 'find-4', finding_type: 'excessive_secrets_access', severity: 'medium', subject: 'developers', description: 'Group "developers" can list and read secrets in the app-dev namespace.', cluster: 'prod-east', namespace: 'app-dev', recommendation: 'Use CSI secret store driver instead of direct secret access.' },
      { id: 'find-5', finding_type: 'unused_binding', severity: 'medium', subject: 'interns', description: 'RoleBinding for "interns" group has not been used in 3+ days. May indicate stale permissions.', cluster: 'staging', namespace: 'sandbox', recommendation: 'Review and remove if no longer needed.' },
      { id: 'find-6', finding_type: 'broad_namespace_admin', severity: 'high', subject: 'sre-team', description: 'Group has admin role in production namespace, granting full control including RBAC modification.', cluster: 'prod-east', namespace: 'production', recommendation: 'Use edit role instead and manage RBAC separately through policy.' },
    ])
  }),
  ]
}
