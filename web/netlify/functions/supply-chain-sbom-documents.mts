/**
 * Netlify Function: Supply Chain SBOM Documents
 *
 * Returns static demo SBOM document data for the supply chain SBOM dashboard so
 * production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
    {
      id: "sbom-vllm-engine",
      workload: "vllm-engine",
      namespace: "inference",
      cluster: "gpu-prod",
      format: "SPDX",
      generated_at: "2026-01-15T09:30:00Z",
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
      generated_at: "2026-01-15T08:30:00Z",
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
      generated_at: "2026-01-15T10:00:00Z",
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
      generated_at: "2026-01-15T09:00:00Z",
      component_count: 89,
      vulnerable_count: 0,
      components: [
        { name: "prometheus-client", version: "0.19.0", purl: "pkg:pypi/prometheus-client@0.19.0", license: "Apache-2.0", vulnerabilities: 0, severity: "none" },
        { name: "grpcio", version: "1.60.0", purl: "pkg:pypi/grpcio@1.60.0", license: "Apache-2.0", vulnerabilities: 0, severity: "none" },
      ],
    },
  ]);
};
