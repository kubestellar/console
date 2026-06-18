import { http, HttpResponse, delay } from 'msw'
import {
  DEMO_30_SEC_MS,
  DEMO_45_SEC_MS,
  DEMO_1_MIN_MS,
  DEMO_90_SEC_MS,
  DEMO_2_MIN_MS,
  DEMO_150_SEC_MS,
  DEMO_3_MIN_MS,
  DEMO_4_MIN_MS,
  DEMO_5_MIN_MS,
  DEMO_6_MIN_MS,
  DEMO_7_MIN_MS,
  DEMO_8_MIN_MS,
  DEMO_10_MIN_MS,
  DEMO_15_MIN_MS,
  DEMO_20_MIN_MS,
  DEMO_30_MIN_MS,
  DEMO_45_MIN_MS,
  DEMO_50_MIN_MS,
  DEMO_1_HOUR_MS,
  DEMO_75_MIN_MS,
  DEMO_90_MIN_MS,
  DEMO_2_HOUR_MS,
  DEMO_150_MIN_MS,
  DEMO_3_HOUR_MS,
  DEMO_4_HOUR_MS,
  DEMO_8_HOUR_MS,
  DEMO_12_HOUR_MS,
  DEMO_1_DAY_MS,
  DEMO_2_DAY_MS,
  DEMO_3_DAY_MS,
  DEMO_1_WEEK_MS,
  DEMO_30_DAY_MS,
} from './handlers.fixtures'

export function createV1SbomHandlers() {
  return [
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

  ]
}
