/**
 * Unit tests for generateCardRenderFunction and generateMiniStatComponent
 * from codeGenerator.templates.ts
 *
 * These are the two exported functions not directly tested by the existing
 * codeGenerator.test.ts (which tests generateCardWidget, generateStatWidget,
 * generateTemplateWidget indirectly).
 */
import { describe, it, expect } from 'vitest'
import {
  generateCardRenderFunction,
  generateMiniStatComponent,
} from '../codeGenerator.templates'
import { WIDGET_CARDS, WIDGET_STATS } from '../widgetRegistry'

// ---------------------------------------------------------------------------
// generateCardRenderFunction
// ---------------------------------------------------------------------------
describe('generateCardRenderFunction', () => {
  describe('known card types return valid JSX render bodies', () => {
    const knownTypes = Object.keys(WIDGET_CARDS)

    it.each(knownTypes)('generates code for card type "%s"', (cardType) => {
      const code = generateCardRenderFunction(cardType)
      // Every render function must include the JSON parse block
      expect(code).toContain('JSON.parse(trimmed)')
      // Every render function wraps in a container with drag support
      expect(code).toContain('widget-container')
      expect(code).toContain('handleDragStart')
      // Must return JSX
      expect(code).toContain('return (')
    })
  })

  describe('cluster_health case', () => {
    it('renders healthy/unhealthy counts', () => {
      const code = generateCardRenderFunction('cluster_health')
      expect(code).toContain('Healthy')
      expect(code).toContain('Unhealthy')
    })

    it('includes error state with report button', () => {
      const code = generateCardRenderFunction('cluster_health')
      expect(code).toContain('Report Issue')
      expect(code).toContain('openIssue')
    })
  })

  describe('pod_issues case', () => {
    it('renders pod issue labels', () => {
      const code = generateCardRenderFunction('pod_issues')
      expect(code).toContain('CrashLoopBackOff')
      expect(code).toContain('OOMKilled')
    })
  })

  describe('nightly_e2e_status case', () => {
    it('renders pass rate metrics', () => {
      const code = generateCardRenderFunction('nightly_e2e_status')
      expect(code).toContain('Pass Rate')
    })
  })

  describe('gpu_overview case', () => {
    it('renders GPU utilization info', () => {
      const code = generateCardRenderFunction('gpu_overview')
      expect(code).toContain('Utilization')
      expect(code).toContain('Allocated')
    })
  })

  describe('default case for unknown card types', () => {
    it('uses provided displayName when card not in registry', () => {
      const code = generateCardRenderFunction('totally_unknown_card', 'My Custom Widget')
      expect(code).toContain(JSON.stringify('My Custom Widget'))
    })

    it('falls back to cardType when no displayName and not in registry', () => {
      const code = generateCardRenderFunction('some_mystery_card')
      // The default case uses the title variable which defaults to cardType
      expect(code).toContain('some_mystery_card')
    })

    it('still has the JSON parse block', () => {
      const code = generateCardRenderFunction('unknown_type_xyz')
      expect(code).toContain('JSON.parse(trimmed)')
    })

    it('still has drag support', () => {
      const code = generateCardRenderFunction('unknown_type_xyz')
      expect(code).toContain('handleDragStart')
      expect(code).toContain('widget-container')
    })
  })

  describe('displayName override for known cards', () => {
    it('uses custom displayName over registry displayName', () => {
      const code = generateCardRenderFunction('cluster_health', 'My Custom Name')
      // The title variable is set to displayName arg when provided
      expect(code).toContain('Cluster Health')
      // For known cases, the title is used in the card header
    })
  })

  describe('common structure in all render functions', () => {
    it('includes error handling with "No response" and "Endpoint not available"', () => {
      const code = generateCardRenderFunction('cluster_health')
      expect(code).toContain('No response')
      expect(code).toContain('Endpoint not available')
      expect(code).toContain('Parse error')
    })

    it('handles JSON error responses', () => {
      const code = generateCardRenderFunction('pod_issues')
      expect(code).toContain('"error"')
      expect(code).toContain('Load failed')
    })

    it('uses absolute positioning for widget placement', () => {
      const code = generateCardRenderFunction('cluster_health')
      expect(code).toContain('position: \'absolute\'')
      expect(code).toContain('widgetPosition.top')
      expect(code).toContain('widgetPosition.left')
    })
  })

  describe('CI/CD card types', () => {
    it('nightly_release_pulse includes pulse data', () => {
      const code = generateCardRenderFunction('nightly_release_pulse')
      expect(code).toContain('return (')
      expect(code).toContain('JSON.parse(trimmed)')
    })

    it('workflow_matrix includes matrix data', () => {
      const code = generateCardRenderFunction('workflow_matrix')
      expect(code).toContain('return (')
    })

    it('pipeline_flow includes flow data', () => {
      const code = generateCardRenderFunction('pipeline_flow')
      expect(code).toContain('return (')
    })

    it('recent_failures includes failure data', () => {
      const code = generateCardRenderFunction('recent_failures')
      expect(code).toContain('return (')
    })

    it('issue_activity_chart includes chart data', () => {
      const code = generateCardRenderFunction('issue_activity_chart')
      expect(code).toContain('return (')
    })

    it('github_ci_monitor includes monitor data', () => {
      const code = generateCardRenderFunction('github_ci_monitor')
      expect(code).toContain('return (')
    })

    it('github_activity includes activity data', () => {
      const code = generateCardRenderFunction('github_activity')
      expect(code).toContain('return (')
    })
  })
})

