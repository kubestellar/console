const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_30_DAY_MS = 30 * DAY_MS;

const THIRTY_SECONDS_MS = 30 * SECOND_MS;
const NINETY_SECONDS_MS = 90 * SECOND_MS;
const ONE_HUNDRED_FIFTY_SECONDS_MS = 150 * SECOND_MS;
const ONE_MINUTE_MS = MINUTE_MS;
const TWO_MINUTES_MS = 2 * MINUTE_MS;
const THREE_MINUTES_MS = 3 * MINUTE_MS;
const FOUR_MINUTES_MS = 4 * MINUTE_MS;
const FIVE_MINUTES_MS = 5 * MINUTE_MS;
const SIX_MINUTES_MS = 6 * MINUTE_MS;
const SEVEN_MINUTES_MS = 7 * MINUTE_MS;
const EIGHT_MINUTES_MS = 8 * MINUTE_MS;
const TEN_MINUTES_MS = 10 * MINUTE_MS;
const FIFTEEN_MINUTES_MS = 15 * MINUTE_MS;
const THIRTY_MINUTES_MS = 30 * MINUTE_MS;
const NINETY_MINUTES_MS = 90 * MINUTE_MS;
const ONE_HOUR_MS = HOUR_MS;
const TWO_HOURS_MS = 2 * HOUR_MS;
const FOUR_HOURS_MS = 4 * HOUR_MS;
const EIGHT_HOURS_MS = 8 * HOUR_MS;
const TWELVE_HOURS_MS = 12 * HOUR_MS;
const ONE_DAY_MS = DAY_MS;
const TWO_DAYS_MS = 2 * DAY_MS;
const ONE_WEEK_MS = WEEK_MS;
const THIRTY_DAYS_MS = MONTH_30_DAY_MS;

export function getSiemEventsDemoData() {
  const now = Date.now();
  return [
    { id: "evt-001", timestamp: new Date(now - ONE_MINUTE_MS).toISOString(), source: "falco", severity: "critical", category: "runtime", message: "Unexpected process spawned in container nginx-proxy", cluster: "prod-east-1" },
    { id: "evt-002", timestamp: new Date(now - TWO_MINUTES_MS).toISOString(), source: "auditd", severity: "high", category: "access", message: "Unauthorized kubectl exec attempt on kube-system namespace", cluster: "prod-east-1" },
    { id: "evt-003", timestamp: new Date(now - THREE_MINUTES_MS).toISOString(), source: "kube-apiserver", severity: "medium", category: "auth", message: "ServiceAccount token used from unexpected IP range", cluster: "prod-west-2" },
    { id: "evt-004", timestamp: new Date(now - FOUR_MINUTES_MS).toISOString(), source: "calico", severity: "high", category: "network", message: "Network policy violation: egress to blocked CIDR detected", cluster: "staging-1" },
    { id: "evt-005", timestamp: new Date(now - FIVE_MINUTES_MS).toISOString(), source: "trivy", severity: "medium", category: "vulnerability", message: "Critical CVE detected in running container image", cluster: "prod-east-1" },
    { id: "evt-006", timestamp: new Date(now - SIX_MINUTES_MS).toISOString(), source: "falco", severity: "low", category: "runtime", message: "Read of sensitive file /etc/shadow in container", cluster: "dev-1" },
    { id: "evt-007", timestamp: new Date(now - SEVEN_MINUTES_MS).toISOString(), source: "opa", severity: "info", category: "policy", message: "Pod admission policy evaluated: 3 constraints checked", cluster: "prod-west-2" },
    { id: "evt-008", timestamp: new Date(now - EIGHT_MINUTES_MS).toISOString(), source: "kube-apiserver", severity: "high", category: "auth", message: "Failed OIDC token validation from external identity provider", cluster: "prod-east-1" },
  ];
}

export function getSiemAlertsDemoData() {
  const now = Date.now();
  return [
    { id: "alrt-001", name: "Suspicious Process Execution", severity: "critical", status: "active", source: "falco", triggered_at: new Date(now - THIRTY_SECONDS_MS).toISOString(), correlated_events: 5 },
    { id: "alrt-002", name: "Unauthorized API Access", severity: "high", status: "active", source: "kube-apiserver", triggered_at: new Date(now - NINETY_SECONDS_MS).toISOString(), correlated_events: 3 },
    { id: "alrt-003", name: "Network Policy Violation", severity: "high", status: "acknowledged", source: "calico", triggered_at: new Date(now - ONE_HUNDRED_FIFTY_SECONDS_MS).toISOString(), correlated_events: 8 },
    { id: "alrt-004", name: "Image Vulnerability Detected", severity: "medium", status: "active", source: "trivy", triggered_at: new Date(now - TEN_MINUTES_MS).toISOString(), correlated_events: 2 },
    { id: "alrt-005", name: "Privilege Escalation Attempt", severity: "critical", status: "resolved", source: "falco", triggered_at: new Date(now - ONE_HOUR_MS).toISOString(), correlated_events: 12 },
    { id: "alrt-006", name: "OIDC Token Validation Failure", severity: "medium", status: "active", source: "kube-apiserver", triggered_at: new Date(now - TWO_HOURS_MS).toISOString(), correlated_events: 4 },
  ];
}

