/**
 * Tenant Architecture Topology
 *
 * Premium SVG topology card showing the KubeCon multi-tenancy architecture
 * diagram as a live, interactive visualization. Renders one tenant's complete
 * stack: K3s Agent Pods (KubeVirt), K3s Server Pod, Layer-2/Layer-3 UDN networks,
 * and the KubeFlex controller, with animated bidirectional connection paths and
 * live status indicators driven by real hook data.
 *
 * Updated to match Braulio's architecture diagram:
 * - Two K3s Agent Pods (KubeVirt) in namespace-1
 * - K3s Server Pod in namespace-2
 * - KubeFlex Controller at top-right (outside tenant boundary)
 * - All network traffic is bidirectional
 * - Default k8s Network between namespace-2 and KubeFlex
 *
 * Network throughput data drives:
 * - Particle animation speed (faster = higher throughput)
 * - Particle size (bigger = higher throughput)
 * - Throughput labels on each connection (e.g., "15.0 KB/s")
 *
 * Follows the LLMdFlow.tsx SVG pattern: viewBox coordinates, framer-motion
 * animations, and named constants for all positions/sizes/colors.
 *
 * Rendering is split across sibling files to keep each file focused:
 * - TenantTopologyDefs.tsx — SVG defs (filters, path refs, arrow markers)
 * - TenantTopologyZones.tsx — tenant boundary, zone backgrounds, legend
 * - TenantTopologyConnectionsLayer.tsx — connection paths, particles, labels
 * - TenantTopologyNodesLayer.tsx — component nodes (agents, K3s, KubeFlex)
 */
import { useId } from 'react'
import { useCardLoadingState } from '../../CardDataContext'
import { DEMO_TENANT_TOPOLOGY } from './demoData'
import { buildConnections } from './TenantTopologyParts'
import { TenantTopologyDefs } from './TenantTopologyDefs'
import { TenantTopologyZones } from './TenantTopologyZones'
import { TenantTopologyConnectionsLayer } from './TenantTopologyConnectionsLayer'
import { TenantTopologyNodesLayer } from './TenantTopologyNodesLayer'
import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from './tenantTopology.constants'
import { useTenantTopology } from './useTenantTopology'

export function TenantTopology() {
  /** Unique prefix for SVG defs IDs to prevent collisions with multiple instances */
  const svgId = useId().replace(/:/g, '')

  const liveData = useTenantTopology()

  // Use demo data when all hooks return no detection
  const data = liveData.isDemoData ? DEMO_TENANT_TOPOLOGY : liveData

  useCardLoadingState({
    isLoading: data.isLoading && !data.isDemoData,
    isRefreshing: liveData.isRefreshing,
    hasAnyData: true,
    isDemoData: data.isDemoData })

  const connections = buildConnections(
        data.ovnDetected,
        data.kubeflexDetected,
        data.k3sDetected,
        data.kubevirtDetected,
        {
          kvEth0Rate: data.kvEth0Rate,
          kvEth1Rate: data.kvEth1Rate,
          k3sEth0Rate: data.k3sEth0Rate,
          k3sEth1Rate: data.k3sEth1Rate,
          kvEth0Rx: data.kvEth0Rx,
          kvEth0Tx: data.kvEth0Tx,
          kvEth1Rx: data.kvEth1Rx,
          kvEth1Tx: data.kvEth1Tx,
          k3sEth0Rx: data.k3sEth0Rx,
          k3sEth0Tx: data.k3sEth0Tx,
          k3sEth1Rx: data.k3sEth1Rx,
          k3sEth1Tx: data.k3sEth1Tx },
      )

  return (
    <div className="w-full h-full min-h-[280px]">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <TenantTopologyDefs svgId={svgId} connections={connections} />
        <TenantTopologyZones ovnDetected={data.ovnDetected} />
        <TenantTopologyConnectionsLayer svgId={svgId} connections={connections} />
        <TenantTopologyNodesLayer
          svgId={svgId}
          ovnDetected={data.ovnDetected}
          ovnHealthy={data.ovnHealthy}
          kubeflexDetected={data.kubeflexDetected}
          kubeflexHealthy={data.kubeflexHealthy}
          k3sDetected={data.k3sDetected}
          k3sHealthy={data.k3sHealthy}
          kubevirtDetected={data.kubevirtDetected}
          kubevirtHealthy={data.kubevirtHealthy}
        />
      </svg>
    </div>
  )
}
