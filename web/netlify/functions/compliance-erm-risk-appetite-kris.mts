/**
 * Netlify Function: Compliance ERM Risk Appetite KRIs
 *
 * Returns static demo key risk indicator data for the enterprise risk appetite
 * dashboard so production renders the same sample content as development.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
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
  ]);
};