export function getSiemSummaryDemoData() {
  return {
    total_events: 14_832,
    events_last_24h: 2_847,
    total_alerts: 23,
    active_alerts: 8,
    critical_alerts: 3,
    high_alerts: 7,
    medium_alerts: 9,
    low_alerts: 4,
    top_sources: [
      { source: "falco", count: 1_243 },
      { source: "kube-apiserver", count: 876 },
      { source: "calico", count: 412 },
      { source: "trivy", count: 198 },
      { source: "opa", count: 118 },
    ],
    ingestion_rate: 42,
  };
}

export function getIncidentsDemoData() {
  const now = Date.now();
  return [
    { id: "INC-001", title: "Unauthorized container escape in prod-east-1", severity: "critical", status: "investigating", assignee: "alice@acme.com", created_at: new Date(now - ONE_HOUR_MS).toISOString(), updated_at: new Date(now - THIRTY_MINUTES_MS).toISOString(), escalation_level: 2, cluster: "prod-east-1", playbook_id: "pb-container-escape" },
    { id: "INC-002", title: "Mass pod eviction in staging cluster", severity: "high", status: "mitigating", assignee: "bob@acme.com", created_at: new Date(now - TWO_HOURS_MS).toISOString(), updated_at: new Date(now - FIFTEEN_MINUTES_MS).toISOString(), escalation_level: 1, cluster: "staging-1", playbook_id: "pb-pod-eviction" },
    { id: "INC-003", title: "Leaked service account token detected", severity: "critical", status: "open", assignee: "charlie@acme.com", created_at: new Date(now - THIRTY_MINUTES_MS).toISOString(), updated_at: new Date(now - TEN_MINUTES_MS).toISOString(), escalation_level: 3, cluster: "prod-west-2", playbook_id: null },
    { id: "INC-004", title: "TLS certificate expiry in 48h", severity: "medium", status: "investigating", assignee: "dana@acme.com", created_at: new Date(now - FOUR_HOURS_MS).toISOString(), updated_at: new Date(now - ONE_HOUR_MS).toISOString(), escalation_level: 1, cluster: "prod-east-1", playbook_id: "pb-cert-renewal" },
    { id: "INC-005", title: "DNS resolution failures in dev cluster", severity: "low", status: "resolved", assignee: "eve@acme.com", created_at: new Date(now - ONE_DAY_MS).toISOString(), updated_at: new Date(now - TWELVE_HOURS_MS).toISOString(), escalation_level: 0, cluster: "dev-1", playbook_id: null },
  ];
}

export function getIncidentMetricsDemoData() {
  return {
    total_incidents: 47,
    active_incidents: 4,
    resolved_last_30d: 18,
    mttr_hours: 4.2,
    mttr_trend: "improving",
    escalation_rate: 23,
    by_severity: { critical: 8, high: 14, medium: 17, low: 8 },
    by_status: { open: 2, investigating: 5, mitigating: 3, resolved: 18, closed: 19 },
  };
}

export function getIncidentPlaybooksDemoData() {
  const now = Date.now();
  return [
    { id: "pb-container-escape", name: "Container Escape Response", description: "Isolate compromised pod, capture forensic data, rotate secrets", last_executed: new Date(now - ONE_HOUR_MS).toISOString(), execution_count: 7, avg_resolution_min: 45, status: "active", steps: 12 },
    { id: "pb-pod-eviction", name: "Mass Pod Eviction", description: "Investigate node pressure, redistribute workloads, scale cluster", last_executed: new Date(now - ONE_DAY_MS).toISOString(), execution_count: 14, avg_resolution_min: 30, status: "active", steps: 8 },
    { id: "pb-cert-renewal", name: "Certificate Renewal", description: "Renew TLS certificates, update secrets, rolling restart services", last_executed: new Date(now - TWO_DAYS_MS).toISOString(), execution_count: 22, avg_resolution_min: 15, status: "active", steps: 6 },
    { id: "pb-secret-rotation", name: "Secret Rotation", description: "Rotate compromised secrets across all dependent services", last_executed: new Date(now - ONE_WEEK_MS).toISOString(), execution_count: 5, avg_resolution_min: 60, status: "active", steps: 15 },
    { id: "pb-ddos-response", name: "DDoS Response", description: "Enable rate limiting, scale ingress, activate WAF rules", last_executed: new Date(now - THIRTY_DAYS_MS).toISOString(), execution_count: 2, avg_resolution_min: 90, status: "draft", steps: 10 },
  ];
}

