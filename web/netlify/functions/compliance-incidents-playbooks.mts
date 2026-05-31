/**
 * Netlify Function: Compliance Incident Playbooks
 *
 * Returns static demo incident playbook data for the enterprise incident response
 * dashboard so production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
    { id: "pb-container-escape", name: "Container Escape Response", description: "Isolate compromised pod, capture forensic data, rotate secrets", last_executed: "2026-01-15T09:30:00Z", execution_count: 7, avg_resolution_min: 45, status: "active", steps: 12 },
    { id: "pb-pod-eviction", name: "Mass Pod Eviction", description: "Investigate node pressure, redistribute workloads, scale cluster", last_executed: "2026-01-14T10:30:00Z", execution_count: 14, avg_resolution_min: 30, status: "active", steps: 8 },
    { id: "pb-cert-renewal", name: "Certificate Renewal", description: "Renew TLS certificates, update secrets, rolling restart services", last_executed: "2026-01-13T10:30:00Z", execution_count: 22, avg_resolution_min: 15, status: "active", steps: 6 },
    { id: "pb-secret-rotation", name: "Secret Rotation", description: "Rotate compromised secrets across all dependent services", last_executed: "2026-01-08T10:30:00Z", execution_count: 5, avg_resolution_min: 60, status: "active", steps: 15 },
    { id: "pb-ddos-response", name: "DDoS Response", description: "Enable rate limiting, scale ingress, activate WAF rules", last_executed: "2025-12-16T10:30:00Z", execution_count: 2, avg_resolution_min: 90, status: "draft", steps: 10 },
  ]);
};
