/**
 * Maps dashboard card types to the project/component they need installed for live data.
 * Used by CardWrapper to show specific "Install X for live data" CTAs on demo cards.
 *
 * - `project`: Human-readable project name shown in the CTA
 * - `missionKey`: Key passed to loadMissionPrompt() for AI install missions
 * - `kbPaths`: Paths to console-kb JSON files (tried in order) for manual install guides
 */

export interface CardInstallInfo {
  project: string
  missionKey: string
  kbPaths: string[]
}

/**
 * Card type → install info mapping.
 * Cards not in this map will show a generic "Install for live data" CTA.
 */
export const CARD_INSTALL_MAP: Record<string, CardInstallInfo> = {
  // OPA / Open Policy Agent
  opa_policies: { project: 'Open Policy Agent (OPA)', missionKey: 'install-open-policy-agent-opa', kbPaths: ['fixes/cncf-install/install-open-policy-agent-opa.json'] },
  opa_violations: { project: 'Open Policy Agent (OPA)', missionKey: 'install-open-policy-agent-opa', kbPaths: ['fixes/cncf-install/install-open-policy-agent-opa.json'] },

  // Kyverno
  kyverno_policies: { project: 'Kyverno', missionKey: 'install-kyverno', kbPaths: ['fixes/cncf-install/install-kyverno.json'] },
  kyverno_violations: { project: 'Kyverno', missionKey: 'install-kyverno', kbPaths: ['fixes/cncf-install/install-kyverno.json'] },

  // Falco
  falco_alerts: { project: 'Falco', missionKey: 'install-falco', kbPaths: ['fixes/cncf-install/install-falco.json'] },
  falco_events: { project: 'Falco', missionKey: 'install-falco', kbPaths: ['fixes/cncf-install/install-falco.json'] },

  // Istio / Service Mesh
  istio_traffic: { project: 'Istio', missionKey: 'install-istio', kbPaths: ['fixes/cncf-install/install-istio.json'] },
  istio_policies: { project: 'Istio', missionKey: 'install-istio', kbPaths: ['fixes/cncf-install/install-istio.json'] },
  service_mesh: { project: 'Istio', missionKey: 'install-istio', kbPaths: ['fixes/cncf-install/install-istio.json'] },

  // Cert Manager
  cert_manager: { project: 'cert-manager', missionKey: 'install-cert-manager', kbPaths: ['fixes/cncf-install/install-cert-manager.json'] },

  // External Secrets
  external_secrets: { project: 'External Secrets Operator', missionKey: 'install-external-secrets', kbPaths: ['fixes/cncf-install/install-external-secrets.json'] },

  // Argo CD / GitOps
  gitops_drift: { project: 'Argo CD', missionKey: 'install-argo-cd', kbPaths: ['fixes/cncf-install/install-argo-cd.json'] },
  argocd_apps: { project: 'Argo CD', missionKey: 'install-argo-cd', kbPaths: ['fixes/cncf-install/install-argo-cd.json'] },
  argocd_sync: { project: 'Argo CD', missionKey: 'install-argo-cd', kbPaths: ['fixes/cncf-install/install-argo-cd.json'] },

  // Flux
  flux_status: { project: 'Flux', missionKey: 'install-flux', kbPaths: ['fixes/cncf-install/install-flux.json'] },
  flux_sources: { project: 'Flux', missionKey: 'install-flux', kbPaths: ['fixes/cncf-install/install-flux.json'] },

  // Prometheus / Monitoring
  prometheus_alerts: { project: 'Prometheus', missionKey: 'install-prometheus', kbPaths: ['fixes/cncf-install/install-prometheus.json'] },
  prometheus_rules: { project: 'Prometheus', missionKey: 'install-prometheus', kbPaths: ['fixes/cncf-install/install-prometheus.json'] },

  // Grafana
  grafana_dashboards: { project: 'Grafana', missionKey: 'install-grafana', kbPaths: ['fixes/cncf-install/install-grafana.json'] },

  // Helm
  helm_releases: { project: 'Helm', missionKey: 'install-helm', kbPaths: ['fixes/cncf-install/install-helm.json'] },
  helm_history: { project: 'Helm', missionKey: 'install-helm', kbPaths: ['fixes/cncf-install/install-helm.json'] },

  // Tekton / CI-CD
  tekton_pipelines: { project: 'Tekton', missionKey: 'install-tekton', kbPaths: ['fixes/cncf-install/install-tekton.json'] },
  tekton_runs: { project: 'Tekton', missionKey: 'install-tekton', kbPaths: ['fixes/cncf-install/install-tekton.json'] },

  // KubeVirt
  kubevirt_status: { project: 'KubeVirt', missionKey: 'install-kubevirt', kbPaths: ['fixes/cncf-install/install-kubevirt.json'] },
  kubevirt_vms: { project: 'KubeVirt', missionKey: 'install-kubevirt', kbPaths: ['fixes/cncf-install/install-kubevirt.json'] },

  // KubeFlex
  kubeflex_status: { project: 'KubeFlex', missionKey: 'platform-kubeflex', kbPaths: ['fixes/platform-install/platform-kubeflex.json'] },

  // OVN
  ovn_status: { project: 'OVN-Kubernetes', missionKey: 'install-ovn-kubernetes', kbPaths: ['fixes/cncf-install/install-ovn-kubernetes.json'] },

  // Vault
  vault_secrets: { project: 'HashiCorp Vault', missionKey: 'install-vault', kbPaths: ['fixes/cncf-install/install-vault.json'] },

  // NVIDIA GPU Operator
  gpu_overview: { project: 'NVIDIA GPU Operator', missionKey: 'install-nvidia-gpu-operator', kbPaths: ['fixes/cncf-install/install-nvidia-gpu-operator.json'] },
  gpu_reservations: { project: 'NVIDIA GPU Operator', missionKey: 'install-nvidia-gpu-operator', kbPaths: ['fixes/cncf-install/install-nvidia-gpu-operator.json'] },

  // LLM-d
  llmd_flow: { project: 'LLM-d', missionKey: 'install-llm-d', kbPaths: ['fixes/platform-install/platform-llm-d.json'] },
  llmd_benchmarks: { project: 'LLM-d', missionKey: 'install-llm-d', kbPaths: ['fixes/platform-install/platform-llm-d.json'] },
  pareto_frontier: { project: 'LLM-d', missionKey: 'install-llm-d', kbPaths: ['fixes/platform-install/platform-llm-d.json'] },

  // Kagent / Kagenti
  kagent_status: { project: 'Kagent', missionKey: 'install-kagent', kbPaths: ['fixes/cncf-install/install-kagent.json'] },
  kagenti_status: { project: 'Kagenti', missionKey: 'install-kagenti', kbPaths: ['fixes/platform-install/install-kagenti.json'] },

  // Trivy
  trivy_scan: { project: 'Trivy', missionKey: 'install-trivy', kbPaths: ['fixes/cncf-install/install-trivy.json'] },
  image_vulnerabilities: { project: 'Trivy', missionKey: 'install-trivy', kbPaths: ['fixes/cncf-install/install-trivy.json'] },

  // Crossplane
  crossplane_status: { project: 'Crossplane', missionKey: 'install-crossplane', kbPaths: ['fixes/cncf-install/install-crossplane.json'] },

  // Knative
  knative_services: { project: 'Knative', missionKey: 'install-knative', kbPaths: ['fixes/cncf-install/install-knative.json'] },
}

/**
 * Validate CARD_INSTALL_MAP keys against the set of actually-registered
 * card types. Logs a single warning for each dead alias. Intended to be
 * called once at app bootstrap (dev builds only) so typos and cards that
 * were removed from the registry but left behind in the install map are
 * surfaced instead of silently rotting.
 *
 * @param registeredCardTypes full list of card type ids currently registered
 *        (e.g. the result of `getUnifiedCardTypes()` from config/cards/index).
 * @returns array of install-map keys that do NOT correspond to a registered card.
 */
export function validateCardInstallMap(registeredCardTypes: readonly string[]): string[] {
  const known = new Set(registeredCardTypes)
  const unknown: string[] = []
  for (const key of Object.keys(CARD_INSTALL_MAP)) {
    if (!known.has(key)) {
      unknown.push(key)
    }
  }
  if (unknown.length > 0 && typeof console !== 'undefined') {
    // eslint-disable-next-line no-console
    console.warn(
      `[cardInstallMap] ${unknown.length} install-map key(s) do not match any registered card type:`,
      unknown,
    )
  }
  return unknown
}
