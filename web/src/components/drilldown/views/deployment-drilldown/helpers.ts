/** Kubernetes set-based label selector expression */
export interface LabelSelectorRequirement {
  key: string
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist'
  values?: string[]
}

/**
 * Classify a raw kubectl scale error into a stable i18n key. The caller
 * runs `t(...)` on the result. Returning a static key literal keeps the
 * keys compatible with i18next-typescript strict typing (no runtime
 * template literals inside t()).
 *
 * Issue 9284: previously we surfaced the full kubectl stderr, which exposed
 * internal cluster details (namespaces, group-version-kind, resource versions)
 * that aren't useful to end users.
 */
export type ScaleErrorKey =
  | 'drilldown.scale.failedGeneric'
  | 'drilldown.scale.failedForbidden'
  | 'drilldown.scale.failedNotFound'
  | 'drilldown.scale.failedInvalid'
  | 'drilldown.scale.failedConflict'
  | 'drilldown.scale.failedTimeout'

export function classifyScaleError(raw: string): ScaleErrorKey {
  const lc = (raw || '').toLowerCase()
  if (!raw) return 'drilldown.scale.failedGeneric'
  if (lc.includes('forbidden') || lc.includes('cannot patch') || lc.includes('unauthorized')) {
    return 'drilldown.scale.failedForbidden'
  }
  if (lc.includes('not found') || lc.includes('notfound')) {
    return 'drilldown.scale.failedNotFound'
  }
  if (lc.includes('invalid') || lc.includes('must be') || lc.includes('out of range')) {
    return 'drilldown.scale.failedInvalid'
  }
  if (lc.includes('conflict') || lc.includes('modified')) {
    return 'drilldown.scale.failedConflict'
  }
  if (lc.includes('timeout') || lc.includes('timed out') || lc.includes('deadline')) {
    return 'drilldown.scale.failedTimeout'
  }
  return 'drilldown.scale.failedGeneric'
}

/**
 * Build a kubectl-compatible label selector string from matchLabels and matchExpressions.
 * Supports both equality-based (matchLabels) and set-based (matchExpressions) selectors.
 *
 * kubectl -l format:
 *   matchLabels:      "key=value"
 *   In:               "key in (val1,val2)"
 *   NotIn:            "key notin (val1,val2)"
 *   Exists:           "key"
 *   DoesNotExist:     "!key"
 */
export function buildLabelSelector(
  matchLabels?: Record<string, unknown>,
  matchExpressions?: LabelSelectorRequirement[],
): string {
  const parts: string[] = []

  if (matchLabels) {
    for (const [k, v] of Object.entries(matchLabels)) {
      parts.push(`${k}=${v}`)
    }
  }

  if (matchExpressions) {
    for (const expr of matchExpressions) {
      const values = (expr.values || []).join(',')
      switch (expr.operator) {
        case 'In':
          parts.push(`${expr.key} in (${values})`)
          break
        case 'NotIn':
          parts.push(`${expr.key} notin (${values})`)
          break
        case 'Exists':
          parts.push(expr.key)
          break
        case 'DoesNotExist':
          parts.push(`!${expr.key}`)
          break
      }
    }
  }

  return parts.join(',')
}
