/**
 * Cloud Custodian Status Card — Demo Data & Type Definitions
 *
 * Cloud Custodian (CNCF incubating) is a rules-engine for cloud governance,
 * compliance, and cost management. Operators write YAML/JSON policies that
 * match cloud resources and apply actions (notify, tag, stop, delete, etc.).
 *
 * This card surfaces:
 *   - Per-policy run counts (success / fail / dry-run) and last-run time
 *   - Top resources acted on
 *   - Violations grouped by severity
 *   - Policy execution mode (pull / periodic / event)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Execution mode for a Cloud Custodian policy. */
export type CustodianPolicyMode = 'pull' | 'periodic' | 'event'

/** Severity bucket for a Cloud Custodian policy violation. */
export type CustodianViolationSeverity = 'critical' | 'high' | 'medium' | 'low'

/** Resource provider surface a policy targets. */
export type CustodianProvider = 'aws' | 'azure' | 'gcp' | 'k8s'

export interface CustodianPolicy {
  /** Policy name as declared in the Cloud Custodian YAML. */
  name: string
  /** Resource type the policy matches (e.g. 'aws.ec2', 'k8s.pod'). */
  resource: string
  /** Provider the policy targets. */
  provider: CustodianProvider
  /** Execution mode for this policy. */
  mode: CustodianPolicyMode
  /** Count of successful runs in the current window. */
  successCount: number
  /** Count of failed runs in the current window. */
  failCount: number
  /** Count of dry-run executions (no actions applied). */
  dryRunCount: number
  /** Count of matching resources acted on in the last run. */
  resourcesMatched: number
  /** ISO timestamp of the most recent run. */
  lastRunAt: string
}

export interface CustodianTopResource {
  /** Resource identifier (ARN, resource ID, namespace/name, etc.). */
  id: string
  /** Resource type label (e.g. 'ec2-instance', 's3-bucket'). */
  type: string
  /** Number of policies that matched/acted on this resource. */
  actionCount: number
}

export interface CustodianSeverityCounts {
  critical: number
  high: number
  medium: number
  low: number
}

export interface CustodianSummary {
  totalPolicies: number
  successfulPolicies: number
  failedPolicies: number
  dryRunPolicies: number
}

export type CustodianHealth = 'healthy' | 'degraded' | 'not-installed'

export interface CloudCustodianStatusData {
  health: CustodianHealth
  /** Cloud Custodian release version in use. */
  version: string
  policies: CustodianPolicy[]
  topResources: CustodianTopResource[]
  violationsBySeverity: CustodianSeverityCounts
  summary: CustodianSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo data — shown when Cloud Custodian isn't installed or in demo mode
// ---------------------------------------------------------------------------

// Named constants (no magic numbers)
const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE

// Last-run offsets (minutes ago) chosen to feel realistic across pull/periodic/event.
const POLICY_LAST_RUN_EC2_MIN = 4
const POLICY_LAST_RUN_S3_MIN = 17
const POLICY_LAST_RUN_RDS_MIN = 42
const POLICY_LAST_RUN_K8S_MIN = 2
const POLICY_LAST_RUN_AZURE_MIN = 138

// Per-policy counters — mix of healthy runs with a couple of failures plus dry-runs.
const POLICY_EC2_SUCCESS = 128
const POLICY_EC2_FAIL = 0
const POLICY_EC2_DRYRUN = 0
const POLICY_EC2_MATCHED = 3

const POLICY_S3_SUCCESS = 92
const POLICY_S3_FAIL = 0
const POLICY_S3_DRYRUN = 14
const POLICY_S3_MATCHED = 11

const POLICY_RDS_SUCCESS = 61
const POLICY_RDS_FAIL = 2
const POLICY_RDS_DRYRUN = 0
const POLICY_RDS_MATCHED = 5

const POLICY_K8S_SUCCESS = 214
const POLICY_K8S_FAIL = 0
const POLICY_K8S_DRYRUN = 0
const POLICY_K8S_MATCHED = 1

const POLICY_AZURE_SUCCESS = 38
const POLICY_AZURE_FAIL = 1
const POLICY_AZURE_DRYRUN = 6
const POLICY_AZURE_MATCHED = 2

// Top-resource action counts for the "most acted on" list.
const TOP_RESOURCE_ACTIONS_1 = 12
const TOP_RESOURCE_ACTIONS_2 = 9
const TOP_RESOURCE_ACTIONS_3 = 7
const TOP_RESOURCE_ACTIONS_4 = 5
const TOP_RESOURCE_ACTIONS_5 = 4

// Violations by severity (active, unresolved).
const VIOLATIONS_CRITICAL = 1
const VIOLATIONS_HIGH = 3
const VIOLATIONS_MEDIUM = 8
const VIOLATIONS_LOW = 14

const DEMO_CUSTODIAN_VERSION = '0.9.40'

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * MS_PER_MINUTE).toISOString()
}

