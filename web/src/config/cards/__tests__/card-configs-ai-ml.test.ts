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

const aiMlCards = [
  { name: 'llmInference', config: llmInferenceConfig },
  { name: 'llmModels', config: llmModelsConfig },
  { name: 'llmdStackMonitor', config: llmdStackMonitorConfig },
  { name: 'mlJobs', config: mlJobsConfig },
  { name: 'mlNotebooks', config: mlNotebooksConfig },
  { name: 'kserveStatus', config: kserveStatusConfig },
]

describe('AI/ML card configs', () => {
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
  })

  it.each(aiMlCards)('$name has valid dimensions', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThan(0)
    expect(config.defaultHeight).toBeGreaterThan(0)
  })

  it.each(aiMlCards)('$name has emptyState configuration', ({ config }) => {
    if (config.emptyState) {
      expect(config.emptyState.title).toBeTruthy()
      expect(config.emptyState.message).toBeTruthy()
    }
  })

  it.each(aiMlCards)('$name type contains AI/ML keyword', ({ config }) => {
    const lowerType = config.type.toLowerCase()
    const hasKeyword =
      lowerType.includes('llm') ||
      lowerType.includes('ml') ||
      lowerType.includes('kserve') ||
      lowerType.includes('inference') ||
      lowerType.includes('model')
    expect(hasKeyword).toBe(true)
  })
})
