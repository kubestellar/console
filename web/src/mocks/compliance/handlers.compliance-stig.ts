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



export function createComplianceStigHandlers() {
  return [
  http.get('/api/compliance/stig/benchmarks', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'kubernetes-stig-v2r1', title: 'Kubernetes STIG', version: 'V2R1', release: 'Release 1', status: 'compliant', profile: 'MAC-I Classified', total_rules: 95, findings_count: 12 },
    ])
  }),

  http.get('/api/compliance/stig/findings', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'V-242381', rule_id: 'SV-242381r879578', title: 'API Server must have anonymous auth disabled', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'anonymous-auth=false verified on all API servers' },
      { id: 'V-242382', rule_id: 'SV-242382r879581', title: 'API Server must have audit logging enabled', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'Audit policy active with RequestResponse level' },
      { id: 'V-242383', rule_id: 'SV-242383r879584', title: 'etcd must use TLS encryption', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'TLS certs verified via --etcd-certfile' },
      { id: 'V-242395', rule_id: 'SV-242395r879620', title: 'Network policies must restrict pod traffic', severity: 'CAT II', status: 'open', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-worker-03', comments: '2 namespaces missing default-deny policies' },
      { id: 'V-242400', rule_id: 'SV-242400r879635', title: 'Container images must be signed', severity: 'CAT II', status: 'open', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-worker-01', comments: 'Admission controller not enforcing signatures' },
      { id: 'V-242402', rule_id: 'SV-242402r879641', title: 'Resource limits must be set on containers', severity: 'CAT III', status: 'open', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-worker-02', comments: '12 pods in dev namespace missing resource limits' },
      { id: 'V-242410', rule_id: 'SV-242410r879660', title: 'RBAC must be enabled on the API server', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: '--authorization-mode includes RBAC' },
      { id: 'V-242415', rule_id: 'SV-242415r879675', title: 'Secrets must be encrypted at rest', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'EncryptionConfiguration with aescbc provider' },
      { id: 'V-242420', rule_id: 'SV-242420r879690', title: 'Kubelet must use TLS authentication', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-worker-01', comments: 'Client cert auth verified' },
      { id: 'V-242425', rule_id: 'SV-242425r879705', title: 'Pod security standards must be enforced', severity: 'CAT II', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'PodSecurity admission enabled with restricted profile' },
      { id: 'V-242430', rule_id: 'SV-242430r879720', title: 'ServiceAccount token automounting must be disabled', severity: 'CAT II', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'automountServiceAccountToken: false set as default' },
      { id: 'V-242435', rule_id: 'SV-242435r879735', title: 'API server must use secure port only', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'Insecure port disabled, --secure-port=6443' },
    ])
  }),

  http.get('/api/compliance/stig/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      compliance_score: 75, total_findings: 12, open: 3,
      cat_i_open: 0, cat_ii_open: 2, cat_iii_open: 1,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // ── Air-Gap Readiness mock handlers (demo mode) ───────────────────
  ]
}