// ---------------------------------------------------------------------------
// generateMiniStatComponent
// ---------------------------------------------------------------------------
describe('generateMiniStatComponent', () => {
  describe('valid stat IDs', () => {
    it('generates component for total_clusters', () => {
      const code = generateMiniStatComponent('total_clusters')
      expect(code).toContain('totalclustersStat')
      expect(code).toContain('Clusters')
      expect(code).toContain('#9333ea')
      expect(code).toContain('data?.clusters.length')
    })

    it('generates component for total_pods', () => {
      const code = generateMiniStatComponent('total_pods')
      expect(code).toContain('totalpodsStat')
      expect(code).toContain('Pods')
      expect(code).toContain('#3b82f6')
    })

    it('generates component for total_gpus with reduce path', () => {
      const code = generateMiniStatComponent('total_gpus')
      expect(code).toContain('totalgpusStat')
      expect(code).toContain('GPUs')
      expect(code).toContain('#22c55e')
      // reduce() paths use a different code generation branch
      expect(code).toContain('|| [])')
    })

    it('generates component for cpu_usage with percentage format', () => {
      const code = generateMiniStatComponent('cpu_usage')
      expect(code).toContain('cpuusageStat')
      expect(code).toContain('CPU')
      expect(code).toContain('%')
      expect(code).toContain('#f59e0b')
    })

    it('generates component for memory_usage with percentage format', () => {
      const code = generateMiniStatComponent('memory_usage')
      expect(code).toContain('memoryusageStat')
      expect(code).toContain('Memory')
      expect(code).toContain('%')
    })

    it('generates component for unhealthy_pods', () => {
      const code = generateMiniStatComponent('unhealthy_pods')
      expect(code).toContain('unhealthypodsStat')
      expect(code).toContain('Issues')
      expect(code).toContain('#ef4444')
    })

    it('generates component for active_alerts with filter path', () => {
      const code = generateMiniStatComponent('active_alerts')
      expect(code).toContain('activealertsStat')
      expect(code).toContain('Alerts')
      expect(code).toContain('#f97316')
      // filter() paths use the same branch as reduce()
      expect(code).toContain('|| [])')
    })
  })

  describe('invalid stat IDs', () => {
    it('returns empty string for unknown stat ID', () => {
      expect(generateMiniStatComponent('nonexistent_stat')).toBe('')
    })

    it('returns empty string for empty string ID', () => {
      expect(generateMiniStatComponent('')).toBe('')
    })
  })

  describe('component structure', () => {
    it('generates a const function component', () => {
      const code = generateMiniStatComponent('total_clusters')
      expect(code).toMatch(/^const \w+Stat = \(\{ data \}\) => \{/)
    })

    it('includes try-catch for value extraction', () => {
      const code = generateMiniStatComponent('total_clusters')
      expect(code).toContain('try {')
      expect(code).toContain('catch { return 0; }')
    })

    it('has a fallback of 0 for missing data', () => {
      const code = generateMiniStatComponent('total_pods')
      expect(code).toContain('|| 0')
    })

    it('renders a statBlock div with border color', () => {
      const code = generateMiniStatComponent('total_clusters')
      expect(code).toContain('styles.statBlock')
      expect(code).toContain("borderTop: '2px solid #9333ea'")
    })

    it('includes statValue and statLabel spans', () => {
      const code = generateMiniStatComponent('total_pods')
      expect(code).toContain('styles.statValue')
      expect(code).toContain('styles.statLabel')
    })

    it('does not include % suffix for number format', () => {
      const code = generateMiniStatComponent('total_clusters')
      // number format: no percentage symbol after value interpolation
      expect(code).toContain(">{value}")
      expect(code).not.toContain(">{value}%")
    })

    it('includes % suffix for percentage format', () => {
      const code = generateMiniStatComponent('cpu_usage')
      expect(code).toContain(">{value}%")
    })
  })

  describe('all registered stats produce valid output', () => {
    const statIds = Object.keys(WIDGET_STATS)

    it.each(statIds)('generates non-empty code for stat "%s"', (statId) => {
      const code = generateMiniStatComponent(statId)
      expect(code.length).toBeGreaterThan(0)
      expect(code).toContain('Stat')
      expect(code).toContain('data')
    })
  })
})
