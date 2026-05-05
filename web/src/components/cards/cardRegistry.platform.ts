import { safeLazy } from '../../lib/safeLazy'
import type { CardRegistryCategory } from './cardRegistry.types'

const BackstageStatus = safeLazy(() => import('./backstage_status'), 'BackstageStatus')
const ContourStatus = safeLazy(() => import('./contour_status'), 'ContourStatus')
const DaprStatus = safeLazy(() => import('./dapr_status'), 'DaprStatus')
const EnvoyStatus = safeLazy(() => import('./envoy_status'), 'EnvoyStatus')
const GrpcStatus = safeLazy(() => import('./grpc_status'), 'GrpcStatus')
const LinkerdStatus = safeLazy(() => import('./linkerd_status'), 'LinkerdStatus')
const LonghornStatus = safeLazy(() => import('./longhorn_status'), 'LonghornStatus')
const OpenfgaStatus = safeLazy(() => import('./openfga_status'), 'OpenfgaStatus')
const OtelStatus = safeLazy(() => import('./otel_status'), 'OtelStatus')
const RookStatus = safeLazy(() => import('./rook_status'), 'RookStatus')
const SpiffeStatus = safeLazy(() => import('./spiffe_status'), 'SpiffeStatus')
const CniStatus = safeLazy(() => import('./cni_status'), 'CniStatus')
const SpireStatus = safeLazy(() => import('./spire_status'), 'SpireStatus')
const TikvStatus = safeLazy(() => import('./tikv_status'), 'TikvStatus')
const TufStatus = safeLazy(() => import('./tuf_status'), 'TufStatus')
const VitessStatus = safeLazy(() => import('./vitess_status'), 'VitessStatus')
const ChaosMeshStatus = safeLazy(() => import('./chaos_mesh_status'), 'ChaosMeshStatus')
const WasmcloudStatus = safeLazy(() => import('./wasmcloud_status'), 'WasmcloudStatus')
const VolcanoStatus = safeLazy(() => import('./volcano_status'), 'VolcanoStatus')
const CrossplaneManagedResources = safeLazy(() => import('./crossplane-status/CrossplaneManagedResources'), 'CrossplaneManagedResources')
const BuildpacksStatus = safeLazy(() => import('./buildpacks-status'), 'BuildpacksStatus')
const FlatcarStatus = safeLazy(() => import('./flatcar_status'), 'FlatcarStatus')
const CoreDNSStatus = safeLazy(() => import('./coredns_status'), 'CoreDNSStatus')
const KedaStatus = safeLazy(() => import('./keda_status'), 'KedaStatus')
const FluentdStatus = safeLazy(() => import('./fluentd_status'), 'FluentdStatus')
const CrioStatus = safeLazy(() => import('./crio_status'), 'CrioStatus')
const CloudCustodianStatus = safeLazy(() => import('./cloud_custodian_status'), 'CloudCustodianStatus')
const ContainerdStatus = safeLazy(() => import('./containerd_status'), 'ContainerdStatus')
const CortexStatus = safeLazy(() => import('./cortex_status'), 'CortexStatus')
const DragonflyStatus = safeLazy(() => import('./dragonfly_status'), 'DragonflyStatus')
const LimaStatus = safeLazy(() => import('./lima_status'), 'LimaStatus')
const NatsStatus = safeLazy(() => import('./nats_status'), 'NatsStatus')
const CloudEventsStatus = safeLazy(() => import('./cloudevents_status'), 'CloudEventsStatus')
const ArtifactHubStatus = safeLazy(() => import('./artifact_hub_status'), 'ArtifactHubStatus')
const StrimziStatus = safeLazy(() => import('./strimzi_status'), 'StrimziStatus')
const KubeVelaStatus = safeLazy(() => import('./kubevela_status'), 'KubeVelaStatus')
const KarmadaStatus = safeLazy(() => import('./karmada_status'), 'KarmadaStatus')
const OpenFeatureStatus = safeLazy(() => import('./openfeature_status'), 'OpenFeatureStatus')
const OpenKruiseStatus = safeLazy(() => import('./openkruise_status'), 'OpenKruiseStatus')
const KeycloakStatus = safeLazy(() => import('./keycloak_status'), 'KeycloakStatus')
const FluidStatus = safeLazy(() => import('./fluid_status'), 'FluidStatus')
const CubefsStatus = safeLazy(() => import('./cubefs_status'), 'CubefsStatus')
const HarborStatus = safeLazy(() => import('./harbor_status'), 'HarborStatus')
const KnativeStatus = safeLazy(() => import('./knative_status'), 'KnativeStatus')
const KServeStatus = safeLazy(() => import('./kserve_status'), 'KServeStatus')
const OpenYurtStatus = safeLazy(() => import('./openyurt_status'), 'OpenYurtStatus')
const _multiTenancyBundle = import('./multi-tenancy').catch(() => undefined as never)
const OvnStatus = safeLazy(() => _multiTenancyBundle, 'OvnStatus')
const KubeflexStatus = safeLazy(() => _multiTenancyBundle, 'KubeflexStatus')
const K3sStatus = safeLazy(() => _multiTenancyBundle, 'K3sStatus')
const KubevirtStatus = safeLazy(() => _multiTenancyBundle, 'KubevirtStatus')
const MultiTenancyOverview = safeLazy(() => _multiTenancyBundle, 'MultiTenancyOverview')
const TenantIsolationSetup = safeLazy(() => _multiTenancyBundle, 'TenantIsolationSetup')
const TenantTopology = safeLazy(() => _multiTenancyBundle, 'TenantTopology')
const VClusterStatus = safeLazy(() => import('./VClusterStatus'), 'VClusterStatus')

