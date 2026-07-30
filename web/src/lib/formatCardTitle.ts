// Custom title overrides for specific card types
const CUSTOM_TITLES: Record<string, string> = {
  app_status: 'Workload Status',
  chart_versions: 'Helm Chart Versions',
  deployment_missions: 'Deployment Missions',
  helm_release_status: 'Helm Release Status',
  helm_history: 'Helm History',
  helm_values_diff: 'Helm Values Diff',
  resource_marshall: 'Resource Marshall',
  // llm-d cards - use lowercase "llm-d" per project convention
  llmd_flow: 'llm-d Request Flow',
  llmd_stack_monitor: 'llm-d Stack Monitor',
  llmd_ai_insights: 'llm-d AI Insights',
  llmd_configurator: 'llm-d Configurator',
  llm_inference: 'llm-d Inference',
  llm_models: 'llm-d Models',
  kvcache_monitor: 'KV Cache Monitor',
  epp_routing: 'EPP Routing',
  pd_disaggregation: 'P/D Disaggregation',
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

/** Fallback title used when a card_type is missing or not a string. */
const UNKNOWN_CARD_TITLE = 'Unknown Card'

/**
 * Formats a card_type string into a proper title
 * Handles acronyms properly (e.g., "opa_policies" -> "OPA Policies")
 * Uses custom title overrides for specific card types
 *
 * Returns a safe fallback when `cardType` is null/undefined or not a string
 * so callers don't crash on corrupt/legacy dashboard layouts. See issue #5902
 * where a legacy field-name mismatch caused card.card_type to be undefined
 * and triggered "can't access property 'replace', cardType is undefined".
 */
export function formatCardTitle(cardType: string | null | undefined): string {
  // Defensive guard — stale localStorage or bad API payloads can produce
  // cards without a card_type. Never crash the whole dashboard over it.
  if (cardType === null || cardType === undefined || typeof cardType !== 'string') {
    return UNKNOWN_CARD_TITLE
  }

  // Preserve the historical behavior of returning an empty string for
  // an empty input — only `null`/`undefined` fall back to "Unknown Card".
  if (cardType === '') {
    return ''
  }

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
