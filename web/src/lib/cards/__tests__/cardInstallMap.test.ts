import { describe, it, expect, vi } from 'vitest'
import { CARD_INSTALL_MAP, validateCardInstallMap } from '../cardInstallMap'

describe('CARD_INSTALL_MAP', () => {
  it('is a non-empty record', () => {
    const keys = Object.keys(CARD_INSTALL_MAP)
    expect(keys.length).toBeGreaterThan(0)
  })

  it('each entry has project, missionKey, and kbPaths', () => {
    for (const [, info] of Object.entries(CARD_INSTALL_MAP)) {
      expect(info.project).toBeTruthy()
      expect(info.missionKey).toBeTruthy()
      expect(Array.isArray(info.kbPaths)).toBe(true)
      expect(info.kbPaths.length).toBeGreaterThan(0)
    }
  })

  it('contains OPA cards', () => {
    expect(CARD_INSTALL_MAP.opa_policies).toBeDefined()
    expect(CARD_INSTALL_MAP.opa_policies.project).toContain('OPA')
  })

  it('contains Kyverno cards', () => {
    expect(CARD_INSTALL_MAP.kyverno_policies).toBeDefined()
    expect(CARD_INSTALL_MAP.kyverno_policies.project).toContain('Kyverno')
  })

  it('kbPaths are valid paths', () => {
    for (const [, info] of Object.entries(CARD_INSTALL_MAP)) {
      for (const path of info.kbPaths) {
        expect(path).toMatch(/\.json$/)
      }
    }
  })

  it('contains Falco cards', () => {
    expect(CARD_INSTALL_MAP.falco_alerts).toBeDefined()
    expect(CARD_INSTALL_MAP.falco_alerts.project).toContain('Falco')
    expect(CARD_INSTALL_MAP.falco_events).toBeDefined()
  })

  it('contains Istio cards', () => {
    expect(CARD_INSTALL_MAP.istio_traffic).toBeDefined()
    expect(CARD_INSTALL_MAP.istio_traffic.project).toBe('Istio')
    expect(CARD_INSTALL_MAP.service_mesh).toBeDefined()
    expect(CARD_INSTALL_MAP.service_mesh.project).toBe('Istio')
  })

  it('contains cert-manager card', () => {
    expect(CARD_INSTALL_MAP.cert_manager).toBeDefined()
    expect(CARD_INSTALL_MAP.cert_manager.project).toBe('cert-manager')
  })

  it('contains Argo CD cards', () => {
    expect(CARD_INSTALL_MAP.argocd_apps).toBeDefined()
    expect(CARD_INSTALL_MAP.argocd_sync).toBeDefined()
    expect(CARD_INSTALL_MAP.gitops_drift).toBeDefined()
    expect(CARD_INSTALL_MAP.argocd_apps.project).toBe('Argo CD')
  })

  it('contains Flux cards', () => {
    expect(CARD_INSTALL_MAP.flux_status).toBeDefined()
    expect(CARD_INSTALL_MAP.flux_sources).toBeDefined()
    expect(CARD_INSTALL_MAP.flux_status.project).toBe('Flux')
  })

  it('contains GPU cards', () => {
    expect(CARD_INSTALL_MAP.gpu_overview).toBeDefined()
    expect(CARD_INSTALL_MAP.gpu_reservations).toBeDefined()
    expect(CARD_INSTALL_MAP.gpu_overview.project).toContain('NVIDIA')
  })

  it('contains LLM-d cards', () => {
    expect(CARD_INSTALL_MAP.llmd_flow).toBeDefined()
    expect(CARD_INSTALL_MAP.llmd_benchmarks).toBeDefined()
    expect(CARD_INSTALL_MAP.llmd_flow.project).toBe('LLM-d')
  })

  it('contains Trivy cards', () => {
    expect(CARD_INSTALL_MAP.trivy_scan).toBeDefined()
    expect(CARD_INSTALL_MAP.image_vulnerabilities).toBeDefined()
    expect(CARD_INSTALL_MAP.trivy_scan.project).toBe('Trivy')
  })

  it('contains Crossplane card', () => {
    expect(CARD_INSTALL_MAP.crossplane_status).toBeDefined()
    expect(CARD_INSTALL_MAP.crossplane_status.project).toBe('Crossplane')
  })

  it('contains Knative card', () => {
    expect(CARD_INSTALL_MAP.knative_services).toBeDefined()
    expect(CARD_INSTALL_MAP.knative_services.project).toBe('Knative')
  })

  it('contains Prometheus cards', () => {
    expect(CARD_INSTALL_MAP.prometheus_alerts).toBeDefined()
    expect(CARD_INSTALL_MAP.prometheus_rules).toBeDefined()
    expect(CARD_INSTALL_MAP.prometheus_alerts.project).toBe('Prometheus')
  })

  it('contains Helm cards', () => {
    expect(CARD_INSTALL_MAP.helm_releases).toBeDefined()
    expect(CARD_INSTALL_MAP.helm_history).toBeDefined()
  })

  it('contains Tekton cards', () => {
    expect(CARD_INSTALL_MAP.tekton_pipelines).toBeDefined()
    expect(CARD_INSTALL_MAP.tekton_runs).toBeDefined()
  })

  it('contains KubeVirt cards', () => {
    expect(CARD_INSTALL_MAP.kubevirt_status).toBeDefined()
    expect(CARD_INSTALL_MAP.kubevirt_vms).toBeDefined()
  })

  it('missionKey is a non-empty string for all entries', () => {
    for (const [, info] of Object.entries(CARD_INSTALL_MAP)) {
      expect(typeof info.missionKey).toBe('string')
      expect(info.missionKey.length).toBeGreaterThan(0)
    }
  })

  it('kbPaths start with fixes/', () => {
    for (const [, info] of Object.entries(CARD_INSTALL_MAP)) {
      for (const path of info.kbPaths) {
        expect(path).toMatch(/^fixes\//)
      }
    }
  })
})

// #6699 — validateCardInstallMap flags install-map keys that don't match a
// registered card type so dead aliases get surfaced instead of rotting.
describe('validateCardInstallMap', () => {
  it('returns an empty list when every key is registered', () => {
    const known = Object.keys(CARD_INSTALL_MAP)
    const unknown = validateCardInstallMap(known)
    expect(unknown).toEqual([])
  })

  it('reports keys that are missing from the registered set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // Pretend only a single key is registered — every other key should
      // come back as unknown.
      const unknown = validateCardInstallMap(['opa_policies'])
      expect(unknown.length).toBeGreaterThan(0)
      expect(unknown).not.toContain('opa_policies')
      // Validator logs exactly once with the offending keys.
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('does not warn when every key is registered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      validateCardInstallMap(Object.keys(CARD_INSTALL_MAP))
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