export function getThreatIntelFeedsDemoData() {
  const now = Date.now();
  return [
    { id: "feed-001", name: "MITRE ATT&CK", provider: "MITRE Corporation", status: "active", last_updated: new Date(now - ONE_HOUR_MS).toISOString(), indicators_count: 14_500, category: "TTPs" },
    { id: "feed-002", name: "AlienVault OTX", provider: "AT&T Cybersecurity", status: "active", last_updated: new Date(now - TWO_HOURS_MS).toISOString(), indicators_count: 89_200, category: "IOCs" },
    { id: "feed-003", name: "Abuse.ch URLhaus", provider: "abuse.ch", status: "active", last_updated: new Date(now - THIRTY_MINUTES_MS).toISOString(), indicators_count: 42_100, category: "Malware" },
    { id: "feed-004", name: "CISA KEV", provider: "CISA", status: "active", last_updated: new Date(now - ONE_DAY_MS).toISOString(), indicators_count: 1_120, category: "Vulnerabilities" },
    { id: "feed-005", name: "Custom Internal Feed", provider: "Internal SOC", status: "stale", last_updated: new Date(now - ONE_WEEK_MS).toISOString(), indicators_count: 340, category: "Internal" },
    { id: "feed-006", name: "PhishTank", provider: "OpenDNS", status: "active", last_updated: new Date(now - FOUR_HOURS_MS).toISOString(), indicators_count: 28_700, category: "Phishing" },
  ];
}

export function getThreatIntelIocsDemoData() {
  const now = Date.now();
  return [
    { id: "ioc-001", ioc_type: "ip", indicator: "198.51.100.42", feed_name: "AlienVault OTX", severity: "critical", matched_resource: "pod/api-gateway", cluster: "prod-east-1", detected_at: new Date(now - ONE_HOUR_MS).toISOString(), status: "active" },
    { id: "ioc-002", ioc_type: "domain", indicator: "malware-c2.example.net", feed_name: "Abuse.ch URLhaus", severity: "critical", matched_resource: "pod/worker-processor", cluster: "prod-east-1", detected_at: new Date(now - TWO_HOURS_MS).toISOString(), status: "active" },
    { id: "ioc-003", ioc_type: "hash", indicator: "a1b2c3d4e5f6...", feed_name: "AlienVault OTX", severity: "high", matched_resource: "image/nginx:1.24", cluster: "prod-west-2", detected_at: new Date(now - FOUR_HOURS_MS).toISOString(), status: "mitigated" },
    { id: "ioc-004", ioc_type: "ip", indicator: "203.0.113.99", feed_name: "CISA KEV", severity: "high", matched_resource: "service/ingress-nginx", cluster: "staging-1", detected_at: new Date(now - EIGHT_HOURS_MS).toISOString(), status: "active" },
    { id: "ioc-005", ioc_type: "url", indicator: "http://phish.example.com/login", feed_name: "PhishTank", severity: "medium", matched_resource: "pod/web-frontend", cluster: "prod-east-1", detected_at: new Date(now - ONE_DAY_MS).toISOString(), status: "false_positive" },
    { id: "ioc-006", ioc_type: "domain", indicator: "crypto-miner.example.org", feed_name: "Abuse.ch URLhaus", severity: "high", matched_resource: "pod/batch-worker", cluster: "dev-1", detected_at: new Date(now - TWO_DAYS_MS).toISOString(), status: "mitigated" },
  ];
}

export function getThreatIntelSummaryDemoData() {
  return {
    total_feeds: 6,
    active_feeds: 5,
    total_indicators: 175_960,
    total_matches: 23,
    active_matches: 8,
    risk_score: 42,
    critical_matches: 3,
    high_matches: 7,
    medium_matches: 9,
    low_matches: 4,
    top_ioc_types: [
      { type: "ip", count: 9 },
      { type: "domain", count: 6 },
      { type: "hash", count: 4 },
      { type: "url", count: 3 },
      { type: "email", count: 1 },
    ],
    vulnerability_correlation: 73,
  };
}

