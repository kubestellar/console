/**
 * AI/ML Card Config Tests
 *
 * Tests AI/ML-related card configurations.
 */
import { describe, it, expect } from 'vitest'
import { llmInferenceConfig } from '../llm-inference'
import { llmModelsConfig } from '../llm-models'
import { llmdStackMonitorConfig } from '../llmd-stack-monitor'
import { mlJobsConfig } from '../ml-jobs'
import { mlNotebooksConfig } from '../ml-notebooks'
import { kserveStatusConfig } from '../kserve-status'
import { consoleAiHealthCheckConfig } from '../console-ai-health-check'
import { consoleAiIssuesConfig } from '../console-ai-issues'
import { consoleAiKubeconfigAuditConfig } from '../console-ai-kubeconfig-audit'
import { consoleAiOfflineDetectionConfig } from '../console-ai-offline-detection'

const aiMlCards = [
  { name: 'llmInference', config: llmInferenceConfig },
  { name: 'llmModels', config: llmModelsConfig },
  { name: 'llmdStackMonitor', config: llmdStackMonitorConfig },
  { name: 'mlJobs', config: mlJobsConfig },
  { name: 'mlNotebooks', config: mlNotebooksConfig },
  { name: 'kserveStatus', config: kserveStatusConfig },
  { name: 'consoleAiHealthCheck', config: consoleAiHealthCheckConfig },
  { name: 'consoleAiIssues', config: consoleAiIssuesConfig },
  { name: 'consoleAiKubeconfigAudit', config: consoleAiKubeconfigAuditConfig },
  { name: 'consoleAiOfflineDetection', config: consoleAiOfflineDetectionConfig },
]

describe('AI/ML card configs', () => {
  describe('Basic structure validation', () => {
    it.each(aiMlCards)('$name has valid structure', ({ config }) => {
      expect(config.type).toBeTruthy()
      expect(config.title).toBeTruthy()
      expect(config.category).toBeTruthy()
      expect(config.content).toBeDefined()
      expect(config.dataSource).toBeDefined()
    })

    it.each(aiMlCards)('$name has icon and iconColor', ({ config }) => {
      expect(config.icon).toBeTruthy()
      expect(config.iconColor).toBeTruthy()
      expect(config.iconColor).toMatch(/^text-/)
    })

    it.each(aiMlCards)('$name has valid dimensions', ({ config }) => {
      expect(config.defaultWidth).toBeGreaterThan(0)
      expect(config.defaultHeight).toBeGreaterThan(0)
      expect(config.defaultWidth).toBeLessThanOrEqual(12)
      expect(config.defaultHeight).toBeLessThanOrEqual(8)
    })

    it.each(aiMlCards)('$name has emptyState configuration', ({ config }) => {
      if (config.emptyState) {
        expect(config.emptyState.title).toBeTruthy()
        expect(config.emptyState.message).toBeTruthy()
        expect(config.emptyState.variant).toMatch(/^(info|success|warning|error)$/)
      }
    })

    it.each(aiMlCards)('$name type contains AI/ML keyword', ({ config }) => {
      const lowerType = config.type.toLowerCase()
      const hasKeyword =
        lowerType.includes('llm') ||
        lowerType.includes('ml') ||
        lowerType.includes('kserve') ||
        lowerType.includes('inference') ||
        lowerType.includes('model') ||
        lowerType.includes('console_ai')
      expect(hasKeyword).toBe(true)
    })
  })

  describe('Category classification', () => {
    it.each(aiMlCards)('$name belongs to ai-ml category', ({ config }) => {
      expect(config.category).toBe('ai-ml')
    })
  })

  describe('Data source configuration', () => {
    it.each(aiMlCards)('$name has hook-based data source', ({ config }) => {
      expect(config.dataSource.type).toBe('hook')
      expect(config.dataSource.hook).toBeTruthy()
      expect(typeof config.dataSource.hook).toBe('string')
    })

    it.each(aiMlCards)('$name hook follows naming convention', ({ config }) => {
      const hookName = config.dataSource.hook as string
      expect(hookName).toMatch(/^use[A-Z]/)
    })
  })

  describe('Content type validation', () => {
    it.each(aiMlCards)('$name has valid content type', ({ config }) => {
      expect(config.content.type).toMatch(/^(list|stats-grid|custom|chart|table)$/)
    })

    it('llmInference has list content with columns', () => {
      expect(llmInferenceConfig.content.type).toBe('list')
      if (llmInferenceConfig.content.type === 'list') {
        expect(llmInferenceConfig.content.columns).toBeDefined()
        expect(llmInferenceConfig.content.columns!.length).toBeGreaterThan(0)
        expect(llmInferenceConfig.content.pageSize).toBeGreaterThan(0)
      }
    })

    it('mlJobs has list content with progress column', () => {
      expect(mlJobsConfig.content.type).toBe('list')
      if (mlJobsConfig.content.type === 'list') {
        const columns = mlJobsConfig.content.columns
        expect(columns).toBeDefined()
        const progressCol = columns?.find(c => c.render === 'progress-bar')
        expect(progressCol).toBeDefined()
      }
    })
  })

  describe('Loading state validation', () => {
    it.each(aiMlCards)('$name has loading state', ({ config }) => {
      expect(config.loadingState).toBeDefined()
      expect(config.loadingState.type).toMatch(/^(list|stats|custom|chart)$/)
    })
  })

  describe('Model endpoint cards', () => {
    const endpointCards = [llmInferenceConfig, llmModelsConfig, llmdStackMonitorConfig]

    it.each(endpointCards.map((c, i) => ({ name: ['llmInference', 'llmModels', 'llmdStackMonitor'][i], config: c })))(
      '$name validates endpoint configuration structure',
      ({ config }) => {
        expect(config.description).toBeTruthy()
        expect(config.description).toContain('LLM') || expect(config.description).toContain('model')
      }
    )
  })

  describe('AI health and issue detection', () => {
    it('consoleAiHealthCheck has appropriate empty state', () => {
      expect(consoleAiHealthCheckConfig.emptyState?.icon).toBe('Stethoscope')
      expect(consoleAiHealthCheckConfig.emptyState?.variant).toBe('info')
    })

    it('consoleAiIssues has list content for issues', () => {
      expect(consoleAiIssuesConfig.content.type).toBe('list')
      if (consoleAiIssuesConfig.content.type === 'list') {
        const columns = consoleAiIssuesConfig.content.columns
        expect(columns?.some(c => c.field === 'severity')).toBe(true)
        expect(columns?.some(c => c.field === 'confidence')).toBe(true)
      }
    })
  })

  describe('Demo and live data flags', () => {
    it.each(aiMlCards)('$name has isDemoData and isLive flags', ({ config }) => {
      expect(typeof config.isDemoData).toBe('boolean')
      expect(typeof config.isLive).toBe('boolean')
    })
  })

  describe('Project filtering', () => {
    it.each(aiMlCards)('$name projects array is valid when present', ({ config }) => {
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
})
