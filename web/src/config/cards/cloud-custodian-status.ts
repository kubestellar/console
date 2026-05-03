/**
 * Cloud Custodian Status Card Configuration
 *
 * Cloud Custodian is a CNCF incubating rules engine for cloud governance,
 * compliance, and cost management. This card surfaces per-policy run
 * telemetry — success / fail / dry-run counts, last-run timestamps,
 * mode (pull / periodic / event) — plus the top resources acted on and
 * a severity breakdown of active violations.
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const cloudCustodianStatusConfig: UnifiedCardConfig = {
  type: 'cloud_custodian_status',
  title: 'Cloud Custodian',
  category: 'security',
  description:
    'Cloud Custodian policy runs — success / fail / dry-run counts, last run per policy, top resources acted on, and violations by severity.',
  icon: 'Shield',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useCachedCloudCustodian' },
  content: {
    type: 'list',
    pageSize: 5,
    columns: [
      { field: 'name', header: 'Policy', primary: true, width: 160 },
      { field: 'resource', header: 'Resource', width: 130 },
      { field: 'mode', header: 'Mode', width: 90 },
      { field: 'successCount', header: 'Success', width: 90 },
      { field: 'failCount', header: 'Fail', width: 70 },
      { field: 'dryRunCount', header: 'Dry-run', width: 80 },
      { field: 'resourcesMatched', header: 'Matched', width: 90 },
      { field: 'lastRunAt', header: 'Last run', render: 'truncate' },
    ],
  },
  emptyState: {
    icon: 'Shield',
    title: 'Cloud Custodian not detected',
    message:
      'No Cloud Custodian policy telemetry reachable from the connected clusters.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  // Scaffolding: renders live if /api/cloud-custodian/status is wired up,
  // otherwise falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default cloudCustodianStatusConfig
