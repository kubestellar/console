// Custom title overrides for specific card types
const CUSTOM_TITLES: Record<string, string> = {
  app_status: 'Workload Status',
  chart_versions: 'Helm Chart Versions',
  deployment_missions: 'Deployment Missions',
  helm_release_status: 'Helm Release Status',
  helm_history: 'Helm History',
  helm_values_diff: 'Helm Values Diff',
  resource_marshall: 'Resource Marshall',
}

// Known acronyms that should stay uppercase
const ACRONYMS = new Set([
  'opa',
  'gpu',
  'pvc',
  'pv',
  'crd',
  'ai',
  'api',
  'cpu',
  'ram',
  'ssd',
  'hdd',
  'rbac',
  'iam',
  'dns',
  'url',
  'uri',
  'http',
  'https',
  'tcp',
  'udp',
  'ip',
  'vpc',
  'eks',
  'aks',
  'gke',
  'olm',
  'lcp',
  'argocd',
])

/**
 * Formats a card_type string into a proper title
 * Handles acronyms properly (e.g., "opa_policies" -> "OPA Policies")
 * Uses custom title overrides for specific card types
 */
export function formatCardTitle(cardType: string): string {
  // Check for custom title override first
  if (CUSTOM_TITLES[cardType]) {
    return CUSTOM_TITLES[cardType]
  }

  return cardType
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => {
      const lower = word.toLowerCase()
      if (ACRONYMS.has(lower)) {
        // Special case for ArgoCD
        if (lower === 'argocd') return 'ArgoCD'
        return word.toUpperCase()
      }
      // Capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}
