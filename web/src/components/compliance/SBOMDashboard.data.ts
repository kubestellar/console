/**
 * SBOM Dashboard data types, API endpoints, and response builders.
 */

export interface SBOMPackage {
  name: string
  version: string
  license: string
  ecosystem: string
  vulnerabilities: number
  risk: 'critical' | 'high' | 'medium' | 'low' | 'none'
}

export interface SBOMVulnerability {
  id: string
  package_name: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  cve: string
  fixed_version: string
  status: 'open' | 'patched' | 'ignored'
}

export interface SBOMSummary {
  total_packages: number
  total_vulnerabilities: number
  critical_vulns: number
  high_vulns: number
  medium_vulns: number
  low_vulns: number
  license_compliant: number
  license_non_compliant: number
  license_unknown: number
  ecosystems: Array<{ name: string; count: number }>
  scan_status: 'completed' | 'in_progress' | 'failed'
  last_scan: string
}

interface SBOMDocumentComponent {
  name: string
  version: string
  purl?: string
  license: string
  vulnerabilities: number
  severity: string
}

export interface SBOMDocument {
  id: string
  format: string
  components: SBOMDocumentComponent[]
}

export interface SBOMBackendSummary {
  total_components: number
  vulnerable_components: number
  critical_count: number
  high_count: number
  generated_at: string
}

export const SBOM_DOCUMENTS_ENDPOINT = '/api/supply-chain/sbom/documents'
export const SBOM_SUMMARY_ENDPOINT = '/api/supply-chain/sbom/summary'
const DEFAULT_FIXED_VERSION = 'Unknown'
const DEFAULT_VULNERABILITY_LABEL = 'Detected vulnerability'

function inferEcosystem(purl?: string): string {
  if (!purl) return 'unknown'
  if (purl.startsWith('pkg:npm/')) return 'npm'
  if (purl.startsWith('pkg:pypi/')) return 'pip'
  if (purl.startsWith('pkg:golang/')) return 'go'
  return 'other'
}

function normalizeSeverity(severity: string, vulnerabilities: number): SBOMPackage['risk'] {
  if (severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low' || severity === 'none') {
    return severity
  }

  return vulnerabilities > 0 ? 'low' : 'none'
}

export function buildPackages(documents: SBOMDocument[]): SBOMPackage[] {
  return documents.flatMap((document) =>
    (document.components || []).map((component) => ({
      name: component.name,
      version: component.version,
      license: component.license,
      ecosystem: inferEcosystem(component.purl),
      vulnerabilities: component.vulnerabilities,
      risk: normalizeSeverity(component.severity, component.vulnerabilities),
    }))
  )
}

export function buildVulnerabilities(packages: SBOMPackage[]): SBOMVulnerability[] {
  return packages
    .filter((pkg) => pkg.vulnerabilities > 0)
    .map((pkg, index) => ({
      id: `${pkg.name}-${index}`,
      package_name: pkg.name,
      severity: pkg.risk === 'none' ? 'low' : pkg.risk,
      cve: DEFAULT_VULNERABILITY_LABEL,
      fixed_version: DEFAULT_FIXED_VERSION,
      status: 'open',
    }))
}

function buildLicenseSummary(packages: SBOMPackage[]) {
  return packages.reduce(
    (counts, pkg) => {
      const normalizedLicense = (pkg.license ?? '').trim().toLowerCase()
      if (!normalizedLicense || normalizedLicense === 'unknown') {
        counts.unknown += 1
      } else if (normalizedLicense.includes('gpl') || normalizedLicense.includes('agpl') || normalizedLicense.includes('sspl')) {
        counts.nonCompliant += 1
      } else {
        counts.compliant += 1
      }
      return counts
    },
    { compliant: 0, nonCompliant: 0, unknown: 0 }
  )
}

function buildEcosystems(packages: SBOMPackage[]) {
  const counts = packages.reduce<Record<string, number>>((acc, pkg) => {
    acc[pkg.ecosystem] = (acc[pkg.ecosystem] ?? 0) + 1
    return acc
  }, {})

  return Object.entries(counts).map(([name, count]) => ({ name, count }))
}

export function buildSummary(summary: SBOMBackendSummary, packages: SBOMPackage[]): SBOMSummary {
  const licenseSummary = buildLicenseSummary(packages)
  const accountedVulnerabilities = summary.critical_count + summary.high_count

  return {
    total_packages: summary.total_components,
    total_vulnerabilities: summary.vulnerable_components,
    critical_vulns: summary.critical_count,
    high_vulns: summary.high_count,
    medium_vulns: Math.max(summary.vulnerable_components - accountedVulnerabilities, 0),
    low_vulns: 0,
    license_compliant: licenseSummary.compliant,
    license_non_compliant: licenseSummary.nonCompliant,
    license_unknown: licenseSummary.unknown,
    ecosystems: buildEcosystems(packages),
    scan_status: 'completed',
    last_scan: summary.generated_at,
  }
}
