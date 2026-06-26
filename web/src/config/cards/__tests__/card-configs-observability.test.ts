/**
 * Observability Card Config Tests
 *
 * Tests observability, monitoring, alerting, and security scanning card configurations.
 */
import { describe, it, expect } from 'vitest'
import { cortexStatusConfig } from '../cortex-status'
import { otelStatusConfig } from '../otel-status'
import { drasiReactiveGraphConfig } from '../drasi-reactive-graph'
import { eventStreamConfig } from '../event-stream'
import { eventsTimelineConfig } from '../events-timeline'
import { eventSummaryConfig } from '../event-summary'
import { namespaceEventsConfig } from '../namespace-events'
import { alertRulesConfig } from '../alert-rules'
import { falcoAlertsConfig } from '../falco-alerts'
import { chaosMeshStatusConfig } from '../chaos-mesh-status'
import { activeAlertsConfig } from '../active-alerts'
import { podHealthTrendConfig } from '../pod-health-trend'
import { podLogsConfig } from '../pod-logs'
import { recentEventsConfig } from '../recent-events'
import { recentFailuresConfig } from '../recent-failures'
import { kubescapeScanConfig } from '../kubescape-scan'
import { trivyScanConfig } from '../trivy-scan'
import { trestleScanConfig } from '../trestle-scan'
import { policyViolationsConfig } from '../policy-violations'
import { securityIssuesConfig } from '../security-issues'
import { crossClusterEventCorrelationConfig } from '../cross-cluster-event-correlation'

const observabilityCards = [
  { name: 'cortexStatus', config: cortexStatusConfig, subCategory: 'telemetry' },
  { name: 'otelStatus', config: otelStatusConfig, subCategory: 'telemetry' },
  { name: 'drasiReactiveGraph', config: drasiReactiveGraphConfig, subCategory: 'telemetry' },
  { name: 'eventStream', config: eventStreamConfig, subCategory: 'events' },
  { name: 'eventsTimeline', config: eventsTimelineConfig, subCategory: 'events' },
  { name: 'eventSummary', config: eventSummaryConfig, subCategory: 'events' },
  { name: 'namespaceEvents', config: namespaceEventsConfig, subCategory: 'events' },
  { name: 'alertRules', config: alertRulesConfig, subCategory: 'alerting' },
  { name: 'falcoAlerts', config: falcoAlertsConfig, subCategory: 'security' },
  { name: 'chaosMeshStatus', config: chaosMeshStatusConfig, subCategory: 'chaos' },
  { name: 'activeAlerts', config: activeAlertsConfig, subCategory: 'alerting' },
  { name: 'podHealthTrend', config: podHealthTrendConfig, subCategory: 'monitoring' },
  { name: 'podLogs', config: podLogsConfig, subCategory: 'monitoring' },
  { name: 'recentEvents', config: recentEventsConfig, subCategory: 'events' },
  { name: 'recentFailures', config: recentFailuresConfig, subCategory: 'events' },
  { name: 'kubescapeScan', config: kubescapeScanConfig, subCategory: 'security-scan' },
  { name: 'trivyScan', config: trivyScanConfig, subCategory: 'security-scan' },
  { name: 'trestleScan', config: trestleScanConfig, subCategory: 'security-scan' },
  { name: 'policyViolations', config: policyViolationsConfig, subCategory: 'security' },
  { name: 'securityIssues', config: securityIssuesConfig, subCategory: 'security' },
  { name: 'crossClusterEventCorrelation', config: crossClusterEventCorrelationConfig, subCategory: 'events' },
]

