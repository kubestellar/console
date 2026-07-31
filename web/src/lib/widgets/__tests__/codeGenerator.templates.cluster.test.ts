/**
 * Unit tests for generateClusterCardRender from codeGenerator.templates.cluster.ts.
 *
 * Covers the 13 cluster-oriented card render templates plus the default (null)
 * fallback path. Each case is exercised through the exported entrypoint with a
 * fixed TemplateHelpers stub so we assert against the produced source string.
 */
import { describe, it, expect } from 'vitest'
import { generateClusterCardRender } from '../codeGenerator.templates.cluster'
import type { TemplateHelpers } from '../codeGenerator.templates'

const helpers: TemplateHelpers = {
  parseBlock: '\n  const trimmed = (output || "").trim();\n  let data = null, error = null;\n  try { data = JSON.parse(trimmed); } catch { error = "Parse error"; }',
  wrapOpen: '\n  return (<div className="widget-container">',
  wrapClose: '</div>);\n',
  issueButton: '<button onClick={openIssue}>Report Issue</button>',
  title: 'Test Title',
}

const CLUSTER_CASES = [
  'cluster_health',
  'pod_issues',
  'gpu_overview',
  'cluster_metrics',
  'workload_status',
  'security_issues',
  'app_status',
  'top_pods',
  'console_ai_offline_detection',
  'console_ai_health_check',
  'namespace_overview',
  'event_summary',
  'warning_events',
] as const

