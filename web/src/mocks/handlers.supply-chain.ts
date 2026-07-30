import { http, HttpResponse, delay } from 'msw'
import {
  DEMO_30_SEC_MS,
  DEMO_45_SEC_MS,
  DEMO_1_MIN_MS,
  DEMO_2_MIN_MS,
  DEMO_5_MIN_MS,
  DEMO_30_MIN_MS,
  DEMO_1_HOUR_MS,
  DEMO_90_MIN_MS,
  DEMO_2_HOUR_MS,
  DEMO_1_DAY_MS,
  DEMO_2_DAY_MS,
  DEMO_3_DAY_MS,
  DEMO_5_DAY_MS,
  DEMO_1_WEEK_MS,
} from './handlers.fixtures'

export function createSupplyChainHandlers() {
  return [
  // ── Supply Chain & Software Provenance (Epic 6) ─────────────────
  // Issues: #9632 (epic), #9644 (SBOM), #9643 (SIEM), #9646 (Signing),
  //         #9647 (SLSA), #9648 (License Compliance)

  // SBOM — #9644
  http.get('/api/supply-chain/sbom/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_workloads: 42,
      sbom_coverage: 88,
      total_components: 3847,
      vulnerable_components: 12,
      critical_count: 2,
      high_count: 5,
      generated_at: new Date().toISOString(),
    })
  }),

  http.get('/api/supply-chain/sbom/documents', async () => {
    await delay(200)
    return HttpResponse.json([
      {
        id: 'sbom-vllm-engine',
        workload: 'vllm-engine',
        namespace: 'inference',
        cluster: 'gpu-prod',
        format: 'SPDX',
        generated_at: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(),
        component_count: 284,
        vulnerable_count: 3,
        components: [
          { name: 'torch', version: '2.2.1', purl: 'pkg:pypi/torch@2.2.1', license: 'BSD-3-Clause', vulnerabilities: 0, severity: 'none' },
          { name: 'transformers', version: '4.38.2', purl: 'pkg:pypi/transformers@4.38.2', license: 'Apache-2.0', vulnerabilities: 0, severity: 'none' },
          { name: 'cryptography', version: '41.0.3', purl: 'pkg:pypi/cryptography@41.0.3', license: 'Apache-2.0', vulnerabilities: 2, severity: 'high' },
          { name: 'pillow', version: '10.0.0', purl: 'pkg:pypi/pillow@10.0.0', license: 'HPND', vulnerabilities: 1, severity: 'medium' },
          { name: 'numpy', version: '1.24.4', purl: 'pkg:pypi/numpy@1.24.4', license: 'BSD-3-Clause', vulnerabilities: 0, severity: 'none' },
        ],
      },
      {
        id: 'sbom-api-gateway',
        workload: 'api-gateway',
        namespace: 'default',
        cluster: 'prod-east',
        format: 'CycloneDX',
        generated_at: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(),
        component_count: 156,
        vulnerable_count: 0,
        components: [
          { name: 'express', version: '4.18.2', purl: 'pkg:npm/express@4.18.2', license: 'MIT', vulnerabilities: 0, severity: 'none' },
          { name: 'helmet', version: '7.1.0', purl: 'pkg:npm/helmet@7.1.0', license: 'MIT', vulnerabilities: 0, severity: 'none' },
          { name: 'jsonwebtoken', version: '9.0.2', purl: 'pkg:npm/jsonwebtoken@9.0.2', license: 'MIT', vulnerabilities: 0, severity: 'none' },
          { name: 'axios', version: '1.6.5', purl: 'pkg:npm/axios@1.6.5', license: 'MIT', vulnerabilities: 0, severity: 'none' },
        ],
      },
      {
        id: 'sbom-model-server',
        workload: 'model-server',
        namespace: 'inference',
        cluster: 'gpu-prod',
        format: 'SPDX',
        generated_at: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(),
        component_count: 412,
        vulnerable_count: 9,
        components: [
          { name: 'openssl', version: '3.0.8', purl: 'pkg:pypi/openssl@3.0.8', license: 'OpenSSL', vulnerabilities: 4, severity: 'critical' },
          { name: 'requests', version: '2.28.1', purl: 'pkg:pypi/requests@2.28.1', license: 'Apache-2.0', vulnerabilities: 0, severity: 'none' },
          { name: 'protobuf', version: '3.20.1', purl: 'pkg:pypi/protobuf@3.20.1', license: 'BSD-3-Clause', vulnerabilities: 5, severity: 'high' },
          { name: 'urllib3', version: '1.26.15', purl: 'pkg:pypi/urllib3@1.26.15', license: 'MIT', vulnerabilities: 0, severity: 'none' },
        ],
      },
      {
        id: 'sbom-metrics-collector',
        workload: 'metrics-collector',
        namespace: 'monitoring',
        cluster: 'ops',
        format: 'CycloneDX',
        generated_at: new Date(Date.now() - DEMO_90_MIN_MS).toISOString(),
        component_count: 89,
        vulnerable_count: 0,
        components: [
          { name: 'prometheus-client', version: '0.19.0', purl: 'pkg:pypi/prometheus-client@0.19.0', license: 'Apache-2.0', vulnerabilities: 0, severity: 'none' },
          { name: 'grpcio', version: '1.60.0', purl: 'pkg:pypi/grpcio@1.60.0', license: 'Apache-2.0', vulnerabilities: 0, severity: 'none' },
        ],
      },
    ])
  }),

  // Sigstore/Cosign Signing — #9646
  http.get('/api/supply-chain/signing/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_images: 37,
      signed_images: 33,
      verified_images: 30,
      unsigned_images: 4,
      policy_violations: 2,
      clusters_covered: 5,
      evaluated_at: new Date().toISOString(),
    })
  }),

  http.get('/api/supply-chain/signing/images', async () => {
    await delay(200)
    return HttpResponse.json([
      { image: 'ghcr.io/vllm-project/vllm:v0.4.0', digest: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', workload: 'vllm-engine', namespace: 'inference', cluster: 'gpu-prod', signed: true, verified: true, signer: 'sigstore@github.com', keyless: true, transparency_log: true, signed_at: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), failure_reason: null },
      { image: 'ghcr.io/kubestellar/router:v0.21.0', digest: 'sha256:b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5', workload: 'api-gateway', namespace: 'default', cluster: 'prod-east', signed: true, verified: true, signer: 'sigstore@github.com', keyless: true, transparency_log: true, signed_at: new Date(Date.now() - DEMO_2_DAY_MS).toISOString(), failure_reason: null },
      { image: 'docker.io/library/nginx:1.25.3', digest: 'sha256:c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6', workload: 'ingress-nginx', namespace: 'ingress-nginx', cluster: 'prod-east', signed: false, verified: false, signer: '', keyless: false, transparency_log: false, signed_at: null, failure_reason: 'No Cosign signature found for image' },
      { image: 'ghcr.io/open-telemetry/opentelemetry-collector:0.93.0', digest: 'sha256:d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1', workload: 'otel-collector', namespace: 'monitoring', cluster: 'ops', signed: true, verified: false, signer: 'old-key@example.com', keyless: false, transparency_log: false, signed_at: new Date(Date.now() - DEMO_1_WEEK_MS).toISOString(), failure_reason: 'Key not in trust root — rotate to keyless signing' },
      { image: 'ghcr.io/prometheus/prometheus:v2.49.1', digest: 'sha256:e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', workload: 'prometheus', namespace: 'monitoring', cluster: 'ops', signed: true, verified: true, signer: 'sigstore@github.com', keyless: true, transparency_log: true, signed_at: new Date(Date.now() - DEMO_3_DAY_MS).toISOString(), failure_reason: null },
      { image: 'docker.io/grafana/grafana:10.3.1', digest: 'sha256:f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3', workload: 'grafana', namespace: 'monitoring', cluster: 'ops', signed: false, verified: false, signer: '', keyless: false, transparency_log: false, signed_at: null, failure_reason: 'Grafana images not signed upstream — use Cosign bundle' },
      { image: 'ghcr.io/open-policy-agent/opa:0.63.0', digest: 'sha256:a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5', workload: 'opa-gatekeeper', namespace: 'gatekeeper-system', cluster: 'prod-east', signed: true, verified: true, signer: 'sigstore@github.com', keyless: true, transparency_log: true, signed_at: new Date(Date.now() - DEMO_5_DAY_MS).toISOString(), failure_reason: null },
    ])
  }),

  http.get('/api/supply-chain/signing/policies', async () => {
    await delay(150)
    return HttpResponse.json([
      { name: 'prod-east-enforce', cluster: 'prod-east', mode: 'enforce', scope: 'all namespaces', rules: 3, violations: 1 },
      { name: 'gpu-prod-enforce', cluster: 'gpu-prod', mode: 'enforce', scope: 'inference, kube-system', rules: 4, violations: 0 },
      { name: 'ops-warn', cluster: 'ops', mode: 'warn', scope: 'monitoring', rules: 2, violations: 1 },
      { name: 'dev-audit', cluster: 'dev', mode: 'audit', scope: 'all namespaces', rules: 1, violations: 0 },
    ])
  }),

  // SLSA Provenance — #9647
  http.get('/api/supply-chain/slsa/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_workloads: 28,
      level_distribution: { '0': 2, '1': 6, '2': 10, '3': 8, '4': 2 },
      attested_workloads: 24,
      verified_workloads: 20,
      fleet_posture: 1,
      evaluated_at: new Date().toISOString(),
    })
  }),

  http.get('/api/supply-chain/slsa/workloads', async () => {
    await delay(200)
    return HttpResponse.json([
      {
        workload: 'vllm-engine', namespace: 'inference', cluster: 'gpu-prod',
        image: 'ghcr.io/vllm-project/vllm:v0.4.0', slsa_level: 3,
        build_system: 'GitHub Actions', builder_id: 'https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@refs/tags/v2.0.0',
        source_uri: 'git+https://github.com/vllm-project/vllm@refs/tags/v0.4.0',
        attestation_present: true, attestation_verified: true, evaluated_at: new Date().toISOString(),
        requirements: [
          { id: 'build-scripted', description: 'Build process fully scripted', met: true, evidence: 'GitHub Actions workflow defines all build steps' },
          { id: 'build-service', description: 'Build runs on a hosted build service', met: true, evidence: 'GitHub-hosted ubuntu-latest runner' },
          { id: 'source-version-controlled', description: 'Source stored in version control', met: true, evidence: 'github.com/vllm-project/vllm@v0.4.0' },
          { id: 'provenance-authenticated', description: 'Provenance is authenticated', met: true, evidence: 'Sigstore keyless signature verified via Rekor' },
          { id: 'provenance-service-generated', description: 'Provenance generated by build service', met: false, evidence: 'Using SLSA L3 generator; L4 requires hermetic build' },
        ],
      },
      {
        workload: 'api-gateway', namespace: 'default', cluster: 'prod-east',
        image: 'ghcr.io/kubestellar/router:v0.21.0', slsa_level: 2,
        build_system: 'GitHub Actions', builder_id: 'https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@refs/tags/v1.9.0',
        source_uri: 'git+https://github.com/kubestellar/console@refs/tags/v0.21.0',
        attestation_present: true, attestation_verified: true, evaluated_at: new Date().toISOString(),
        requirements: [
          { id: 'build-scripted', description: 'Build process fully scripted', met: true, evidence: 'Dockerfile + GitHub Actions' },
          { id: 'build-service', description: 'Build runs on a hosted build service', met: true, evidence: 'GitHub-hosted runner' },
          { id: 'source-version-controlled', description: 'Source stored in version control', met: true, evidence: 'git tag v0.21.0' },
          { id: 'provenance-authenticated', description: 'Provenance is authenticated', met: false, evidence: 'Provenance present but not keyless — upgrade to SLSA L3 generator' },
        ],
      },
      {
        workload: 'ingress-nginx', namespace: 'ingress-nginx', cluster: 'prod-east',
        image: 'docker.io/library/nginx:1.25.3', slsa_level: 1,
        build_system: 'Unknown', builder_id: '',
        source_uri: 'https://nginx.org',
        attestation_present: false, attestation_verified: false, evaluated_at: new Date().toISOString(),
        requirements: [
          { id: 'build-scripted', description: 'Build process fully scripted', met: true, evidence: 'Upstream Dockerfile' },
          { id: 'build-service', description: 'Build runs on a hosted build service', met: false, evidence: 'Build service not verifiable for docker.io images' },
          { id: 'source-version-controlled', description: 'Source stored in version control', met: true, evidence: 'nginx GitHub mirror' },
          { id: 'provenance-authenticated', description: 'Provenance is authenticated', met: false, evidence: 'No provenance attestation available — consider switching to nginx/nginx SLSA-signed image' },
        ],
      },
      {
        workload: 'prometheus', namespace: 'monitoring', cluster: 'ops',
        image: 'ghcr.io/prometheus/prometheus:v2.49.1', slsa_level: 3,
        build_system: 'GitHub Actions', builder_id: 'https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@refs/tags/v2.0.0',
        source_uri: 'git+https://github.com/prometheus/prometheus@refs/tags/v2.49.1',
        attestation_present: true, attestation_verified: true, evaluated_at: new Date().toISOString(),
        requirements: [
          { id: 'build-scripted', description: 'Build process fully scripted', met: true, evidence: 'Makefile + GitHub Actions' },
          { id: 'build-service', description: 'Build runs on a hosted build service', met: true, evidence: 'GitHub-hosted runner' },
          { id: 'source-version-controlled', description: 'Source stored in version control', met: true, evidence: 'git tag v2.49.1' },
          { id: 'provenance-authenticated', description: 'Provenance is authenticated', met: true, evidence: 'Keyless Cosign + Rekor entry' },
          { id: 'provenance-service-generated', description: 'Provenance generated by build service', met: false, evidence: 'Hermetic build not yet configured' },
        ],
      },
    ])
  }),

  // License Compliance — #9648
  http.get('/api/supply-chain/licenses/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_packages: 3847,
      allowed_packages: 3814,
      warned_packages: 24,
      denied_packages: 9,
      unique_licenses: 47,
      workloads_scanned: 37,
      evaluated_at: new Date().toISOString(),
    })
  }),

  http.get('/api/supply-chain/licenses/categories', async () => {
    await delay(150)
    return HttpResponse.json([
      { name: 'Permissive (Allowed)', count: 3214, risk: 'allowed', examples: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'] },
      { name: 'Weak Copyleft (Warn)', count: 24, risk: 'warn', examples: ['LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EUPL-1.2'] },
      { name: 'Strong Copyleft (Denied)', count: 9, risk: 'denied', examples: ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'SSPL-1.0'] },
      { name: 'Public Domain', count: 600, risk: 'allowed', examples: ['CC0-1.0', 'Unlicense', 'WTFPL'] },
    ])
  }),

  http.get('/api/supply-chain/licenses/packages', async () => {
    await delay(200)
    return HttpResponse.json([
      { name: 'openssl', version: '3.0.8', license: 'OpenSSL (GPL-2.0 exception)', risk: 'warn', workload: 'model-server', namespace: 'inference', cluster: 'gpu-prod', spdx_id: 'OpenSSL' },
      { name: 'mysql-connector-python', version: '8.3.0', license: 'GPL-2.0', risk: 'denied', workload: 'db-proxy', namespace: 'data', cluster: 'prod-east', spdx_id: 'GPL-2.0-only' },
      { name: 'ffmpeg', version: '6.1', license: 'GPL-3.0', risk: 'denied', workload: 'media-processor', namespace: 'media', cluster: 'prod-west', spdx_id: 'GPL-3.0-only' },
      { name: 'ghostscript', version: '10.02.1', license: 'AGPL-3.0', risk: 'denied', workload: 'pdf-renderer', namespace: 'docs', cluster: 'prod-east', spdx_id: 'AGPL-3.0-only' },
      { name: 'lgpl-utils', version: '1.4.2', license: 'LGPL-2.1', risk: 'warn', workload: 'vllm-engine', namespace: 'inference', cluster: 'gpu-prod', spdx_id: 'LGPL-2.1-only' },
      { name: 'pdfium', version: '6111', license: 'BSD-3-Clause', risk: 'allowed', workload: 'pdf-renderer', namespace: 'docs', cluster: 'prod-east', spdx_id: 'BSD-3-Clause' },
      { name: 'torch', version: '2.2.1', license: 'BSD-3-Clause', risk: 'allowed', workload: 'vllm-engine', namespace: 'inference', cluster: 'gpu-prod', spdx_id: 'BSD-3-Clause' },
      { name: 'cryptography', version: '41.0.3', license: 'Apache-2.0', risk: 'allowed', workload: 'api-gateway', namespace: 'default', cluster: 'prod-east', spdx_id: 'Apache-2.0' },
      { name: 'readline', version: '8.2', license: 'GPL-3.0', risk: 'denied', workload: 'debug-shell', namespace: 'kube-system', cluster: 'ops', spdx_id: 'GPL-3.0-only' },
      { name: 'mpl-lib', version: '3.1.0', license: 'MPL-2.0', risk: 'warn', workload: 'metrics-collector', namespace: 'monitoring', cluster: 'ops', spdx_id: 'MPL-2.0' },
      { name: 'express', version: '4.18.2', license: 'MIT', risk: 'allowed', workload: 'api-gateway', namespace: 'default', cluster: 'prod-east', spdx_id: 'MIT' },
      { name: 'react', version: '18.2.0', license: 'MIT', risk: 'allowed', workload: 'frontend', namespace: 'default', cluster: 'prod-east', spdx_id: 'MIT' },
    ])
  }),

  // SIEM Export — #9643
  http.get('/api/audit/export/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_destinations: 4,
      active_destinations: 3,
      events_per_minute: 847,
      total_events_24h: 1_219_680,
      error_rate: 0.3,
      evaluated_at: new Date().toISOString(),
    })
  }),

  http.get('/api/audit/export/destinations', async () => {
    await delay(200)
    return HttpResponse.json([
      {
        id: 'splunk-prod', name: 'Splunk Production HEC', provider: 'splunk',
        endpoint: 'https://splunk.corp.example.com:8088/services/collector',
        status: 'active', events_per_minute: 612, total_events: 8_394_210,
        last_event_at: new Date().toISOString(), error_count: 0, last_error: null,
        filters: ['audit', 'security', 'compliance'], tls_enabled: true, batch_size: 500,
      },
      {
        id: 'elastic-siem', name: 'Elastic SIEM', provider: 'elastic',
        endpoint: 'https://elastic.corp.example.com:9200/_bulk',
        status: 'active', events_per_minute: 235, total_events: 3_218_445,
        last_event_at: new Date(Date.now() - DEMO_1_MIN_MS).toISOString(), error_count: 3, last_error: null,
        filters: ['security', 'policy'], tls_enabled: true, batch_size: 250,
      },
      {
        id: 'webhook-pagerduty', name: 'PagerDuty Webhook', provider: 'webhook',
        endpoint: 'https://events.pagerduty.com/v2/enqueue',
        status: 'active', events_per_minute: 0, total_events: 1_842,
        last_event_at: new Date(Date.now() - DEMO_5_MIN_MS).toISOString(), error_count: 0, last_error: null,
        filters: ['critical', 'policy-violation'], tls_enabled: true, batch_size: 1,
      },
      {
        id: 'syslog-legacy', name: 'Legacy Syslog (RFC 5424)', provider: 'syslog',
        endpoint: 'syslog://10.0.1.50:514',
        status: 'down', events_per_minute: 0, total_events: 0,
        last_event_at: null, error_count: 148,
        last_error: 'Connection refused: syslog server unreachable on 10.0.1.50:514',
        filters: ['all'], tls_enabled: false, batch_size: 100,
      },
    ])
  }),

  http.get('/api/audit/export/events', async () => {
    await delay(150)
    const now = Date.now()
    return HttpResponse.json([
      { id: 'evt-001', cluster: 'prod-east', event_type: 'create', resource: 'pods/inference/vllm-engine-7d9b4', user: 'system:serviceaccount:default:deployer', timestamp: new Date(now - 2_000).toISOString(), destination_count: 2 },
      { id: 'evt-002', cluster: 'gpu-prod', event_type: 'delete', resource: 'secrets/inference/model-weights', user: 'andy@clubanderson.com', timestamp: new Date(now - 15_000).toISOString(), destination_count: 3 },
      { id: 'evt-003', cluster: 'prod-east', event_type: 'patch', resource: 'deployments/default/api-gateway', user: 'system:serviceaccount:argocd:argocd-server', timestamp: new Date(now - DEMO_30_SEC_MS).toISOString(), destination_count: 2 },
      { id: 'evt-004', cluster: 'ops', event_type: 'get', resource: 'secrets/kube-system/etcd-certs', user: 'admin@example.com', timestamp: new Date(now - DEMO_45_SEC_MS).toISOString(), destination_count: 3 },
      { id: 'evt-005', cluster: 'prod-west', event_type: 'create', resource: 'clusterrolebindings/cluster-admin-tmp', user: 'ops-bot@example.com', timestamp: new Date(now - 60_000).toISOString(), destination_count: 3 },
      { id: 'evt-006', cluster: 'prod-east', event_type: 'update', resource: 'configmaps/kube-system/kube-proxy', user: 'system:node:node-03', timestamp: new Date(now - 90_000).toISOString(), destination_count: 2 },
      { id: 'evt-007', cluster: 'gpu-prod', event_type: 'create', resource: 'pods/inference/llm-router-6f8c9', user: 'system:serviceaccount:inference:router', timestamp: new Date(now - DEMO_2_MIN_MS).toISOString(), destination_count: 2 },
    ])
  }),

]
}
