/**
 * Structural & data-integrity tests for card demoData modules.
 *
 * Every card's demoData export is a pure data constant — these tests verify
 * that each export is well-formed, non-empty, and structurally valid. This
 * is cheap, deterministic coverage for files that are 150–470 lines each.
 */
import { describe, it, expect } from 'vitest'

import { OPENKRUISE_DEMO_DATA } from '../openkruise_status/demoData'
import { VOLCANO_DEMO_DATA } from '../volcano_status/demoData'
import { WASMCLOUD_DEMO_DATA } from '../wasmcloud_status/demoData'
import { KUBEVELA_DEMO_DATA } from '../kubevela_status/demoData'
import { OPENFGA_DEMO_DATA } from '../openfga_status/demoData'
import { STRIMZI_DEMO_DATA } from '../strimzi_status/demoData'
import { CUBEFS_DEMO_DATA } from '../cubefs_status/demoData'
import { DAPR_DEMO_DATA } from '../dapr_status/demoData'
import { FLUID_DEMO_DATA } from '../fluid_status/demoData'
import { OPENFEATURE_DEMO_DATA } from '../openfeature_status/demoData'
import { HARBOR_DEMO_DATA } from '../harbor_status/demoData'
import { KARMADA_DEMO_DATA } from '../karmada_status/demoData'
import { SPIFFE_DEMO_DATA } from '../spiffe_status/demoData'
import { KNATIVE_DEMO_DATA } from '../knative_status/demoData'
import { LINKERD_DEMO_DATA } from '../linkerd_status/demoData'

const VALID_HEALTH_VALUES = ['healthy', 'degraded', 'not-installed'] as const

// ---------------------------------------------------------------------------
// Helper: assert any array field is non-empty
// ---------------------------------------------------------------------------
function assertNonEmptyArrays(label: string, obj: Record<string, unknown>) {
  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      it(`${label}.${key} is a non-empty array`, () => {
        expect(val.length).toBeGreaterThan(0)
      })
    }
  }
}

