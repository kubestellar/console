/**
 * Netlify Function: Compliance ERM Risk Matrix Risks
 *
 * Returns static demo risk matrix entries for the enterprise risk matrix dashboard so
 * production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
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
  ]);
};
