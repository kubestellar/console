/**
 * Netlify Function: Supply Chain License Packages
 *
 * Returns static demo license package data for the supply chain license dashboard so
 * production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
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
  ]);
};
