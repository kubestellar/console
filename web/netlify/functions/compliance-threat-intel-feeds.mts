/**
 * Netlify Function: Compliance Threat Intel Feeds
 *
 * Returns static demo threat intelligence feed data for the enterprise threat intel
 * dashboard so production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
    { id: "feed-001", name: "MITRE ATT&CK", provider: "MITRE Corporation", status: "active", last_updated: "2026-01-15T09:30:00Z", indicators_count: 14500, category: "TTPs" },
    { id: "feed-002", name: "AlienVault OTX", provider: "AT&T Cybersecurity", status: "active", last_updated: "2026-01-15T08:30:00Z", indicators_count: 89200, category: "IOCs" },
    { id: "feed-003", name: "Abuse.ch URLhaus", provider: "abuse.ch", status: "active", last_updated: "2026-01-15T10:00:00Z", indicators_count: 42100, category: "Malware" },
    { id: "feed-004", name: "CISA KEV", provider: "CISA", status: "active", last_updated: "2026-01-14T10:30:00Z", indicators_count: 1120, category: "Vulnerabilities" },
    { id: "feed-005", name: "Custom Internal Feed", provider: "Internal SOC", status: "stale", last_updated: "2026-01-08T10:30:00Z", indicators_count: 340, category: "Internal" },
    { id: "feed-006", name: "PhishTank", provider: "OpenDNS", status: "active", last_updated: "2026-01-15T06:30:00Z", indicators_count: 28700, category: "Phishing" },
  ]);
};
