/**
 * Multi-Tenancy Dashboard Configuration
 *
 * Dashboard focused on tenant isolation with OVN, KubeFlex, K3s, and KubeVirt.
 */

import type { UnifiedDashboardConfig } from '../../lib/unified/types'

/** Auto-refresh interval for the multi-tenancy dashboard (ms) */
const AUTO_REFRESH_INTERVAL_MS = 60_000

export const multiTenancyDashboardConfig: UnifiedDashboardConfig = {
  id: 'multi-tenancy',
  name: 'Multi-Tenancy',
  subtitle: 'Tenant isolation with OVN, KubeFlex, K3s, KubeVirt',
  route: '/multi-tenancy',

  statsType: 'multi-tenancy',
  stats: {
    type: 'multi-tenancy',
    title: 'Isolation Status',
    collapsible: true,
    showConfigButton: true,
    blocks: [
      {
        id: 'tenants',
        name: 'Tenants',
        icon: 'Users',
        color: 'purple',
        visible: true,
        valueSource: { type: 'field', path: 'summary.tenantCount' },
      },
      {
        id: 'isolation_score',
        name: 'Isolation',
        icon: 'Shield',
        color: 'green',
        visible: true,
        valueSource: { type: 'field', path: 'summary.isolationPercent' },
        format: 'percentage',
      },
      {
        id: 'control_planes',
        name: 'Control Planes',
        icon: 'Layers',
        color: 'blue',
        visible: true,
        valueSource: { type: 'field', path: 'summary.controlPlanes' },
      },
      {
        id: 'vms',
        name: 'VMs',
        icon: 'Monitor',
        color: 'orange',
        visible: true,
        valueSource: { type: 'field', path: 'summary.vmCount' },
      },
      {
        id: 'udn_networks',
        name: 'UDN Networks',
        icon: 'Network',
        color: 'cyan',
        visible: true,
        valueSource: { type: 'field', path: 'summary.udnCount' },
      },
      {
        id: 'components',
        name: 'Components',
        icon: 'CheckCircle2',
        color: 'green',
        visible: true,
        valueSource: { type: 'field', path: 'summary.componentsPercent' },
        format: 'percentage',
      },
    ],
  },

  cards: [
    { id: 'mt-0', cardType: 'tenant_topology', position: { w: 6, h: 6, x: 0, y: 0 } },
    { id: 'mt-1', cardType: 'tenant_isolation_setup', position: { w: 6, h: 6, x: 6, y: 0 } },
    { id: 'mt-2', cardType: 'multi_tenancy_overview', position: { w: 6, h: 3, x: 0, y: 9 } },
    { id: 'mt-3', cardType: 'ovn_status', position: { w: 6, h: 3, x: 6, y: 9 } },
    { id: 'mt-4', cardType: 'kubeflex_status', position: { w: 6, h: 3, x: 0, y: 12 } },
    { id: 'mt-5', cardType: 'k3s_status', position: { w: 6, h: 3, x: 6, y: 12 } },
    { id: 'mt-6', cardType: 'kubevirt_status', position: { w: 6, h: 3, x: 0, y: 15 } },
  ],

  availableCardTypes: [
    'tenant_topology',
    'tenant_isolation_setup',
    'multi_tenancy_overview',
    'ovn_status',
    'kubeflex_status',
    'k3s_status',
    'kubevirt_status',
  ],

  features: {
    dragDrop: true,
    autoRefresh: true,
    autoRefreshInterval: AUTO_REFRESH_INTERVAL_MS,
    addCard: true,
  },

  storageKey: 'kubestellar-unified-multi-tenancy-dashboard',
}

export default multiTenancyDashboardConfig