export function getRiskMatrixRisksDemoData() {
  return [
    { id: "RSK-001", name: "Cloud provider outage", category: "Technology", likelihood: 3, impact: 5, score: 15, owner: "CTO", status: "Open", last_review: "2025-01-10T00:00:00Z" },
    { id: "RSK-002", name: "Data breach via supply chain", category: "Technology", likelihood: 4, impact: 5, score: 20, owner: "CISO", status: "Mitigating", last_review: "2025-01-08T00:00:00Z" },
    { id: "RSK-003", name: "Regulatory non-compliance fine", category: "Compliance", likelihood: 2, impact: 5, score: 10, owner: "CCO", status: "Open", last_review: "2025-01-05T00:00:00Z" },
    { id: "RSK-004", name: "Key personnel departure", category: "Operational", likelihood: 3, impact: 4, score: 12, owner: "CHRO", status: "Accepted", last_review: "2025-01-12T00:00:00Z" },
    { id: "RSK-005", name: "Market share erosion", category: "Strategic", likelihood: 3, impact: 3, score: 9, owner: "CSO", status: "Open", last_review: "2025-01-06T00:00:00Z" },
    { id: "RSK-006", name: "Currency exchange volatility", category: "Financial", likelihood: 4, impact: 3, score: 12, owner: "CFO", status: "Mitigating", last_review: "2025-01-11T00:00:00Z" },
    { id: "RSK-007", name: "Negative media coverage", category: "Reputational", likelihood: 2, impact: 4, score: 8, owner: "CMO", status: "Open", last_review: "2025-01-09T00:00:00Z" },
    { id: "RSK-008", name: "Kubernetes cluster compromise", category: "Technology", likelihood: 3, impact: 5, score: 15, owner: "CISO", status: "Mitigating", last_review: "2025-01-13T00:00:00Z" },
    { id: "RSK-009", name: "Third-party vendor bankruptcy", category: "Operational", likelihood: 2, impact: 3, score: 6, owner: "CPO", status: "Accepted", last_review: "2025-01-07T00:00:00Z" },
    { id: "RSK-010", name: "Insider threat data exfiltration", category: "Technology", likelihood: 2, impact: 5, score: 10, owner: "CISO", status: "Open", last_review: "2025-01-14T00:00:00Z" },
    { id: "RSK-011", name: "Pandemic business disruption", category: "Operational", likelihood: 1, impact: 5, score: 5, owner: "COO", status: "Closed", last_review: "2024-12-20T00:00:00Z" },
    { id: "RSK-012", name: "Interest rate increase", category: "Financial", likelihood: 4, impact: 2, score: 8, owner: "CFO", status: "Accepted", last_review: "2025-01-04T00:00:00Z" },
    { id: "RSK-013", name: "Supply chain disruption", category: "Operational", likelihood: 3, impact: 4, score: 12, owner: "COO", status: "Mitigating", last_review: "2025-01-10T00:00:00Z" },
    { id: "RSK-014", name: "Patent infringement claim", category: "Strategic", likelihood: 2, impact: 4, score: 8, owner: "CLO", status: "Open", last_review: "2025-01-03T00:00:00Z" },
    { id: "RSK-015", name: "Failed product launch", category: "Strategic", likelihood: 3, impact: 3, score: 9, owner: "CPO", status: "Open", last_review: "2025-01-02T00:00:00Z" },
    { id: "RSK-016", name: "GDPR violation", category: "Compliance", likelihood: 2, impact: 5, score: 10, owner: "DPO", status: "Mitigating", last_review: "2025-01-11T00:00:00Z" },
    { id: "RSK-017", name: "Critical CVE in base images", category: "Technology", likelihood: 4, impact: 4, score: 16, owner: "CISO", status: "Mitigating", last_review: "2025-01-14T00:00:00Z" },
    { id: "RSK-018", name: "Customer data loss", category: "Reputational", likelihood: 1, impact: 5, score: 5, owner: "CISO", status: "Mitigating", last_review: "2025-01-12T00:00:00Z" },
  ];
}

export function getRiskMatrixHeatmapDemoData() {
  return [
    { likelihood: 4, impact: 5, count: 1, risks: ["RSK-002"] },
    { likelihood: 4, impact: 4, count: 1, risks: ["RSK-017"] },
    { likelihood: 4, impact: 3, count: 1, risks: ["RSK-006"] },
    { likelihood: 4, impact: 2, count: 1, risks: ["RSK-012"] },
    { likelihood: 3, impact: 5, count: 2, risks: ["RSK-001", "RSK-008"] },
    { likelihood: 3, impact: 4, count: 2, risks: ["RSK-004", "RSK-013"] },
    { likelihood: 3, impact: 3, count: 2, risks: ["RSK-005", "RSK-015"] },
    { likelihood: 2, impact: 5, count: 3, risks: ["RSK-003", "RSK-010", "RSK-016"] },
    { likelihood: 2, impact: 4, count: 2, risks: ["RSK-007", "RSK-014"] },
    { likelihood: 2, impact: 3, count: 1, risks: ["RSK-009"] },
    { likelihood: 1, impact: 5, count: 2, risks: ["RSK-011", "RSK-018"] },
  ];
}

export function getRiskMatrixSummaryDemoData() {
  return {
    total_risks: 18,
    critical: 2,
    high: 3,
    medium: 7,
    low: 6,
    trend_direction: "down",
    trend_percentage: 8,
    evaluated_at: new Date().toISOString(),
  };
}

