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



export function createV1SlsaHandlers() {
  return [
  http.get('/api/v1/compliance/slsa/attestations', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'att-1', artifact: 'ghcr.io/kubestellar/console:v0.28.0', builder: 'GitHub Actions', slsa_level: 3, verified: true, build_type: 'https://slsa.dev/container-based-build/v0.1', source_repo: 'github.com/kubestellar/console', timestamp: '2025-01-15T08:00:00Z', status: 'pass' },
      { id: 'att-2', artifact: 'ghcr.io/kubestellar/kc-agent:v0.12.0', builder: 'GitHub Actions', slsa_level: 3, verified: true, build_type: 'https://slsa.dev/container-based-build/v0.1', source_repo: 'github.com/kubestellar/kc-agent', timestamp: '2025-01-14T16:30:00Z', status: 'pass' },
      { id: 'att-3', artifact: 'ghcr.io/kubestellar/controller:v0.9.1', builder: 'GitHub Actions', slsa_level: 2, verified: true, build_type: 'https://github.com/slsa-framework/slsa-github-generator', source_repo: 'github.com/kubestellar/kubestellar', timestamp: '2025-01-13T12:15:00Z', status: 'pass' },
      { id: 'att-4', artifact: 'quay.io/custom/worker:dev', builder: 'Local Build', slsa_level: 1, verified: false, build_type: 'docker build', source_repo: 'github.com/internal/worker', timestamp: '2025-01-12T09:00:00Z', status: 'fail' },
      { id: 'att-5', artifact: 'ghcr.io/kubestellar/proxy:v0.5.0', builder: 'Tekton Chains', slsa_level: 4, verified: true, build_type: 'https://tekton.dev/chains/v1', source_repo: 'github.com/kubestellar/proxy', timestamp: '2025-01-11T14:20:00Z', status: 'pass' },
      { id: 'att-6', artifact: 'registry.internal/ml-serve:latest', builder: 'Jenkins', slsa_level: 1, verified: false, build_type: 'jenkins-pipeline', source_repo: 'gitlab.internal/ml/serve', timestamp: '2025-01-10T11:00:00Z', status: 'pending' },
      { id: 'att-7', artifact: 'ghcr.io/kubestellar/docs:v2.1.0', builder: 'GitHub Actions', slsa_level: 3, verified: true, build_type: 'https://slsa.dev/container-based-build/v0.1', source_repo: 'github.com/kubestellar/docs', timestamp: '2025-01-09T08:45:00Z', status: 'pass' },
    ])
  }),

  http.get('/api/v1/compliance/slsa/provenance', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'prov-1', artifact: 'ghcr.io/kubestellar/console:v0.28.0', builder_id: 'https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml', build_level: 3, source_uri: 'git+https://github.com/kubestellar/console@refs/tags/v0.28.0', source_digest: 'sha1:abc1234', reproducible: true, hermetic: true, parameterless: true, timestamp: '2025-01-15T08:00:00Z' },
      { id: 'prov-2', artifact: 'ghcr.io/kubestellar/kc-agent:v0.12.0', builder_id: 'https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml', build_level: 3, source_uri: 'git+https://github.com/kubestellar/kc-agent@refs/tags/v0.12.0', source_digest: 'sha1:def5678', reproducible: true, hermetic: true, parameterless: false, timestamp: '2025-01-14T16:30:00Z' },
      { id: 'prov-3', artifact: 'ghcr.io/kubestellar/controller:v0.9.1', builder_id: 'https://github.com/slsa-framework/slsa-github-generator', build_level: 2, source_uri: 'git+https://github.com/kubestellar/kubestellar@refs/tags/v0.9.1', source_digest: 'sha1:ghi9012', reproducible: false, hermetic: true, parameterless: true, timestamp: '2025-01-13T12:15:00Z' },
      { id: 'prov-4', artifact: 'quay.io/custom/worker:dev', builder_id: 'local-docker', build_level: 1, source_uri: 'git+https://github.com/internal/worker@refs/heads/main', source_digest: 'sha1:jkl3456', reproducible: false, hermetic: false, parameterless: false, timestamp: '2025-01-12T09:00:00Z' },
      { id: 'prov-5', artifact: 'ghcr.io/kubestellar/proxy:v0.5.0', builder_id: 'https://tekton.dev/chains/v1', build_level: 4, source_uri: 'git+https://github.com/kubestellar/proxy@refs/tags/v0.5.0', source_digest: 'sha1:mno7890', reproducible: true, hermetic: true, parameterless: true, timestamp: '2025-01-11T14:20:00Z' },
    ])
  }),

  http.get('/api/v1/compliance/slsa/summary', async () => {
    await delay(100)
    return HttpResponse.json({
      total_artifacts: 42,
      attested_artifacts: 38,
      level_1: 6,
      level_2: 8,
      level_3: 22,
      level_4: 6,
      verified_attestations: 35,
      failed_attestations: 2,
      pending_attestations: 5,
      source_integrity_pass: 37,
      source_integrity_fail: 5,
      reproducible_builds: 30,
      total_builds: 42,
    })
  }),

  // ── Epic 7: Enterprise Risk Management ─────────────────────────────────

  // Risk Matrix endpoints
  ]
}