const DEMO_POLICIES: CustodianPolicy[] = [
  {
    name: 'ec2-unattached-volumes',
    resource: 'aws.ebs',
    provider: 'aws',
    mode: 'periodic',
    successCount: POLICY_EC2_SUCCESS,
    failCount: POLICY_EC2_FAIL,
    dryRunCount: POLICY_EC2_DRYRUN,
    resourcesMatched: POLICY_EC2_MATCHED,
    lastRunAt: minutesAgo(POLICY_LAST_RUN_EC2_MIN),
  },
  {
    name: 's3-public-read-denied',
    resource: 'aws.s3',
    provider: 'aws',
    mode: 'event',
    successCount: POLICY_S3_SUCCESS,
    failCount: POLICY_S3_FAIL,
    dryRunCount: POLICY_S3_DRYRUN,
    resourcesMatched: POLICY_S3_MATCHED,
    lastRunAt: minutesAgo(POLICY_LAST_RUN_S3_MIN),
  },
  {
    name: 'rds-unencrypted-snapshots',
    resource: 'aws.rds',
    provider: 'aws',
    mode: 'periodic',
    successCount: POLICY_RDS_SUCCESS,
    failCount: POLICY_RDS_FAIL,
    dryRunCount: POLICY_RDS_DRYRUN,
    resourcesMatched: POLICY_RDS_MATCHED,
    lastRunAt: minutesAgo(POLICY_LAST_RUN_RDS_MIN),
  },
  {
    name: 'k8s-privileged-pod-block',
    resource: 'k8s.pod',
    provider: 'k8s',
    mode: 'pull',
    successCount: POLICY_K8S_SUCCESS,
    failCount: POLICY_K8S_FAIL,
    dryRunCount: POLICY_K8S_DRYRUN,
    resourcesMatched: POLICY_K8S_MATCHED,
    lastRunAt: minutesAgo(POLICY_LAST_RUN_K8S_MIN),
  },
  {
    name: 'azure-storage-public-access',
    resource: 'azure.storage',
    provider: 'azure',
    mode: 'periodic',
    successCount: POLICY_AZURE_SUCCESS,
    failCount: POLICY_AZURE_FAIL,
    dryRunCount: POLICY_AZURE_DRYRUN,
    resourcesMatched: POLICY_AZURE_MATCHED,
    lastRunAt: minutesAgo(POLICY_LAST_RUN_AZURE_MIN),
  },
]

const DEMO_TOP_RESOURCES: CustodianTopResource[] = [
  {
    id: 'arn:aws:s3:::demo-logs-bucket-prod',
    type: 's3-bucket',
    actionCount: TOP_RESOURCE_ACTIONS_1,
  },
  {
    id: 'i-0e7a3b21e5f4d9a2c',
    type: 'ec2-instance',
    actionCount: TOP_RESOURCE_ACTIONS_2,
  },
  {
    id: 'prod-db-snapshot-2026-04-11',
    type: 'rds-snapshot',
    actionCount: TOP_RESOURCE_ACTIONS_3,
  },
  {
    id: 'kube-system/metrics-server',
    type: 'k8s-pod',
    actionCount: TOP_RESOURCE_ACTIONS_4,
  },
  {
    id: 'stakscan1a2b3c4d',
    type: 'azure-storage',
    actionCount: TOP_RESOURCE_ACTIONS_5,
  },
]

const DEMO_SUCCESSFUL_POLICIES = DEMO_POLICIES.filter(
  p => p.failCount === 0 && p.dryRunCount === 0,
).length
const DEMO_FAILED_POLICIES = DEMO_POLICIES.filter(p => p.failCount > 0).length
const DEMO_DRYRUN_POLICIES = DEMO_POLICIES.filter(p => p.dryRunCount > 0).length

export const CLOUD_CUSTODIAN_DEMO_DATA: CloudCustodianStatusData = {
  health: 'degraded',
  version: DEMO_CUSTODIAN_VERSION,
  policies: DEMO_POLICIES,
  topResources: DEMO_TOP_RESOURCES,
  violationsBySeverity: {
    critical: VIOLATIONS_CRITICAL,
    high: VIOLATIONS_HIGH,
    medium: VIOLATIONS_MEDIUM,
    low: VIOLATIONS_LOW,
  },
  summary: {
    totalPolicies: DEMO_POLICIES.length,
    successfulPolicies: DEMO_SUCCESSFUL_POLICIES,
    failedPolicies: DEMO_FAILED_POLICIES,
    dryRunPolicies: DEMO_DRYRUN_POLICIES,
  },
  lastCheckTime: new Date().toISOString(),
}