describe('Observability card configs', () => {
  describe('Basic structure validation', () => {
    it.each(observabilityCards)('$name has valid structure', ({ config }) => {
      expect(config.type).toBeTruthy()
      expect(config.title).toBeTruthy()
      expect(config.category).toBeTruthy()
      expect(config.content).toBeDefined()
      expect(config.dataSource).toBeDefined()
    })

    it.each(observabilityCards)('$name has icon and iconColor', ({ config }) => {
      expect(config.icon).toBeTruthy()
      expect(config.iconColor).toBeTruthy()
      expect(config.iconColor).toMatch(/^text-/)
    })

    it.each(observabilityCards)('$name has valid dimensions', ({ config }) => {
      expect(config.defaultWidth).toBeGreaterThan(0)
      expect(config.defaultHeight).toBeGreaterThan(0)
      expect(config.defaultWidth).toBeLessThanOrEqual(12)
      expect(config.defaultHeight).toBeLessThanOrEqual(8)
    })

    it.each(observabilityCards)('$name has emptyState configuration', ({ config }) => {
      expect(config.emptyState).toBeDefined()
      expect(config.emptyState!.title).toBeTruthy()
      expect(config.emptyState!.message).toBeTruthy()
      expect(config.emptyState!.variant).toMatch(/^(info|success|warning|error)$/)
    })

    it.each(observabilityCards)('$name has description', ({ config }) => {
      expect(config.description).toBeTruthy()
      expect(config.description!.length).toBeGreaterThan(0)
    })

    it.each(observabilityCards)('$name type is not undefined or null', ({ config }) => {
      expect(config.type).not.toBeUndefined()
      expect(config.type).not.toBeNull()
    })
  })

  describe('Data source configuration', () => {
    it.each(observabilityCards)('$name has valid data source type', ({ config }) => {
      expect(config.dataSource.type).toMatch(/^(hook|api|static)$/)
    })

    it.each(observabilityCards)('$name hook-based sources follow naming convention', ({ config }) => {
      if (config.dataSource.type === 'hook') {
        const hookName = config.dataSource.hook as string
        expect(hookName).toMatch(/^use[A-Z]/)
      }
    })
  })

  describe('Content type validation', () => {
    it.each(observabilityCards)('$name has valid content type', ({ config }) => {
      expect(config.content.type).toMatch(/^(list|stats-grid|custom|chart|table|text)$/)
    })
  })

  describe('Loading state validation', () => {
    it.each(observabilityCards)('$name has loading state', ({ config }) => {
      expect(config.loadingState).toBeDefined()
      expect(config.loadingState.type).toMatch(/^(list|stats|custom|chart|text)$/)
    })
  })

  describe('Event-related cards', () => {
    const eventCards = observabilityCards.filter(c => c.subCategory === 'events')

    it.each(eventCards)('$name has event-related keywords in type', ({ config }) => {
      const lowerType = config.type.toLowerCase()
      expect(
        lowerType.includes('event') ||
        lowerType.includes('failure') ||
        lowerType.includes('correlation')
      ).toBe(true)
    })

    it('eventStream has list content with columns', () => {
      expect(eventStreamConfig.content.type).toBe('list')
      if (eventStreamConfig.content.type === 'list') {
        const columns = eventStreamConfig.content.columns
        expect(columns).toBeDefined()
        expect(columns!.length).toBeGreaterThan(0)
        expect(columns?.some(c => c.field.includes('involvedObject'))).toBe(true)
      }
    })

    it('eventStream has filters for search and type', () => {
      expect(eventStreamConfig.filters).toBeDefined()
      const filters = eventStreamConfig.filters
      expect(filters?.some(f => f.type === 'text')).toBe(true)
      expect(filters?.some(f => f.type === 'chips')).toBe(true)
    })

    it('eventStream has drill-down configuration', () => {
      expect(eventStreamConfig.drillDown).toBeDefined()
      expect(eventStreamConfig.drillDown?.action).toBe('drillToEvent')
      expect(eventStreamConfig.drillDown?.params).toBeDefined()
      expect(eventStreamConfig.drillDown?.params!.length).toBeGreaterThan(0)
    })
  })

  describe('Alert-related cards', () => {
    const alertCards = observabilityCards.filter(c => c.subCategory === 'alerting')

    it.each(alertCards)('$name has alert-related keywords in type', ({ config }) => {
      const lowerType = config.type.toLowerCase()
      expect(lowerType.includes('alert')).toBe(true)
    })

    it('activeAlerts empty state indicates no alerts', () => {
      expect(activeAlertsConfig.emptyState?.variant).toBe('success')
    })
  })

  describe('Security scanning cards', () => {
    const scanCards = observabilityCards.filter(c => c.subCategory === 'security-scan')

    it.each(scanCards)('$name has scan-related keywords in type', ({ config }) => {
      const lowerType = config.type.toLowerCase()
      expect(
        lowerType.includes('scan') ||
        lowerType.includes('kubescape') ||
        lowerType.includes('trivy') ||
        lowerType.includes('trestle')
      ).toBe(true)
    })

    it.each(scanCards)('$name belongs to security category', ({ config }) => {
      expect(config.category).toBe('security')
    })

    it.each(scanCards)('$name empty state shows no vulnerabilities message', ({ config }) => {
      const msg = config.emptyState?.message?.toLowerCase() || ''
      expect(
        msg.includes('no') || msg.includes('scan') || msg.includes('vuln')
      ).toBe(true)
    })
  })

  describe('Security alert cards', () => {
    const securityCards = [falcoAlertsConfig, policyViolationsConfig, securityIssuesConfig]

    it.each(securityCards.map((c, i) => ({ name: ['falcoAlerts', 'policyViolations', 'securityIssues'][i], config: c })))(
      '$name belongs to security category',
      ({ config }) => {
        expect(config.category).toBe('security')
      }
    )

    it('falcoAlerts has stats-grid content', () => {
      expect(falcoAlertsConfig.content.type).toBe('stats-grid')
      if (falcoAlertsConfig.content.type === 'stats-grid') {
        const stats = falcoAlertsConfig.content.stats
        expect(stats).toBeDefined()
        expect(stats!.length).toBeGreaterThan(0)
        expect(stats?.some(s => s.color === 'red')).toBe(true)
      }
    })
  })

  describe('OpenTelemetry configuration', () => {
    it('otelStatus has appropriate description for CNCF project', () => {
      expect(otelStatusConfig.description).toContain('OpenTelemetry')
      expect(otelStatusConfig.description).toContain('Collector')
    })

    it('otelStatus has list content with collector information', () => {
      expect(otelStatusConfig.content.type).toBe('list')
      if (otelStatusConfig.content.type === 'list') {
        const columns = otelStatusConfig.content.columns
        expect(columns?.some(c => c.field === 'name')).toBe(true)
        expect(columns?.some(c => c.field === 'state')).toBe(true)
        expect(columns?.some(c => c.field === 'exportErrors')).toBe(true)
      }
    })

    it('otelStatus empty state is informational', () => {
      expect(otelStatusConfig.emptyState?.variant).toBe('info')
      expect(otelStatusConfig.emptyState?.message).toContain('OpenTelemetry')
    })
  })

  describe('Chaos engineering cards', () => {
    it('chaosMeshStatus validates chaos mesh integration', () => {
      expect(chaosMeshStatusConfig.type).toContain('chaos')
      expect(chaosMeshStatusConfig.description).toBeTruthy()
    })
  })

  describe('Pod monitoring cards', () => {
    it('podHealthTrend shows trend data', () => {
      expect(podHealthTrendConfig.type).toContain('pod')
      expect(podHealthTrendConfig.type).toContain('health')
    })

    it('podLogs provides log access', () => {
      expect(podLogsConfig.type).toContain('log')
    })
  })

  describe('Demo and live data flags', () => {
    it.each(observabilityCards)('$name has isDemoData and isLive flags', ({ config }) => {
      expect(typeof config.isDemoData).toBe('boolean')
      expect(typeof config.isLive).toBe('boolean')
    })
  })

  describe('Project filtering', () => {
    it.each(observabilityCards)('$name projects array is valid when present', ({ config }) => {
      if (config.projects) {
        expect(Array.isArray(config.projects)).toBe(true)
        expect(config.projects.length).toBeGreaterThan(0)
        config.projects.forEach(project => {
          expect(typeof project).toBe('string')
          expect(project.length).toBeGreaterThan(0)
        })
      }
    })
  })

  describe('Icon color conventions', () => {
    it('security cards use appropriate warning colors', () => {
      const securityCards = observabilityCards.filter(c =>
        c.subCategory === 'security' || c.subCategory === 'security-scan'
      )
      securityCards.forEach(({ config }) => {
        expect(config.iconColor).toMatch(/text-(red|yellow|orange|amber)-\d{3}/)
      })
    })
  })

  describe('Cross-cluster capabilities', () => {
    it('crossClusterEventCorrelation validates multi-cluster event handling', () => {
      expect(crossClusterEventCorrelationConfig.type).toContain('cross_cluster')
      expect(crossClusterEventCorrelationConfig.description).toContain('cross') || expect(crossClusterEventCorrelationConfig.description).toContain('cluster')
    })
  })
})
