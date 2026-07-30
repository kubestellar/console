import { http, HttpResponse, delay } from 'msw'
import {
  DEMO_30_SEC_MS,
  DEMO_90_SEC_MS,
  DEMO_1_MIN_MS,
  DEMO_150_SEC_MS,
  DEMO_2_MIN_MS,
  DEMO_3_MIN_MS,
  DEMO_4_MIN_MS,
  DEMO_5_MIN_MS,
  DEMO_6_MIN_MS,
  DEMO_7_MIN_MS,
  DEMO_8_MIN_MS,
  DEMO_10_MIN_MS,
  DEMO_15_MIN_MS,
  DEMO_30_MIN_MS,
  DEMO_1_HOUR_MS,
  DEMO_2_HOUR_MS,
  DEMO_4_HOUR_MS,
  DEMO_8_HOUR_MS,
  DEMO_12_HOUR_MS,
  DEMO_1_DAY_MS,
  DEMO_2_DAY_MS,
  DEMO_1_WEEK_MS,
  DEMO_30_DAY_MS,
} from './handlers.fixtures'

// SIEM, Incident Response, Threat Intelligence, and Supply Chain Security
// (Epic 6) mock handlers (demo mode).
export function createComplianceSecurityHandlers() {
  return [
  // ── SIEM mock handlers ──────────────────────────────────────────────

  http.get('/api/v1/compliance/siem/events', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'evt-001', timestamp: new Date(Date.now() - DEMO_1_MIN_MS).toISOString(), source: 'falco', severity: 'critical', category: 'runtime', message: 'Unexpected process spawned in container nginx-proxy', cluster: 'prod-east-1' },
      { id: 'evt-002', timestamp: new Date(Date.now() - DEMO_2_MIN_MS).toISOString(), source: 'auditd', severity: 'high', category: 'access', message: 'Unauthorized kubectl exec attempt on kube-system namespace', cluster: 'prod-east-1' },
      { id: 'evt-003', timestamp: new Date(Date.now() - DEMO_3_MIN_MS).toISOString(), source: 'kube-apiserver', severity: 'medium', category: 'auth', message: 'ServiceAccount token used from unexpected IP range', cluster: 'prod-west-2' },
      { id: 'evt-004', timestamp: new Date(Date.now() - DEMO_4_MIN_MS).toISOString(), source: 'calico', severity: 'high', category: 'network', message: 'Network policy violation: egress to blocked CIDR detected', cluster: 'staging-1' },
      { id: 'evt-005', timestamp: new Date(Date.now() - DEMO_5_MIN_MS).toISOString(), source: 'trivy', severity: 'medium', category: 'vulnerability', message: 'Critical CVE detected in running container image', cluster: 'prod-east-1' },
      { id: 'evt-006', timestamp: new Date(Date.now() - DEMO_6_MIN_MS).toISOString(), source: 'falco', severity: 'low', category: 'runtime', message: 'Read of sensitive file /etc/shadow in container', cluster: 'dev-1' },
      { id: 'evt-007', timestamp: new Date(Date.now() - DEMO_7_MIN_MS).toISOString(), source: 'opa', severity: 'info', category: 'policy', message: 'Pod admission policy evaluated: 3 constraints checked', cluster: 'prod-west-2' },
      { id: 'evt-008', timestamp: new Date(Date.now() - DEMO_8_MIN_MS).toISOString(), source: 'kube-apiserver', severity: 'high', category: 'auth', message: 'Failed OIDC token validation from external identity provider', cluster: 'prod-east-1' },
    ])
  }),

  http.get('/api/v1/compliance/siem/alerts', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'alrt-001', name: 'Suspicious Process Execution', severity: 'critical', status: 'active', source: 'falco', triggered_at: new Date(Date.now() - DEMO_30_SEC_MS).toISOString(), correlated_events: 5 },
      { id: 'alrt-002', name: 'Unauthorized API Access', severity: 'high', status: 'active', source: 'kube-apiserver', triggered_at: new Date(Date.now() - DEMO_90_SEC_MS).toISOString(), correlated_events: 3 },
      { id: 'alrt-003', name: 'Network Policy Violation', severity: 'high', status: 'acknowledged', source: 'calico', triggered_at: new Date(Date.now() - DEMO_150_SEC_MS).toISOString(), correlated_events: 8 },
      { id: 'alrt-004', name: 'Image Vulnerability Detected', severity: 'medium', status: 'active', source: 'trivy', triggered_at: new Date(Date.now() - DEMO_10_MIN_MS).toISOString(), correlated_events: 2 },
      { id: 'alrt-005', name: 'Privilege Escalation Attempt', severity: 'critical', status: 'resolved', source: 'falco', triggered_at: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), correlated_events: 12 },
      { id: 'alrt-006', name: 'OIDC Token Validation Failure', severity: 'medium', status: 'active', source: 'kube-apiserver', triggered_at: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), correlated_events: 4 },
    ])
  }),

  http.get('/api/v1/compliance/siem/summary', async () => {
    await delay(100)
    return HttpResponse.json({
      total_events: 14832,
      events_last_24h: 2847,
      total_alerts: 23,
      active_alerts: 8,
      critical_alerts: 3,
      high_alerts: 7,
      medium_alerts: 9,
      low_alerts: 4,
      top_sources: [
        { source: 'falco', count: 1243 },
        { source: 'kube-apiserver', count: 876 },
        { source: 'calico', count: 412 },
        { source: 'trivy', count: 198 },
        { source: 'opa', count: 118 },
      ],
      ingestion_rate: 42,
    })
  }),

  // ── Incident Response mock handlers ─────────────────────────────────

  http.get('/api/v1/compliance/incidents', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'INC-001', title: 'Unauthorized container escape in prod-east-1', severity: 'critical', status: 'investigating', assignee: 'alice@acme.com', created_at: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), updated_at: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), escalation_level: 2, cluster: 'prod-east-1', playbook_id: 'pb-container-escape' },
      { id: 'INC-002', title: 'Mass pod eviction in staging cluster', severity: 'high', status: 'mitigating', assignee: 'bob@acme.com', created_at: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), updated_at: new Date(Date.now() - DEMO_15_MIN_MS).toISOString(), escalation_level: 1, cluster: 'staging-1', playbook_id: 'pb-pod-eviction' },
      { id: 'INC-003', title: 'Leaked service account token detected', severity: 'critical', status: 'open', assignee: 'charlie@acme.com', created_at: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), updated_at: new Date(Date.now() - DEMO_10_MIN_MS).toISOString(), escalation_level: 3, cluster: 'prod-west-2', playbook_id: null },
      { id: 'INC-004', title: 'TLS certificate expiry in 48h', severity: 'medium', status: 'investigating', assignee: 'dana@acme.com', created_at: new Date(Date.now() - DEMO_4_HOUR_MS).toISOString(), updated_at: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), escalation_level: 1, cluster: 'prod-east-1', playbook_id: 'pb-cert-renewal' },
      { id: 'INC-005', title: 'DNS resolution failures in dev cluster', severity: 'low', status: 'resolved', assignee: 'eve@acme.com', created_at: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), updated_at: new Date(Date.now() - DEMO_12_HOUR_MS).toISOString(), escalation_level: 0, cluster: 'dev-1', playbook_id: null },
    ])
  }),

  http.get('/api/v1/compliance/incidents/metrics', async () => {
    await delay(100)
    return HttpResponse.json({
      total_incidents: 47,
      active_incidents: 4,
      resolved_last_30d: 18,
      mttr_hours: 4.2,
      mttr_trend: 'improving',
      escalation_rate: 23,
      by_severity: { critical: 8, high: 14, medium: 17, low: 8 },
      by_status: { open: 2, investigating: 5, mitigating: 3, resolved: 18, closed: 19 },
    })
  }),

  http.get('/api/v1/compliance/incidents/playbooks', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'pb-container-escape', name: 'Container Escape Response', description: 'Isolate compromised pod, capture forensic data, rotate secrets', last_executed: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), execution_count: 7, avg_resolution_min: 45, status: 'active', steps: 12 },
      { id: 'pb-pod-eviction', name: 'Mass Pod Eviction', description: 'Investigate node pressure, redistribute workloads, scale cluster', last_executed: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), execution_count: 14, avg_resolution_min: 30, status: 'active', steps: 8 },
      { id: 'pb-cert-renewal', name: 'Certificate Renewal', description: 'Renew TLS certificates, update secrets, rolling restart services', last_executed: new Date(Date.now() - DEMO_2_DAY_MS).toISOString(), execution_count: 22, avg_resolution_min: 15, status: 'active', steps: 6 },
      { id: 'pb-secret-rotation', name: 'Secret Rotation', description: 'Rotate compromised secrets across all dependent services', last_executed: new Date(Date.now() - DEMO_1_WEEK_MS).toISOString(), execution_count: 5, avg_resolution_min: 60, status: 'active', steps: 15 },
      { id: 'pb-ddos-response', name: 'DDoS Response', description: 'Enable rate limiting, scale ingress, activate WAF rules', last_executed: new Date(Date.now() - DEMO_30_DAY_MS).toISOString(), execution_count: 2, avg_resolution_min: 90, status: 'draft', steps: 10 },
    ])
  }),

  // ── Threat Intelligence mock handlers ───────────────────────────────

  http.get('/api/v1/compliance/threat-intel/feeds', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'feed-001', name: 'MITRE ATT&CK', provider: 'MITRE Corporation', status: 'active', last_updated: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), indicators_count: 14500, category: 'TTPs' },
      { id: 'feed-002', name: 'AlienVault OTX', provider: 'AT&T Cybersecurity', status: 'active', last_updated: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), indicators_count: 89200, category: 'IOCs' },
      { id: 'feed-003', name: 'Abuse.ch URLhaus', provider: 'abuse.ch', status: 'active', last_updated: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), indicators_count: 42100, category: 'Malware' },
      { id: 'feed-004', name: 'CISA KEV', provider: 'CISA', status: 'active', last_updated: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), indicators_count: 1120, category: 'Vulnerabilities' },
      { id: 'feed-005', name: 'Custom Internal Feed', provider: 'Internal SOC', status: 'stale', last_updated: new Date(Date.now() - DEMO_1_WEEK_MS).toISOString(), indicators_count: 340, category: 'Internal' },
      { id: 'feed-006', name: 'PhishTank', provider: 'OpenDNS', status: 'active', last_updated: new Date(Date.now() - DEMO_4_HOUR_MS).toISOString(), indicators_count: 28700, category: 'Phishing' },
    ])
  }),

  http.get('/api/v1/compliance/threat-intel/iocs', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'ioc-001', ioc_type: 'ip', indicator: '198.51.100.42', feed_name: 'AlienVault OTX', severity: 'critical', matched_resource: 'pod/api-gateway', cluster: 'prod-east-1', detected_at: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), status: 'active' },
      { id: 'ioc-002', ioc_type: 'domain', indicator: 'malware-c2.example.net', feed_name: 'Abuse.ch URLhaus', severity: 'critical', matched_resource: 'pod/worker-processor', cluster: 'prod-east-1', detected_at: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), status: 'active' },
      { id: 'ioc-003', ioc_type: 'hash', indicator: 'a1b2c3d4e5f6...', feed_name: 'AlienVault OTX', severity: 'high', matched_resource: 'image/nginx:1.24', cluster: 'prod-west-2', detected_at: new Date(Date.now() - DEMO_4_HOUR_MS).toISOString(), status: 'mitigated' },
      { id: 'ioc-004', ioc_type: 'ip', indicator: '203.0.113.99', feed_name: 'CISA KEV', severity: 'high', matched_resource: 'service/ingress-nginx', cluster: 'staging-1', detected_at: new Date(Date.now() - DEMO_8_HOUR_MS).toISOString(), status: 'active' },
      { id: 'ioc-005', ioc_type: 'url', indicator: 'http://phish.example.com/login', feed_name: 'PhishTank', severity: 'medium', matched_resource: 'pod/web-frontend', cluster: 'prod-east-1', detected_at: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), status: 'false_positive' },
      { id: 'ioc-006', ioc_type: 'domain', indicator: 'crypto-miner.example.org', feed_name: 'Abuse.ch URLhaus', severity: 'high', matched_resource: 'pod/batch-worker', cluster: 'dev-1', detected_at: new Date(Date.now() - DEMO_2_DAY_MS).toISOString(), status: 'mitigated' },
    ])
  }),

  http.get('/api/v1/compliance/threat-intel/summary', async () => {
    await delay(100)
    return HttpResponse.json({
      total_feeds: 6,
      active_feeds: 5,
      total_indicators: 175960,
      total_matches: 23,
      active_matches: 8,
      risk_score: 42,
      critical_matches: 3,
      high_matches: 7,
      medium_matches: 9,
      low_matches: 4,
      top_ioc_types: [
        { type: 'ip', count: 9 },
        { type: 'domain', count: 6 },
        { type: 'hash', count: 4 },
        { type: 'url', count: 3 },
        { type: 'email', count: 1 },
      ],
      vulnerability_correlation: 73,
    })
  }),

  // Card templates
  // ── Epic 6: Supply Chain Security ─────────────────────────────────────

  // SBOM endpoints
  http.get('/api/v1/compliance/sbom/packages', async () => {
    await delay(100)
    return HttpResponse.json([
      { name: '@kubernetes/client-node', version: '0.20.0', license: 'Apache-2.0', ecosystem: 'npm', vulnerabilities: 0, risk: 'none' },
      { name: 'express', version: '4.18.2', license: 'MIT', ecosystem: 'npm', vulnerabilities: 1, risk: 'medium' },
      { name: 'lodash', version: '4.17.21', license: 'MIT', ecosystem: 'npm', vulnerabilities: 0, risk: 'none' },
      { name: 'axios', version: '1.6.2', license: 'MIT', ecosystem: 'npm', vulnerabilities: 2, risk: 'high' },
      { name: 'golang.org/x/net', version: '0.19.0', license: 'BSD-3-Clause', ecosystem: 'go', vulnerabilities: 1, risk: 'critical' },
      { name: 'github.com/gin-gonic/gin', version: '1.9.1', license: 'MIT', ecosystem: 'go', vulnerabilities: 0, risk: 'none' },
      { name: 'flask', version: '3.0.0', license: 'BSD-3-Clause', ecosystem: 'pip', vulnerabilities: 0, risk: 'none' },
      { name: 'requests', version: '2.31.0', license: 'Apache-2.0', ecosystem: 'pip', vulnerabilities: 1, risk: 'low' },
      { name: 'containerd', version: '1.7.11', license: 'Apache-2.0', ecosystem: 'go', vulnerabilities: 3, risk: 'critical' },
      { name: 'openssl', version: '3.1.4', license: 'Apache-2.0', ecosystem: 'system', vulnerabilities: 1, risk: 'high' },
    ])
  }),

  http.get('/api/v1/compliance/sbom/vulnerabilities', async () => {
    await delay(100)
    return HttpResponse.json([
      { id: 'vuln-1', package_name: 'golang.org/x/net', severity: 'critical', cve: 'CVE-2023-44487', fixed_version: '0.20.0', status: 'open' },
      { id: 'vuln-2', package_name: 'containerd', severity: 'critical', cve: 'CVE-2023-47108', fixed_version: '1.7.12', status: 'open' },
      { id: 'vuln-3', package_name: 'containerd', severity: 'high', cve: 'CVE-2023-45142', fixed_version: '1.7.12', status: 'patched' },
      { id: 'vuln-4', package_name: 'axios', severity: 'high', cve: 'CVE-2023-45857', fixed_version: '1.6.3', status: 'open' },
      { id: 'vuln-5', package_name: 'axios', severity: 'medium', cve: 'CVE-2023-26159', fixed_version: '1.6.4', status: 'ignored' },
      { id: 'vuln-6', package_name: 'express', severity: 'medium', cve: 'CVE-2024-29041', fixed_version: '4.19.0', status: 'open' },
      { id: 'vuln-7', package_name: 'openssl', severity: 'high', cve: 'CVE-2023-5678', fixed_version: '3.1.5', status: 'patched' },
      { id: 'vuln-8', package_name: 'containerd', severity: 'medium', cve: 'CVE-2023-47106', fixed_version: '1.7.12', status: 'open' },
      { id: 'vuln-9', package_name: 'requests', severity: 'low', cve: 'CVE-2023-32681', fixed_version: '2.31.1', status: 'patched' },
    ])
  }),

  http.get('/api/v1/compliance/sbom/summary', async () => {
    await delay(100)
    return HttpResponse.json({
      total_packages: 342,
      total_vulnerabilities: 9,
      critical_vulns: 2,
      high_vulns: 3,
      medium_vulns: 3,
      low_vulns: 1,
      license_compliant: 298,
      license_non_compliant: 12,
      license_unknown: 32,
      ecosystems: [
        { name: 'npm', count: 156 },
        { name: 'go', count: 98 },
        { name: 'pip', count: 64 },
        { name: 'system', count: 24 },
      ],
      scan_status: 'completed',
      last_scan: '2025-01-15T10:30:00Z',
    })
  }),

  // Sigstore endpoints
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

  // SLSA endpoints
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

]
}
