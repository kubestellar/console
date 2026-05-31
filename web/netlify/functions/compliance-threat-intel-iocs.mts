/**
 * Netlify Function: Compliance Threat Intel IOCs
 *
 * Returns static demo IOC match data for the enterprise threat intel dashboard so
 * production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
    { id: "ioc-001", ioc_type: "ip", indicator: "198.51.100.42", feed_name: "AlienVault OTX", severity: "critical", matched_resource: "pod/api-gateway", cluster: "prod-east-1", detected_at: "2026-01-15T09:30:00Z", status: "active" },
    { id: "ioc-002", ioc_type: "domain", indicator: "malware-c2.example.net", feed_name: "Abuse.ch URLhaus", severity: "critical", matched_resource: "pod/worker-processor", cluster: "prod-east-1", detected_at: "2026-01-15T08:30:00Z", status: "active" },
    { id: "ioc-003", ioc_type: "hash", indicator: "a1b2c3d4e5f6...", feed_name: "AlienVault OTX", severity: "high", matched_resource: "image/nginx:1.24", cluster: "prod-west-2", detected_at: "2026-01-15T06:30:00Z", status: "mitigated" },
    { id: "ioc-004", ioc_type: "ip", indicator: "203.0.113.99", feed_name: "CISA KEV", severity: "high", matched_resource: "service/ingress-nginx", cluster: "staging-1", detected_at: "2026-01-15T02:30:00Z", status: "active" },
    { id: "ioc-005", ioc_type: "url", indicator: "http://phish.example.com/login", feed_name: "PhishTank", severity: "medium", matched_resource: "pod/web-frontend", cluster: "prod-east-1", detected_at: "2026-01-14T10:30:00Z", status: "false_positive" },
    { id: "ioc-006", ioc_type: "domain", indicator: "crypto-miner.example.org", feed_name: "Abuse.ch URLhaus", severity: "high", matched_resource: "pod/batch-worker", cluster: "dev-1", detected_at: "2026-01-13T10:30:00Z", status: "mitigated" },
  ]);
};