export function getRiskRegisterRisksDemoData() {
  return [
    { id: "RSK-001", name: "Cloud provider outage", description: "Single cloud provider failure causes widespread service disruption across production clusters.", category: "Technology", likelihood: 3, impact: 5, score: 15, owner: "CTO", status: "Open", last_review: "2025-01-10T00:00:00Z", next_review: "2025-04-10T00:00:00Z", mitigation_plan: "Implement multi-cloud strategy with automatic failover. Deploy across AWS, GCP, and Azure with cross-region replication.", controls: ["Multi-region deployment", "Auto-failover", "DR playbook"], created_at: "2024-06-15T00:00:00Z" },
    { id: "RSK-002", name: "Data breach via supply chain", description: "Compromised third-party dependency introduces vulnerability enabling data exfiltration.", category: "Technology", likelihood: 4, impact: 5, score: 20, owner: "CISO", status: "Mitigating", last_review: "2025-01-08T00:00:00Z", next_review: "2025-02-08T00:00:00Z", mitigation_plan: "SBOM scanning on all images, Sigstore verification required for production. SLSA L3 for critical builds.", controls: ["SBOM scanning", "Sigstore verification", "SLSA L3", "Dependency review"], created_at: "2024-03-10T00:00:00Z" },
    { id: "RSK-003", name: "Regulatory non-compliance fine", description: "Failure to meet SOC 2 or PCI-DSS requirements leading to regulatory penalties.", category: "Compliance", likelihood: 2, impact: 5, score: 10, owner: "CCO", status: "Open", last_review: "2025-01-05T00:00:00Z", next_review: "2025-03-05T00:00:00Z", mitigation_plan: "Continuous compliance monitoring with automated evidence collection. Quarterly audits.", controls: ["Compliance dashboard", "Automated evidence", "Quarterly audits"], created_at: "2024-01-20T00:00:00Z" },
    { id: "RSK-004", name: "Key personnel departure", description: "Loss of critical engineering or security staff creates knowledge gaps.", category: "Operational", likelihood: 3, impact: 4, score: 12, owner: "CHRO", status: "Accepted", last_review: "2025-01-12T00:00:00Z", next_review: "2025-04-12T00:00:00Z", mitigation_plan: "Cross-training program, comprehensive documentation, competitive retention packages.", controls: ["Knowledge base", "Cross-training", "Retention packages"], created_at: "2024-05-01T00:00:00Z" },
    { id: "RSK-005", name: "Market share erosion", description: "Competitors launching similar platforms reduces customer acquisition and retention.", category: "Strategic", likelihood: 3, impact: 3, score: 9, owner: "CSO", status: "Open", last_review: "2025-01-06T00:00:00Z", next_review: "2025-04-06T00:00:00Z", mitigation_plan: "Accelerate feature development, enhance enterprise integrations, strengthen community.", controls: ["Competitive analysis", "Feature roadmap", "Community growth"], created_at: "2024-07-15T00:00:00Z" },
    { id: "RSK-006", name: "Currency exchange volatility", description: "Unfavorable exchange rates impacting international revenue and costs.", category: "Financial", likelihood: 4, impact: 3, score: 12, owner: "CFO", status: "Mitigating", last_review: "2025-01-11T00:00:00Z", next_review: "2025-03-11T00:00:00Z", mitigation_plan: "Hedging strategy for major currency pairs, invoice in local currencies where possible.", controls: ["FX hedging", "Multi-currency billing", "Treasury management"], created_at: "2024-09-01T00:00:00Z" },
    { id: "RSK-007", name: "Negative media coverage", description: "Public relations incident damages brand and customer trust.", category: "Reputational", likelihood: 2, impact: 4, score: 8, owner: "CMO", status: "Open", last_review: "2025-01-09T00:00:00Z", next_review: "2025-04-09T00:00:00Z", mitigation_plan: "Crisis communication plan, media monitoring, proactive transparency reports.", controls: ["Crisis comms plan", "Media monitoring", "PR team"], created_at: "2024-04-20T00:00:00Z" },
    { id: "RSK-008", name: "Kubernetes cluster compromise", description: "Unauthorized access to production clusters enabling lateral movement.", category: "Technology", likelihood: 3, impact: 5, score: 15, owner: "CISO", status: "Mitigating", last_review: "2025-01-13T00:00:00Z", next_review: "2025-02-13T00:00:00Z", mitigation_plan: "Zero-trust architecture, RBAC audit, network policies, runtime security with Falco.", controls: ["RBAC audit", "Network policies", "Falco alerts", "Pod security standards"], created_at: "2024-02-15T00:00:00Z" },
    { id: "RSK-009", name: "Third-party vendor bankruptcy", description: "Critical vendor going out of business disrupts service delivery.", category: "Operational", likelihood: 2, impact: 3, score: 6, owner: "CPO", status: "Accepted", last_review: "2025-01-07T00:00:00Z", next_review: "2025-07-07T00:00:00Z", mitigation_plan: "Vendor diversity strategy, escrow agreements for source code, contract exit clauses.", controls: ["Vendor diversity", "Code escrow", "Exit clauses"], created_at: "2024-08-10T00:00:00Z" },
    { id: "RSK-010", name: "Insider threat data exfiltration", description: "Malicious insider copies sensitive data for unauthorized purposes.", category: "Technology", likelihood: 2, impact: 5, score: 10, owner: "CISO", status: "Open", last_review: "2025-01-14T00:00:00Z", next_review: "2025-03-14T00:00:00Z", mitigation_plan: "DLP policies, SIEM monitoring, least-privilege access, session recording.", controls: ["DLP", "SIEM", "Least privilege", "Session recording"], created_at: "2024-06-01T00:00:00Z" },
    { id: "RSK-016", name: "GDPR violation", description: "Non-compliance with EU data protection regulation resulting in fines up to 4% of revenue.", category: "Compliance", likelihood: 2, impact: 5, score: 10, owner: "DPO", status: "Mitigating", last_review: "2025-01-11T00:00:00Z", next_review: "2025-02-11T00:00:00Z", mitigation_plan: "Data residency controls, consent management, DPIA for all new processing, breach notification workflow.", controls: ["Data residency", "Consent management", "DPIA", "Breach notification"], created_at: "2024-01-05T00:00:00Z" },
    { id: "RSK-017", name: "Critical CVE in base images", description: "Zero-day or critical vulnerability in container base images deployed across fleet.", category: "Technology", likelihood: 4, impact: 4, score: 16, owner: "CISO", status: "Mitigating", last_review: "2025-01-14T00:00:00Z", next_review: "2025-02-14T00:00:00Z", mitigation_plan: "Automated image scanning in CI/CD, distroless base images, rapid patching SLA of 24h for critical CVEs.", controls: ["Image scanning", "Distroless images", "Patch SLA", "Admission controllers"], created_at: "2024-04-01T00:00:00Z" },
  ];
}

