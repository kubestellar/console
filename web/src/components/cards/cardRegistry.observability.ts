import type { CardComponent } from './cardRegistry.types'
import { safeLazy } from '../../lib/safeLazy'

const BackstageStatus = safeLazy(() => import('./backstage_status'), 'BackstageStatus')
const CniStatus = safeLazy(() => import('./cni_status'), 'CniStatus')
const ContainerdStatus = safeLazy(() => import('./containerd_status'), 'ContainerdStatus')
const ContourStatus = safeLazy(() => import('./contour_status'), 'ContourStatus')
const CoreDNSStatus = safeLazy(() => import('./coredns_status'), 'CoreDNSStatus')
const CortexStatus = safeLazy(() => import('./cortex_status'), 'CortexStatus')
const DaprStatus = safeLazy(() => import('./dapr_status'), 'DaprStatus')
const EnvoyStatus = safeLazy(() => import('./envoy_status'), 'EnvoyStatus')
const FluentdStatus = safeLazy(() => import('./fluentd_status'), 'FluentdStatus')
const GrpcStatus = safeLazy(() => import('./grpc_status'), 'GrpcStatus')
const HarborStatus = safeLazy(() => import('./harbor_status'), 'HarborStatus')
const JaegerStatus = safeLazy(() => import('./jaeger_status'), 'JaegerStatus')
const LinkerdStatus = safeLazy(() => import('./linkerd_status'), 'LinkerdStatus')
const LonghornStatus = safeLazy(() => import('./longhorn_status'), 'LonghornStatus')
const NatsStatus = safeLazy(() => import('./nats_status'), 'NatsStatus')
const OtelStatus = safeLazy(() => import('./otel_status'), 'OtelStatus')
const RookStatus = safeLazy(() => import('./rook_status'), 'RookStatus')
const SpiffeStatus = safeLazy(() => import('./spiffe_status'), 'SpiffeStatus')
const SpireStatus = safeLazy(() => import('./spire_status'), 'SpireStatus')
const TikvStatus = safeLazy(() => import('./tikv_status'), 'TikvStatus')
const VitessStatus = safeLazy(() => import('./vitess_status'), 'VitessStatus')

/**
 * Observability and platform telemetry cards.
 * Cards:
 * backstage_status, cni_status, containerd_status, contour_status, coredns_status, cortex_status,
 * dapr_status, dns_health, envoy_status, fluentd_status, grpc_status, harbor_status,
 * jaeger_status, linkerd_status, longhorn_status, nats_status, otel_status, rook_status,
 * spiffe_status, spire_status, tikv_status, vitess_status
 */
export interface CardRegistryDomain {
  components: Record<string, CardComponent>
  demoDataCards: Set<string>
  liveDataCards: Set<string>
  chunkPreloaders: Record<string, () => Promise<unknown>>
  defaultWidths: Record<string, number>
}

const components: Record<string, CardComponent> = {
  backstage_status: BackstageStatus,
  cni_status: CniStatus,
  containerd_status: ContainerdStatus,
  contour_status: ContourStatus,
  coredns_status: CoreDNSStatus,
  cortex_status: CortexStatus,
  dapr_status: DaprStatus,
  dns_health: CoreDNSStatus,
  envoy_status: EnvoyStatus,
  fluentd_status: FluentdStatus,
  grpc_status: GrpcStatus,
  harbor_status: HarborStatus,
  jaeger_status: JaegerStatus,
  linkerd_status: LinkerdStatus,
  longhorn_status: LonghornStatus,
  nats_status: NatsStatus,
  otel_status: OtelStatus,
  rook_status: RookStatus,
  spiffe_status: SpiffeStatus,
  spire_status: SpireStatus,
  tikv_status: TikvStatus,
  vitess_status: VitessStatus,
}

export const observabilityCardRegistry: CardRegistryDomain = {
  components,
  demoDataCards: new Set([
    'harbor_status',
  ]),
  liveDataCards: new Set([
    'containerd_status',
    'coredns_status',
    'cortex_status',
    'dns_health',
  ]),
  chunkPreloaders: {
    backstage_status: () => import('./backstage_status'),
    cni_status: () => import('./cni_status'),
    containerd_status: () => import('./containerd_status'),
    contour_status: () => import('./contour_status'),
    coredns_status: () => import('./coredns_status'),
    cortex_status: () => import('./cortex_status'),
    dapr_status: () => import('./dapr_status'),
    dns_health: () => import('./cluster-admin-bundle'),
    envoy_status: () => import('./envoy_status'),
    fluentd_status: () => import('./fluentd_status'),
    grpc_status: () => import('./grpc_status'),
    harbor_status: () => import('./harbor_status'),
    jaeger_status: () => import('./jaeger_status'),
    linkerd_status: () => import('./linkerd_status'),
    longhorn_status: () => import('./longhorn_status'),
    nats_status: () => import('./nats_status'),
    otel_status: () => import('./otel_status'),
    rook_status: () => import('./rook_status'),
    spiffe_status: () => import('./spiffe_status'),
    spire_status: () => import('./spire_status'),
    tikv_status: () => import('./tikv_status'),
    vitess_status: () => import('./vitess_status'),
  },
  defaultWidths: {
    backstage_status: 6,
    cni_status: 6,
    containerd_status: 6,
    contour_status: 6,
    coredns_status: 6,
    cortex_status: 6,
    dapr_status: 6,
    dns_health: 4,
    envoy_status: 6,
    fluentd_status: 6,
    grpc_status: 6,
    harbor_status: 6,
    linkerd_status: 6,
    longhorn_status: 6,
    nats_status: 6,
    otel_status: 6,
    rook_status: 6,
    spiffe_status: 6,
    spire_status: 6,
    tikv_status: 6,
    vitess_status: 6,
  },
}