describe('generateClusterCardRender', () => {
  describe('unknown card types', () => {
    it('returns null for cards not handled by the cluster switch', () => {
      expect(generateClusterCardRender('storage_overview', helpers)).toBeNull()
      expect(generateClusterCardRender('totally_unknown', helpers)).toBeNull()
      expect(generateClusterCardRender('', helpers)).toBeNull()
    })
  })

  describe('shared render contract', () => {
    it.each(CLUSTER_CASES)('generates a non-null render body for "%s"', (cardType) => {
      const code = generateClusterCardRender(cardType, helpers)
      expect(code).not.toBeNull()
      expect(typeof code).toBe('string')
      expect((code as string).length).toBeGreaterThan(0)
    })

    it.each(CLUSTER_CASES)('embeds parseBlock/wrapOpen/wrapClose helpers for "%s"', (cardType) => {
      const code = generateClusterCardRender(cardType, helpers) as string
      expect(code).toContain(helpers.parseBlock)
      expect(code).toContain(helpers.wrapOpen)
      expect(code).toContain(helpers.wrapClose)
    })

    it.each(CLUSTER_CASES)('embeds the issueButton helper in the error branch for "%s"', (cardType) => {
      const code = generateClusterCardRender(cardType, helpers) as string
      expect(code).toContain(helpers.issueButton)
    })

    it.each(CLUSTER_CASES)('exports a render arrow function for "%s"', (cardType) => {
      const code = generateClusterCardRender(cardType, helpers) as string
      expect(code).toContain('export const render = ({ output }) =>')
    })

    it.each(CLUSTER_CASES)('renders an "Error:" branch with the error variable for "%s"', (cardType) => {
      const code = generateClusterCardRender(cardType, helpers) as string
      expect(code).toContain('if (error)')
      expect(code).toContain('Error: {error}')
    })
  })

  describe('cluster_health case', () => {
    it('reads data?.clusters and computes healthy/unhealthy counts', () => {
      const code = generateClusterCardRender('cluster_health', helpers) as string
      expect(code).toContain('data?.clusters')
      expect(code).toContain('Healthy')
      expect(code).toContain('Unhealthy')
      expect(code).toContain("c.healthy !== false")
    })

    it('uses warning color when there are unhealthy clusters', () => {
      const code = generateClusterCardRender('cluster_health', helpers) as string
      expect(code).toContain('unhealthy > 0 ? styles.colors.warning : styles.colors.healthy')
    })
  })

  describe('pod_issues case', () => {
    it('classifies CrashLoopBackOff, OOMKilled and other reasons', () => {
      const code = generateClusterCardRender('pod_issues', helpers) as string
      expect(code).toContain('CrashLoopBackOff')
      expect(code).toContain('OOMKilled')
      expect(code).toContain('other')
    })

    it('coerces data.issues into an array before filtering', () => {
      const code = generateClusterCardRender('pod_issues', helpers) as string
      expect(code).toContain('data?.issues || data || []')
      expect(code).toContain('Array.isArray(rawIssues) ? rawIssues : []')
    })

    it('renders a "total issues" summary line', () => {
      const code = generateClusterCardRender('pod_issues', helpers) as string
      expect(code).toContain('total issues')
    })
  })

  describe('gpu_overview case', () => {
    it('exists and renders a body', () => {
      const code = generateClusterCardRender('gpu_overview', helpers) as string
      expect(code).not.toBeNull()
      expect(code).toContain('data')
    })
  })

  describe('cluster_metrics case', () => {
    it('reduces node and pod counts across clusters', () => {
      const code = generateClusterCardRender('cluster_metrics', helpers) as string
      expect(code).toContain('data?.clusters')
      expect(code).toContain('c.nodeCount || 0')
      expect(code).toContain('c.podCount || 0')
      expect(code).toContain('reduce((s, c)')
    })

    it('labels the three stat blocks Clusters/Nodes/Pods', () => {
      const code = generateClusterCardRender('cluster_metrics', helpers) as string
      expect(code).toContain('>Clusters<')
      expect(code).toContain('>Nodes<')
      expect(code).toContain('>Pods<')
    })
  })

  describe('workload_status case', () => {
    it('treats readyReplicas > 0 or status Running as running', () => {
      const code = generateClusterCardRender('workload_status', helpers) as string
      expect(code).toContain("w.status === 'Running'")
      expect(code).toContain('w.readyReplicas > 0')
    })

    it('labels running and degraded counts', () => {
      const code = generateClusterCardRender('workload_status', helpers) as string
      expect(code).toContain('>Running<')
      expect(code).toContain('>Degraded<')
      expect(code).toContain('total workloads')
    })
  })

  describe('security_issues case', () => {
    it('bucketizes severities into high/critical, medium, low', () => {
      const code = generateClusterCardRender('security_issues', helpers) as string
      expect(code).toContain("i.severity === 'high' || i.severity === 'critical'")
      expect(code).toContain("i.severity === 'medium'")
      expect(code).toContain("i.severity === 'low'")
      expect(code).toContain('High/Critical')
      expect(code).toContain('>Medium<')
      expect(code).toContain('>Low<')
    })

    it('renders a "No issues found" empty state', () => {
      const code = generateClusterCardRender('security_issues', helpers) as string
      expect(code).toContain('No issues found')
      expect(code).toContain('issues.length === 0')
    })
  })

  describe('app_status case', () => {
    it('counts running workloads and total workloads', () => {
      const code = generateClusterCardRender('app_status', helpers) as string
      expect(code).toContain("w.status === 'Running'")
      expect(code).toContain('workloads.length')
      expect(code).toContain('>Running<')
      expect(code).toContain('>Total<')
    })

    it('uses healthy color only when all workloads are running and total > 0', () => {
      const code = generateClusterCardRender('app_status', helpers) as string
      expect(code).toContain('running === total && total > 0 ? styles.colors.healthy : styles.colors.warning')
    })
  })

  describe('top_pods case', () => {
    it('caps the list at the first 8 pods', () => {
      const code = generateClusterCardRender('top_pods', helpers) as string
      expect(code).toContain('data?.pods || []).slice(0, 8')
    })

    it('renders an empty state when no pods are present', () => {
      const code = generateClusterCardRender('top_pods', helpers) as string
      expect(code).toContain('No pods found')
      expect(code).toContain('pods.length === 0')
    })

    it('maps each pod to name + status', () => {
      const code = generateClusterCardRender('top_pods', helpers) as string
      expect(code).toContain('pods.map((p, i)')
      expect(code).toContain('{p.name}')
      expect(code).toContain('{p.status}')
    })
  })

  describe('console_ai_offline_detection case', () => {
    it('separates online from offline nodes by status Ready', () => {
      const code = generateClusterCardRender('console_ai_offline_detection', helpers) as string
      expect(code).toContain('data?.nodes')
      expect(code).toContain("n.status !== 'Ready'")
      expect(code).toContain('>Online<')
      expect(code).toContain('>Offline<')
    })

    it('uses error color when any node is offline', () => {
      const code = generateClusterCardRender('console_ai_offline_detection', helpers) as string
      expect(code).toContain('offline > 0 ? styles.colors.error : styles.colors.healthy')
    })
  })

  describe('console_ai_health_check case', () => {
    it('counts healthy clusters against total', () => {
      const code = generateClusterCardRender('console_ai_health_check', helpers) as string
      expect(code).toContain('data?.clusters')
      expect(code).toContain('c.healthy !== false')
      expect(code).toContain('>Healthy<')
      expect(code).toContain('>Total<')
    })

    it('uses healthy color only when all clusters are healthy and total > 0', () => {
      const code = generateClusterCardRender('console_ai_health_check', helpers) as string
      expect(code).toContain('healthy === clusters.length && clusters.length > 0 ? styles.colors.healthy : styles.colors.warning')
    })
  })

  describe('namespace_overview case', () => {
    it('displays the namespace count from data.namespaces', () => {
      const code = generateClusterCardRender('namespace_overview', helpers) as string
      expect(code).toContain('data?.namespaces')
      expect(code).toContain('namespaces.length')
      expect(code).toContain('>Namespaces<')
    })
  })

  describe('event_summary case', () => {
    it('splits events into Normal and Warning buckets', () => {
      const code = generateClusterCardRender('event_summary', helpers) as string
      expect(code).toContain("e.type === 'Warning'")
      expect(code).toContain("e.type === 'Normal'")
      expect(code).toContain('>Normal<')
      expect(code).toContain('>Warning<')
      expect(code).toContain('total events')
    })
  })

  describe('warning_events case', () => {
    it('takes the first 6 events and renders reason + message', () => {
      const code = generateClusterCardRender('warning_events', helpers) as string
      expect(code).toContain('data?.events || []).slice(0, 6')
      expect(code).toContain('{ev.reason}')
      expect(code).toContain('{ev.message}')
    })

    it('renders "No warnings" when the event list is empty', () => {
      const code = generateClusterCardRender('warning_events', helpers) as string
      expect(code).toContain('No warnings')
      expect(code).toContain('events.length === 0')
    })
  })

  describe('array-safety guards (CLAUDE.md rule)', () => {
    it.each([
      ['cluster_health', 'data?.clusters || []'],
      ['cluster_metrics', 'data?.clusters || []'],
      ['workload_status', 'data?.workloads || []'],
      ['security_issues', 'data?.issues || []'],
      ['app_status', 'data?.workloads || []'],
      ['console_ai_offline_detection', 'data?.nodes || []'],
      ['console_ai_health_check', 'data?.clusters || []'],
      ['namespace_overview', 'data?.namespaces || []'],
      ['event_summary', 'data?.events || []'],
    ])('%s guards the source array with "|| []"', (cardType, guard) => {
      const code = generateClusterCardRender(cardType, helpers) as string
      expect(code).toContain(guard)
    })
  })
})