export function getRiskRegisterCategoriesDemoData() {
  return [
    { category: "Operational", count: 4, avg_score: 8.8, open: 1 },
    { category: "Strategic", count: 3, avg_score: 8.7, open: 2 },
    { category: "Financial", count: 2, avg_score: 10.0, open: 0 },
    { category: "Compliance", count: 2, avg_score: 10.0, open: 1 },
    { category: "Technology", count: 6, avg_score: 14.3, open: 2 },
    { category: "Reputational", count: 2, avg_score: 6.5, open: 1 },
  ];
}

export function getRiskRegisterSummaryDemoData() {
  return {
    total_risks: 18,
    open_risks: 8,
    overdue_reviews: 2,
    avg_risk_score: 10.7,
    evaluated_at: new Date().toISOString(),
  };
}

export function getRiskAppetiteThresholdsDemoData() {
  return [
    { category: "Operational", appetite_level: 12, actual_exposure: 10, tolerance_max: 15, status: "green", statement: "We accept moderate operational disruption risk provided failover and DR plans are tested quarterly.", trend_quarters: [8, 9, 11, 10] },
    { category: "Strategic", appetite_level: 10, actual_exposure: 9, tolerance_max: 14, status: "green", statement: "We pursue calculated strategic risks that align with 3-year growth targets.", trend_quarters: [7, 8, 10, 9] },
    { category: "Financial", appetite_level: 8, actual_exposure: 10, tolerance_max: 12, status: "amber", statement: "We maintain conservative financial risk appetite with FX hedging for all major exposures.", trend_quarters: [6, 7, 9, 10] },
    { category: "Compliance", appetite_level: 5, actual_exposure: 8, tolerance_max: 7, status: "red", statement: "Zero tolerance for compliance breaches. All regulatory requirements must be met with evidence.", trend_quarters: [3, 4, 6, 8] },
    { category: "Technology", appetite_level: 12, actual_exposure: 14, tolerance_max: 16, status: "amber", statement: "We accept technology risk proportional to innovation velocity, with mandatory security gates.", trend_quarters: [10, 11, 13, 14] },
    { category: "Reputational", appetite_level: 6, actual_exposure: 5, tolerance_max: 8, status: "green", statement: "We protect brand reputation aggressively with proactive communication and transparency.", trend_quarters: [4, 5, 5, 5] },
  ];
}