export const platformCardRegistry: CardRegistryCategory = {
  components: {
    backstage_status: BackstageStatus, contour_status: ContourStatus, dapr_status: DaprStatus, envoy_status: EnvoyStatus,
    grpc_status: GrpcStatus, linkerd_status: LinkerdStatus, longhorn_status: LonghornStatus, openfga_status: OpenfgaStatus,
    otel_status: OtelStatus, rook_status: RookStatus, spiffe_status: SpiffeStatus, cni_status: CniStatus, spire_status: SpireStatus,
    tikv_status: TikvStatus, tuf_status: TufStatus, vitess_status: VitessStatus, chaos_mesh_status: ChaosMeshStatus,
    wasmcloud_status: WasmcloudStatus, volcano_status: VolcanoStatus, crossplane_managed_resources: CrossplaneManagedResources,
    buildpacks_status: BuildpacksStatus, flatcar_status: FlatcarStatus, coredns_status: CoreDNSStatus, dns_health: CoreDNSStatus,
    keda_status: KedaStatus, fluentd_status: FluentdStatus, crio_status: CrioStatus, cloud_custodian_status: CloudCustodianStatus,
    containerd_status: ContainerdStatus, cortex_status: CortexStatus, dragonfly_status: DragonflyStatus, lima_status: LimaStatus,
    nats_status: NatsStatus, cloudevents_status: CloudEventsStatus, artifact_hub_status: ArtifactHubStatus,
    strimzi_status: StrimziStatus, kubevela_status: KubeVelaStatus, karmada_status: KarmadaStatus,
    openfeature_status: OpenFeatureStatus, openkruise_status: OpenKruiseStatus, keycloak_status: KeycloakStatus,
    openyurt_status: OpenYurtStatus, knative_status: KnativeStatus, kserve_status: KServeStatus, fluid_status: FluidStatus,
    cubefs_status: CubefsStatus, harbor_status: HarborStatus, ovn_status: OvnStatus, kubeflex_status: KubeflexStatus,
    k3s_status: K3sStatus, kubevirt_status: KubevirtStatus, vcluster_status: VClusterStatus,
    multi_tenancy_overview: MultiTenancyOverview, tenant_isolation_setup: TenantIsolationSetup, tenant_topology: TenantTopology,
  },
  preloaders: {
    backstage_status: () => import('./backstage_status'), contour_status: () => import('./contour_status'), dapr_status: () => import('./dapr_status'),
    envoy_status: () => import('./envoy_status'), grpc_status: () => import('./grpc_status'), linkerd_status: () => import('./linkerd_status'),
    longhorn_status: () => import('./longhorn_status'), openfga_status: () => import('./openfga_status'), otel_status: () => import('./otel_status'),
    rook_status: () => import('./rook_status'), spiffe_status: () => import('./spiffe_status'), cni_status: () => import('./cni_status'),
    spire_status: () => import('./spire_status'), tikv_status: () => import('./tikv_status'), tuf_status: () => import('./tuf_status'),
    vitess_status: () => import('./vitess_status'), chaos_mesh_status: () => import('./chaos_mesh_status'), wasmcloud_status: () => import('./wasmcloud_status'),
    volcano_status: () => import('./volcano_status'), crossplane_managed_resources: () => import('./crossplane-status'), buildpacks_status: () => import('./buildpacks-status'),
    flatcar_status: () => import('./flatcar_status'), coredns_status: () => import('./coredns_status'), dns_health: () => import('./coredns_status'),
    keda_status: () => import('./keda_status'), fluentd_status: () => import('./fluentd_status'), crio_status: () => import('./crio_status'),
    cloud_custodian_status: () => import('./cloud_custodian_status'), containerd_status: () => import('./containerd_status'),
    cortex_status: () => import('./cortex_status'), dragonfly_status: () => import('./dragonfly_status'), lima_status: () => import('./lima_status'),
    nats_status: () => import('./nats_status'), cloudevents_status: () => import('./cloudevents_status'), artifact_hub_status: () => import('./artifact_hub_status'),
    strimzi_status: () => import('./strimzi_status'), kubevela_status: () => import('./kubevela_status'), karmada_status: () => import('./karmada_status'),
    openfeature_status: () => import('./openfeature_status'), openkruise_status: () => import('./openkruise_status'), keycloak_status: () => import('./keycloak_status'),
    openyurt_status: () => import('./openyurt_status'), knative_status: () => import('./knative_status'), kserve_status: () => import('./kserve_status'),
    fluid_status: () => import('./fluid_status'), cubefs_status: () => import('./cubefs_status'), harbor_status: () => import('./harbor_status'),
    ovn_status: () => _multiTenancyBundle, kubeflex_status: () => _multiTenancyBundle, k3s_status: () => _multiTenancyBundle,
    kubevirt_status: () => _multiTenancyBundle, multi_tenancy_overview: () => _multiTenancyBundle, tenant_isolation_setup: () => _multiTenancyBundle,
    tenant_topology: () => _multiTenancyBundle, vcluster_status: () => import('./VClusterStatus'),
  },
  defaultWidths: {
    buildpacks_status: 6, flatcar_status: 6, artifact_hub_status: 6, coredns_status: 6, dns_health: 4, keda_status: 6,
    fluentd_status: 6, crio_status: 6, cloud_custodian_status: 6, containerd_status: 6, cortex_status: 6, dragonfly_status: 6,
    lima_status: 6, nats_status: 6, cloudevents_status: 6, strimzi_status: 6, karmada_status: 6, backstage_status: 6,
    contour_status: 6, dapr_status: 6, envoy_status: 6, grpc_status: 6, linkerd_status: 6, longhorn_status: 6,
    openfga_status: 6, otel_status: 6, rook_status: 6, spiffe_status: 6, cni_status: 6, spire_status: 6, tikv_status: 6,
    tuf_status: 6, vitess_status: 6, chaos_mesh_status: 6, wasmcloud_status: 6, volcano_status: 6, kubevela_status: 6,
    openyurt_status: 6, knative_status: 6, kserve_status: 6, fluid_status: 6, cubefs_status: 6, harbor_status: 6,
    openfeature_status: 6, openkruise_status: 6, keycloak_status: 6, crossplane_managed_resources: 4, ovn_status: 6,
    kubeflex_status: 6, k3s_status: 6, kubevirt_status: 6, vcluster_status: 6, multi_tenancy_overview: 6,
    tenant_isolation_setup: 6, tenant_topology: 6,
  },
  demoDataCards: ['crossplane_managed_resources', 'kubevela_status', 'vcluster_status', 'knative_status', 'kserve_status', 'fluid_status', 'cubefs_status', 'harbor_status'],
  liveDataCards: ['chaos_mesh_status', 'dns_health', 'artifact_hub_status', 'coredns_status', 'keda_status', 'crio_status', 'containerd_status', 'cortex_status', 'dragonfly_status', 'strimzi_status', 'keycloak_status', 'kubevela_status', 'openyurt_status', 'kserve_status', 'ovn_status', 'kubeflex_status', 'k3s_status', 'kubevirt_status', 'multi_tenancy_overview', 'tenant_isolation_setup', 'tenant_topology'],
  demoStartupPreloaders: [() => import('./crossplane-status/CrossplaneManagedResources'), () => import('./VClusterStatus')],
}
