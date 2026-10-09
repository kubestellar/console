/**
 * SLSA Dashboard data types, API endpoints, and response builders.
 */

export interface SLSAAttestation {
  id: string
  artifact: string
  builder: string
  slsa_level: 1 | 2 | 3 | 4
  verified: boolean
  build_type: string
  source_repo: string
  timestamp: string
  status: 'pass' | 'fail' | 'pending'
}

export interface SLSAProvenance {
  id: string
  artifact: string
  builder_id: string
  build_level: 1 | 2 | 3 | 4
  source_uri: string
  source_digest: string
  reproducible: boolean
  hermetic: boolean
  parameterless: boolean
  timestamp: string
}

export interface SLSASummary {
  total_artifacts: number
  attested_artifacts: number
  level_1: number
  level_2: number
  level_3: number
  level_4: number
  verified_attestations: number
  failed_attestations: number
  pending_attestations: number
  source_integrity_pass: number
  source_integrity_fail: number
  reproducible_builds: number
  total_builds: number
}

interface SLSARequirement {
  met: boolean
}

export interface SLSAWorkload {
  workload: string
  image: string
  slsa_level: 0 | 1 | 2 | 3 | 4
  build_system: string
  builder_id: string
  source_uri: string
  attestation_present: boolean
  attestation_verified: boolean
  evaluated_at: string
  requirements: SLSARequirement[]
}

export interface SLSABackendSummary {
  total_workloads: number
  level_distribution: Record<string, number>
  attested_workloads: number
  verified_workloads: number
}

export const SLSA_SUMMARY_ENDPOINT = '/api/supply-chain/slsa/summary'
export const SLSA_WORKLOADS_ENDPOINT = '/api/supply-chain/slsa/workloads'
const UNKNOWN_SOURCE = 'Unknown'

function getAttestationStatus(workload: SLSAWorkload): SLSAAttestation['status'] {
  if (workload.attestation_verified) return 'pass'
  if (workload.attestation_present) return 'fail'
  return 'pending'
}

export function buildAttestations(workloads: SLSAWorkload[]): SLSAAttestation[] {
  return workloads.map((workload, index) => ({
    id: `${workload.workload}-${index}`,
    artifact: workload.image,
    builder: workload.build_system,
    slsa_level: workload.slsa_level === 0 ? 1 : workload.slsa_level,
    verified: workload.attestation_verified,
    build_type: workload.build_system,
    source_repo: workload.source_uri || UNKNOWN_SOURCE,
    timestamp: workload.evaluated_at,
    status: getAttestationStatus(workload),
  }))
}

export function buildProvenance(workloads: SLSAWorkload[]): SLSAProvenance[] {
  return workloads.map((workload, index) => {
    const metRequirements = (workload.requirements || []).filter((requirement) => requirement.met).length
    const totalRequirements = Math.max((workload.requirements || []).length, 1)

    return {
      id: `${workload.workload}-provenance-${index}`,
      artifact: workload.image,
      builder_id: workload.builder_id,
      build_level: workload.slsa_level === 0 ? 1 : workload.slsa_level,
      source_uri: workload.source_uri || UNKNOWN_SOURCE,
      source_digest: 'Unavailable',
      reproducible: workload.attestation_verified,
      hermetic: metRequirements === totalRequirements,
      parameterless: metRequirements >= Math.ceil(totalRequirements / 2),
      timestamp: workload.evaluated_at,
    }
  })
}

export function buildSummary(summary: SLSABackendSummary): SLSASummary {
  const levelDistribution = summary.level_distribution || {}

  return {
    total_artifacts: summary.total_workloads,
    attested_artifacts: summary.attested_workloads,
    level_1: levelDistribution['1'] ?? 0,
    level_2: levelDistribution['2'] ?? 0,
    level_3: levelDistribution['3'] ?? 0,
    level_4: levelDistribution['4'] ?? 0,
    verified_attestations: summary.verified_workloads,
    failed_attestations: Math.max(summary.attested_workloads - summary.verified_workloads, 0),
    pending_attestations: Math.max(summary.total_workloads - summary.attested_workloads, 0),
    source_integrity_pass: summary.verified_workloads,
    source_integrity_fail: Math.max(summary.total_workloads - summary.verified_workloads, 0),
    reproducible_builds: summary.verified_workloads,
    total_builds: summary.total_workloads,
  }
}