export function getRiskAppetiteKrisDemoData() {
  return [
    { id: "KRI-001", name: "System uptime SLA", category: "Operational", threshold: 99.9, actual: 99.7, unit: "%", status: "amber", last_updated: "2025-01-14T00:00:00Z" },
    { id: "KRI-002", name: "Mean time to detect (MTTD)", category: "Technology", threshold: 30, actual: 22, unit: "minutes", status: "green", last_updated: "2025-01-14T00:00:00Z" },
    { id: "KRI-003", name: "Open critical vulnerabilities", category: "Technology", threshold: 5, actual: 7, unit: "count", status: "red", last_updated: "2025-01-14T00:00:00Z" },
    { id: "KRI-004", name: "Compliance audit findings", category: "Compliance", threshold: 3, actual: 5, unit: "findings", status: "red", last_updated: "2025-01-14T00:00:00Z" },
    { id: "KRI-005", name: "Employee turnover rate", category: "Operational", threshold: 15, actual: 12, unit: "%", status: "green", last_updated: "2025-01-14T00:00:00Z" },
    { id: "KRI-006", name: "Revenue concentration top client", category: "Financial", threshold: 25, actual: 22, unit: "%", status: "amber", last_updated: "2025-01-14T00:00:00Z" },
    { id: "KRI-007", name: "Patch compliance within SLA", category: "Technology", threshold: 95, actual: 88, unit: "%", status: "amber", last_updated: "2025-01-14T00:00:00Z" },
    { id: "KRI-008", name: "Customer NPS score", category: "Reputational", threshold: 50, actual: 62, unit: "score", status: "green", last_updated: "2025-01-14T00:00:00Z" },
    { id: "KRI-009", name: "Vendor risk assessments overdue", category: "Operational", threshold: 2, actual: 1, unit: "count", status: "green", last_updated: "2025-01-14T00:00:00Z" },
    { id: "KRI-010", name: "Data breach incidents YTD", category: "Technology", threshold: 0, actual: 0, unit: "count", status: "green", last_updated: "2025-01-14T00:00:00Z" },
    { id: "KRI-011", name: "Budget variance", category: "Financial", threshold: 10, actual: 8, unit: "%", status: "green", last_updated: "2025-01-14T00:00:00Z" },
    { id: "KRI-012", name: "Regulatory change backlog", category: "Compliance", threshold: 5, actual: 4, unit: "items", status: "green", last_updated: "2025-01-14T00:00:00Z" },
  ];
}

export function getRiskAppetiteSummaryDemoData() {
  return {
    total_categories: 6,
    breaches: 1,
    amber_warnings: 2,
    within_appetite: 3,
    total_kris: 12,
    kri_breaches: 2,
    evaluated_at: new Date().toISOString(),
  };
}

export function getSbomSummaryDemoData() {
  return {
    total_workloads: 42,
    sbom_coverage: 88,
    total_components: 3_847,
    vulnerable_components: 12,
    critical_count: 2,
    high_count: 5,
    generated_at: new Date().toISOString(),
  };
}

export function getSbomDocumentsDemoData() {
  const now = Date.now();
  return [
    {
      id: "sbom-vllm-engine",
      workload: "vllm-engine",
      namespace: "inference",
      cluster: "gpu-prod",
      format: "SPDX",
      generated_at: new Date(now - ONE_HOUR_MS).toISOString(),
      component_count: 284,
      vulnerable_count: 3,
      components: [
        { name: "torch", version: "2.2.1", purl: "pkg:pypi/torch@2.2.1", license: "BSD-3-Clause", vulnerabilities: 0, severity: "none" },
        { name: "transformers", version: "4.38.2", purl: "pkg:pypi/transformers@4.38.2", license: "Apache-2.0", vulnerabilities: 0, severity: "none" },
        { name: "cryptography", version: "41.0.3", purl: "pkg:pypi/cryptography@41.0.3", license: "Apache-2.0", vulnerabilities: 2, severity: "high" },
        { name: "pillow", version: "10.0.0", purl: "pkg:pypi/pillow@10.0.0", license: "HPND", vulnerabilities: 1, severity: "medium" },
        { name: "numpy", version: "1.24.4", purl: "pkg:pypi/numpy@1.24.4", license: "BSD-3-Clause", vulnerabilities: 0, severity: "none" },
      ],
    },
    {
      id: "sbom-api-gateway",
      workload: "api-gateway",
      namespace: "default",
      cluster: "prod-east",
      format: "CycloneDX",
      generated_at: new Date(now - TWO_HOURS_MS).toISOString(),
      component_count: 156,
      vulnerable_count: 0,
      components: [
        { name: "express", version: "4.18.2", purl: "pkg:npm/express@4.18.2", license: "MIT", vulnerabilities: 0, severity: "none" },
        { name: "helmet", version: "7.1.0", purl: "pkg:npm/helmet@7.1.0", license: "MIT", vulnerabilities: 0, severity: "none" },
        { name: "jsonwebtoken", version: "9.0.2", purl: "pkg:npm/jsonwebtoken@9.0.2", license: "MIT", vulnerabilities: 0, severity: "none" },
        { name: "axios", version: "1.6.5", purl: "pkg:npm/axios@1.6.5", license: "MIT", vulnerabilities: 0, severity: "none" },
      ],
    },
    {
      id: "sbom-model-server",
      workload: "model-server",
      namespace: "inference",
      cluster: "gpu-prod",
      format: "SPDX",
      generated_at: new Date(now - THIRTY_MINUTES_MS).toISOString(),
      component_count: 412,
      vulnerable_count: 9,
      components: [
        { name: "openssl", version: "3.0.8", purl: "pkg:pypi/openssl@3.0.8", license: "OpenSSL", vulnerabilities: 4, severity: "critical" },
        { name: "requests", version: "2.28.1", purl: "pkg:pypi/requests@2.28.1", license: "Apache-2.0", vulnerabilities: 0, severity: "none" },
        { name: "protobuf", version: "3.20.1", purl: "pkg:pypi/protobuf@3.20.1", license: "BSD-3-Clause", vulnerabilities: 5, severity: "high" },
        { name: "urllib3", version: "1.26.15", purl: "pkg:pypi/urllib3@1.26.15", license: "MIT", vulnerabilities: 0, severity: "none" },
      ],
    },
    {
      id: "sbom-metrics-collector",
      workload: "metrics-collector",
      namespace: "monitoring",
      cluster: "ops",
      format: "CycloneDX",
      generated_at: new Date(now - NINETY_MINUTES_MS).toISOString(),
      component_count: 89,
      vulnerable_count: 0,
      components: [
        { name: "prometheus-client", version: "0.19.0", purl: "pkg:pypi/prometheus-client@0.19.0", license: "Apache-2.0", vulnerabilities: 0, severity: "none" },
        { name: "grpcio", version: "1.60.0", purl: "pkg:pypi/grpcio@1.60.0", license: "Apache-2.0", vulnerabilities: 0, severity: "none" },
      ],
    },
  ];
}

