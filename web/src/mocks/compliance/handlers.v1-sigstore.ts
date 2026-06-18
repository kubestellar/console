import { http, HttpResponse, delay } from 'msw'
import {
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

export function createV1SigstoreHandlers() {
  return [
  http.get('/api/v1/compliance/sigstore/signatures', async () => {
    await delay(100)
    return HttpResponse.json([
      { image: 'ghcr.io/kubestellar/console:v0.28.0', digest: 'sha256:a1b2c3d4', signed: true, signer: 'release-bot@kubestellar.io', issuer: 'https://accounts.google.com', timestamp: '2025-01-15T08:00:00Z', transparency_log: true, status: 'verified' },
      { image: 'ghcr.io/kubestellar/kc-agent:v0.12.0', digest: 'sha256:e5f6a7b8', signed: true, signer: 'ci@kubestellar.io', issuer: 'https://token.actions.githubusercontent.com', timestamp: '2025-01-14T16:30:00Z', transparency_log: true, status: 'verified' },
      { image: 'ghcr.io/kubestellar/controller:v0.9.1', digest: 'sha256:c9d0e1f2', signed: true, signer: 'ci@kubestellar.io', issuer: 'https://token.actions.githubusercontent.com', timestamp: '2025-01-13T12:15:00Z', transparency_log: true, status: 'verified' },
      { image: 'docker.io/library/nginx:1.25', digest: 'sha256:f3a4b5c6', signed: true, signer: 'docker-official@docker.com', issuer: 'https://accounts.google.com', timestamp: '2025-01-12T09:00:00Z', transparency_log: false, status: 'verified' },
      { image: 'quay.io/custom/worker:dev', digest: 'sha256:d7e8f9a0', signed: false, signer: '', issuer: '', timestamp: '', transparency_log: false, status: 'failed' },
      { image: 'ghcr.io/kubestellar/proxy:v0.5.0', digest: 'sha256:b1c2d3e4', signed: true, signer: 'release-bot@kubestellar.io', issuer: 'https://accounts.google.com', timestamp: '2025-01-11T14:20:00Z', transparency_log: true, status: 'verified' },
      { image: 'registry.internal/ml-serve:latest', digest: 'sha256:a5b6c7d8', signed: false, signer: '', issuer: '', timestamp: '', transparency_log: false, status: 'pending' },
    ])
  }),

  http.get('/api/v1/compliance/sigstore/verifications', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'ver-1', image: 'ghcr.io/kubestellar/console:v0.28.0', policy: 'require-keyless-signing', result: 'pass', checked_at: '2025-01-15T10:00:00Z', cosign_version: '2.2.3', certificate_chain: 3, rekor_entry: true },
      { id: 'ver-2', image: 'ghcr.io/kubestellar/kc-agent:v0.12.0', policy: 'require-keyless-signing', result: 'pass', checked_at: '2025-01-15T10:00:00Z', cosign_version: '2.2.3', certificate_chain: 3, rekor_entry: true },
      { id: 'ver-3', image: 'ghcr.io/kubestellar/controller:v0.9.1', policy: 'require-keyless-signing', result: 'pass', checked_at: '2025-01-15T10:00:00Z', cosign_version: '2.2.3', certificate_chain: 3, rekor_entry: true },
      { id: 'ver-4', image: 'quay.io/custom/worker:dev', policy: 'require-keyless-signing', result: 'fail', checked_at: '2025-01-15T10:00:00Z', cosign_version: '2.2.3', certificate_chain: 0, rekor_entry: false },
      { id: 'ver-5', image: 'docker.io/library/nginx:1.25', policy: 'allow-docker-official', result: 'pass', checked_at: '2025-01-15T10:00:00Z', cosign_version: '2.2.3', certificate_chain: 2, rekor_entry: false },
      { id: 'ver-6', image: 'registry.internal/ml-serve:latest', policy: 'require-keyless-signing', result: 'warn', checked_at: '2025-01-15T10:00:00Z', cosign_version: '2.2.3', certificate_chain: 0, rekor_entry: false },
    ])
  }),

  http.get('/api/v1/compliance/sigstore/summary', async () => {
    await delay(100)
    return HttpResponse.json({
      total_images: 42,
      signed_images: 38,
      unsigned_images: 4,
      verified_signatures: 36,
      failed_verifications: 2,
      pending_verifications: 4,
      transparency_log_entries: 34,
      trust_roots: 3,
      policies_enforced: 5,
      last_verification: '2025-01-15T10:00:00Z',
    })
  }),

  ]
}