// ---------------------------------------------------------------------------
// OpenKruise
// ---------------------------------------------------------------------------
describe('OPENKRUISE_DEMO_DATA', () => {
  it('exports a defined object', () => {
    expect(OPENKRUISE_DEMO_DATA).toBeDefined()
  })

  it('has a controllerVersion string', () => {
    expect(typeof OPENKRUISE_DEMO_DATA.controllerVersion).toBe('string')
    expect(OPENKRUISE_DEMO_DATA.controllerVersion.length).toBeGreaterThan(0)
  })

  it('has a positive totalInjectedPods count', () => {
    expect(OPENKRUISE_DEMO_DATA.totalInjectedPods).toBeGreaterThan(0)
  })

  it('has a lastCheckTime timestamp', () => {
    expect(OPENKRUISE_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  assertNonEmptyArrays('openkruise', OPENKRUISE_DEMO_DATA as unknown as Record<string, unknown>)

  it('every cloneSet has name, namespace, cluster', () => {
    for (const cs of OPENKRUISE_DEMO_DATA.cloneSets) {
      expect(cs.name).toBeTruthy()
      expect(cs.namespace).toBeTruthy()
      expect(cs.cluster).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Volcano
// ---------------------------------------------------------------------------
describe('VOLCANO_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(VOLCANO_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(VOLCANO_DEMO_DATA.health)
  })

  it('has a lastCheckTime timestamp', () => {
    expect(VOLCANO_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  assertNonEmptyArrays('volcano', VOLCANO_DEMO_DATA as unknown as Record<string, unknown>)

  it('every queue has name and weight', () => {
    for (const q of VOLCANO_DEMO_DATA.queues) {
      expect(q.name).toBeTruthy()
      expect(typeof q.weight).toBe('number')
    }
  })

  it('every job has name, queue, phase', () => {
    for (const j of VOLCANO_DEMO_DATA.jobs) {
      expect(j.name).toBeTruthy()
      expect(j.queue).toBeTruthy()
      expect(j.phase).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// wasmCloud
// ---------------------------------------------------------------------------
describe('WASMCLOUD_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(WASMCLOUD_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(WASMCLOUD_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(WASMCLOUD_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  assertNonEmptyArrays('wasmcloud', WASMCLOUD_DEMO_DATA as unknown as Record<string, unknown>)

  it('every host has a hostId and status', () => {
    for (const h of WASMCLOUD_DEMO_DATA.hosts) {
      expect(h.hostId).toBeTruthy()
      expect(h.status).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// KubeVela
// ---------------------------------------------------------------------------
describe('KUBEVELA_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(KUBEVELA_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(KUBEVELA_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(KUBEVELA_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  assertNonEmptyArrays('kubevela', KUBEVELA_DEMO_DATA as unknown as Record<string, unknown>)

  it('every application has name, namespace, cluster', () => {
    for (const app of KUBEVELA_DEMO_DATA.applications) {
      expect(app.name).toBeTruthy()
      expect(app.namespace).toBeTruthy()
      expect(app.cluster).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// OpenFGA
// ---------------------------------------------------------------------------
describe('OPENFGA_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(OPENFGA_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(OPENFGA_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(OPENFGA_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  assertNonEmptyArrays('openfga', OPENFGA_DEMO_DATA as unknown as Record<string, unknown>)
})

// ---------------------------------------------------------------------------
// Strimzi
// ---------------------------------------------------------------------------
describe('STRIMZI_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(STRIMZI_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(STRIMZI_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(STRIMZI_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  assertNonEmptyArrays('strimzi', STRIMZI_DEMO_DATA as unknown as Record<string, unknown>)

  it('every cluster has a name and health', () => {
    for (const c of STRIMZI_DEMO_DATA.clusters) {
      expect(c.name).toBeTruthy()
      expect(c.health).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// CubeFS
// ---------------------------------------------------------------------------
describe('CUBEFS_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(CUBEFS_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(CUBEFS_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(CUBEFS_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  it('has a clusterName and masterLeader', () => {
    expect(CUBEFS_DEMO_DATA.clusterName).toBeTruthy()
    expect(CUBEFS_DEMO_DATA.masterLeader).toBeTruthy()
  })

  assertNonEmptyArrays('cubefs', CUBEFS_DEMO_DATA as unknown as Record<string, unknown>)
})

// ---------------------------------------------------------------------------
// Dapr
// ---------------------------------------------------------------------------
describe('DAPR_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(DAPR_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(DAPR_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(DAPR_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  assertNonEmptyArrays('dapr', DAPR_DEMO_DATA as unknown as Record<string, unknown>)

  it('every control plane pod has name and status', () => {
    for (const p of DAPR_DEMO_DATA.controlPlane) {
      expect(p.name).toBeTruthy()
      expect(p.status).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Fluid
// ---------------------------------------------------------------------------
describe('FLUID_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(FLUID_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(FLUID_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(FLUID_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  it('has controllerPods counts', () => {
    expect(FLUID_DEMO_DATA.controllerPods.total).toBeGreaterThan(0)
  })

  assertNonEmptyArrays('fluid', FLUID_DEMO_DATA as unknown as Record<string, unknown>)
})

// ---------------------------------------------------------------------------
// OpenFeature
// ---------------------------------------------------------------------------
describe('OPENFEATURE_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(OPENFEATURE_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(OPENFEATURE_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(OPENFEATURE_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  it('has totalEvaluations count', () => {
    expect(OPENFEATURE_DEMO_DATA.totalEvaluations).toBeGreaterThan(0)
  })

  assertNonEmptyArrays('openfeature', OPENFEATURE_DEMO_DATA as unknown as Record<string, unknown>)
})

// ---------------------------------------------------------------------------
// Harbor
// ---------------------------------------------------------------------------
describe('HARBOR_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(HARBOR_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(HARBOR_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(HARBOR_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  it('has instanceName and version', () => {
    expect(HARBOR_DEMO_DATA.instanceName).toBeTruthy()
    expect(HARBOR_DEMO_DATA.version).toBeTruthy()
  })

  assertNonEmptyArrays('harbor', HARBOR_DEMO_DATA as unknown as Record<string, unknown>)
})

// ---------------------------------------------------------------------------
// Karmada
// ---------------------------------------------------------------------------
describe('KARMADA_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(KARMADA_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(KARMADA_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(KARMADA_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  it('has controllerPods counts', () => {
    expect(KARMADA_DEMO_DATA.controllerPods.total).toBeGreaterThan(0)
  })

  assertNonEmptyArrays('karmada', KARMADA_DEMO_DATA as unknown as Record<string, unknown>)
})

// ---------------------------------------------------------------------------
// SPIFFE
// ---------------------------------------------------------------------------
describe('SPIFFE_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(SPIFFE_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(SPIFFE_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(SPIFFE_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  assertNonEmptyArrays('spiffe', SPIFFE_DEMO_DATA as unknown as Record<string, unknown>)

  it('every entry has a spiffeId', () => {
    for (const e of SPIFFE_DEMO_DATA.entries) {
      expect(e.spiffeId).toBeTruthy()
      expect(e.spiffeId).toContain('spiffe://')
    }
  })
})

// ---------------------------------------------------------------------------
// Knative
// ---------------------------------------------------------------------------
describe('KNATIVE_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(KNATIVE_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(KNATIVE_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(KNATIVE_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  it('has serving and eventing controller pods', () => {
    expect(KNATIVE_DEMO_DATA.servingControllerPods.total).toBeGreaterThan(0)
    expect(KNATIVE_DEMO_DATA.eventingControllerPods.total).toBeGreaterThan(0)
  })

  assertNonEmptyArrays('knative', KNATIVE_DEMO_DATA as unknown as Record<string, unknown>)
})

// ---------------------------------------------------------------------------
// Linkerd
// ---------------------------------------------------------------------------
describe('LINKERD_DEMO_DATA', () => {
  it('exports a defined object with valid health', () => {
    expect(LINKERD_DEMO_DATA).toBeDefined()
    expect(VALID_HEALTH_VALUES).toContain(LINKERD_DEMO_DATA.health)
  })

  it('has a lastCheckTime', () => {
    expect(LINKERD_DEMO_DATA.lastCheckTime).toBeTruthy()
  })

  assertNonEmptyArrays('linkerd', LINKERD_DEMO_DATA as unknown as Record<string, unknown>)

  it('every deployment has namespace and deployment name', () => {
    for (const d of LINKERD_DEMO_DATA.deployments) {
      expect(d.namespace).toBeTruthy()
      expect(d.deployment).toBeTruthy()
    }
  })
})
