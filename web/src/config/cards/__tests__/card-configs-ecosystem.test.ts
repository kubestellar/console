/**
 * Ecosystem & Runtime Card Config Tests
 * Covers: ACMM, backstage, cloud-custodian, CNI, containerd, cortex, cubefs,
 * dapr, dragonfly, drasi, envoy, flatcar, grpc, harbor, keda, keycloak,
 * kserve, kubevela, kubevirt, linkerd, longhorn, openfeature, openfga, otel,
 * rook, spiffe, spire, strimzi, tikv, tuf, vcluster, vitess, volcano, wasmcloud
 */
import { describe, it, expect } from 'vitest'
import { acmmFeedbackLoopsConfig } from '../acmm-feedback-loops'
import { acmmLevelConfig } from '../acmm-level'
import { acmmRecommendationsConfig } from '../acmm-recommendations'
import { backstageStatusConfig } from '../backstage-status'
import { cloudCustodianStatusConfig } from '../cloud-custodian-status'
import { cniStatusConfig } from '../cni-status'
import { containerdStatusConfig } from '../containerd-status'
import { cortexStatusConfig } from '../cortex-status'
import { cubefsStatusConfig } from '../cubefs-status'
import { daprStatusConfig } from '../dapr-status'
import { dragonflyStatusConfig } from '../dragonfly-status'
import { envoyStatusConfig } from '../envoy-status'
import { flatcarStatusConfig } from '../flatcar-status'
import { grpcStatusConfig } from '../grpc-status'
import { harborStatusConfig } from '../harbor-status'
import { kedaStatusConfig } from '../keda-status'
import { keycloakStatusConfig } from '../keycloak-status'
import { kserveStatusConfig } from '../kserve-status'
import { kubeVelaStatusConfig } from '../kubevela-status'
import { kubevirtStatusConfig } from '../kubevirt-status'
import { linkerdStatusConfig } from '../linkerd-status'
import { longhornStatusConfig } from '../longhorn-status'
import { openfeatureStatusConfig } from '../openfeature-status'
import { openfgaStatusConfig } from '../openfga-status'
import { otelStatusConfig } from '../otel-status'
import { rookStatusConfig } from '../rook-status'
import { spiffeStatusConfig } from '../spiffe-status'
import { spireStatusConfig } from '../spire-status'
import { strimziStatusConfig } from '../strimzi-status'
import { tikvStatusConfig } from '../tikv-status'
import { tufStatusConfig } from '../tuf-status'
import { vclusterStatusConfig } from '../vcluster-status'
import { vitessStatusConfig } from '../vitess-status'
import { volcanoStatusConfig } from '../volcano-status'
import { wasmcloudStatusConfig } from '../wasmcloud-status'

const ecosystemCards = [
  { name: 'acmmFeedbackLoops', config: acmmFeedbackLoopsConfig },
  { name: 'acmmLevel', config: acmmLevelConfig },
  { name: 'acmmRecommendations', config: acmmRecommendationsConfig },
  { name: 'backstageStatus', config: backstageStatusConfig },
  { name: 'cloudCustodianStatus', config: cloudCustodianStatusConfig },
  { name: 'cniStatus', config: cniStatusConfig },
  { name: 'containerdStatus', config: containerdStatusConfig },
  { name: 'cortexStatus', config: cortexStatusConfig },
  { name: 'cubefsStatus', config: cubefsStatusConfig },
  { name: 'daprStatus', config: daprStatusConfig },
  { name: 'dragonflyStatus', config: dragonflyStatusConfig },
  { name: 'envoyStatus', config: envoyStatusConfig },
  { name: 'flatcarStatus', config: flatcarStatusConfig },
  { name: 'grpcStatus', config: grpcStatusConfig },
  { name: 'harborStatus', config: harborStatusConfig },
  { name: 'kedaStatus', config: kedaStatusConfig },
  { name: 'keycloakStatus', config: keycloakStatusConfig },
  { name: 'kserveStatus', config: kserveStatusConfig },
  { name: 'kubeVelaStatus', config: kubeVelaStatusConfig },
  { name: 'kubevirtStatus', config: kubevirtStatusConfig },
  { name: 'linkerdStatus', config: linkerdStatusConfig },
  { name: 'longhornStatus', config: longhornStatusConfig },
  { name: 'openfeatureStatus', config: openfeatureStatusConfig },
  { name: 'openfgaStatus', config: openfgaStatusConfig },
  { name: 'otelStatus', config: otelStatusConfig },
  { name: 'rookStatus', config: rookStatusConfig },
  { name: 'spiffeStatus', config: spiffeStatusConfig },
  { name: 'spireStatus', config: spireStatusConfig },
  { name: 'strimziStatus', config: strimziStatusConfig },
  { name: 'tikvStatus', config: tikvStatusConfig },
  { name: 'tufStatus', config: tufStatusConfig },
  { name: 'vclusterStatus', config: vclusterStatusConfig },
  { name: 'vitessStatus', config: vitessStatusConfig },
  { name: 'volcanoStatus', config: volcanoStatusConfig },
  { name: 'wasmcloudStatus', config: wasmcloudStatusConfig },
]

describe('Ecosystem & runtime card configs', () => {
  it.each(ecosystemCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(ecosystemCards)('$name has icon and color', ({ config }) => {
    expect(config.icon).toBeTruthy()
    expect(config.iconColor).toBeTruthy()
  })

  it.each(ecosystemCards)('$name has loading and empty states', ({ config }) => {
    expect(config.loadingState).toBeDefined()
    expect(config.emptyState).toBeDefined()
    expect(config.emptyState.title).toBeTruthy()
  })

  it.each(ecosystemCards)('$name has default dimensions', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThan(0)
    expect(config.defaultHeight).toBeGreaterThan(0)
  })
})