export function getLicenseSummaryDemoData() {
  return {
    total_packages: 3_847,
    allowed_packages: 3_814,
    warned_packages: 24,
    denied_packages: 9,
    unique_licenses: 47,
    workloads_scanned: 37,
    evaluated_at: new Date().toISOString(),
  };
}

export function getLicenseCategoriesDemoData() {
  return [
    { name: "Permissive (Allowed)", count: 3_214, risk: "allowed", examples: ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"] },
    { name: "Weak Copyleft (Warn)", count: 24, risk: "warn", examples: ["LGPL-2.1", "LGPL-3.0", "MPL-2.0", "EUPL-1.2"] },
    { name: "Strong Copyleft (Denied)", count: 9, risk: "denied", examples: ["GPL-2.0", "GPL-3.0", "AGPL-3.0", "SSPL-1.0"] },
    { name: "Public Domain", count: 600, risk: "allowed", examples: ["CC0-1.0", "Unlicense", "WTFPL"] },
  ];
}

export function getLicensePackagesDemoData() {
  return [
    { name: "openssl", version: "3.0.8", license: "OpenSSL (GPL-2.0 exception)", risk: "warn", workload: "model-server", namespace: "inference", cluster: "gpu-prod", spdx_id: "OpenSSL" },
    { name: "mysql-connector-python", version: "8.3.0", license: "GPL-2.0", risk: "denied", workload: "db-proxy", namespace: "data", cluster: "prod-east", spdx_id: "GPL-2.0-only" },
    { name: "ffmpeg", version: "6.1", license: "GPL-3.0", risk: "denied", workload: "media-processor", namespace: "media", cluster: "prod-west", spdx_id: "GPL-3.0-only" },
    { name: "ghostscript", version: "10.02.1", license: "AGPL-3.0", risk: "denied", workload: "pdf-renderer", namespace: "docs", cluster: "prod-east", spdx_id: "AGPL-3.0-only" },
    { name: "lgpl-utils", version: "1.4.2", license: "LGPL-2.1", risk: "warn", workload: "vllm-engine", namespace: "inference", cluster: "gpu-prod", spdx_id: "LGPL-2.1-only" },
    { name: "pdfium", version: "6111", license: "BSD-3-Clause", risk: "allowed", workload: "pdf-renderer", namespace: "docs", cluster: "prod-east", spdx_id: "BSD-3-Clause" },
    { name: "torch", version: "2.2.1", license: "BSD-3-Clause", risk: "allowed", workload: "vllm-engine", namespace: "inference", cluster: "gpu-prod", spdx_id: "BSD-3-Clause" },
    { name: "cryptography", version: "41.0.3", license: "Apache-2.0", risk: "allowed", workload: "api-gateway", namespace: "default", cluster: "prod-east", spdx_id: "Apache-2.0" },
    { name: "readline", version: "8.2", license: "GPL-3.0", risk: "denied", workload: "debug-shell", namespace: "kube-system", cluster: "ops", spdx_id: "GPL-3.0-only" },
    { name: "mpl-lib", version: "3.1.0", license: "MPL-2.0", risk: "warn", workload: "metrics-collector", namespace: "monitoring", cluster: "ops", spdx_id: "MPL-2.0" },
    { name: "express", version: "4.18.2", license: "MIT", risk: "allowed", workload: "api-gateway", namespace: "default", cluster: "prod-east", spdx_id: "MIT" },
    { name: "react", version: "18.2.0", license: "MIT", risk: "allowed", workload: "frontend", namespace: "default", cluster: "prod-east", spdx_id: "MIT" },
  ];
}
