import { useEffect } from 'react'
import { useLocalStorage } from './useLocalStorage'

export type AIMode = 'low' | 'medium' | 'high'

interface AIModeConfig {
  mode: AIMode
  // Low: Direct kubectl for everything, AI only for explicit requests
  // Medium: AI for analysis/summaries, kubectl for data fetching
  // High: Full AI assistance including proactive suggestions
  features: {
    proactiveSuggestions: boolean    // AI suggests card swaps based on activity
    summarizeData: boolean           // AI summarizes cluster data
    naturalLanguage: boolean         // AI-powered NL card configuration
    contextualHelp: boolean          // AI provides contextual help
    autoAnalyze: boolean             // AI automatically analyzes issues
  }
}

const AI_MODE_CONFIGS: Record<AIMode, AIModeConfig> = {
  low: {
    mode: 'low',
    features: {
      proactiveSuggestions: false,
      summarizeData: false,
      naturalLanguage: false,
      contextualHelp: true,  // Basic help is cheap
      autoAnalyze: false } },
  medium: {
    mode: 'medium',
    features: {
      proactiveSuggestions: false,  // User-triggered only
      summarizeData: true,
      naturalLanguage: true,
      contextualHelp: true,
      autoAnalyze: false } },
  high: {
    mode: 'high',
    features: {
      proactiveSuggestions: true,
      summarizeData: true,
      naturalLanguage: true,
      contextualHelp: true,
      autoAnalyze: true } } }

const DESCRIPTIONS: Record<AIMode, string> = {
  low: 'Minimal token usage. Direct kubectl/API calls for all data. AI only for explicit requests. Best for cost control.',
  medium: 'Balanced approach. AI analyzes and summarizes data, suggests improvements on request. Moderate token usage.',
  high: 'Full AI assistance. Proactive suggestions, automatic issue analysis, card swaps based on cluster activity. Higher token usage.' }

const STORAGE_KEY = 'kubestellar-ai-mode'
const DEFAULT_AI_MODE: AIMode = 'medium'
const VALID_AI_MODES: ReadonlySet<string> = new Set<AIMode>(['low', 'medium', 'high'])

function deserializeAIMode(value: string): AIMode {
  return VALID_AI_MODES.has(value) ? (value as AIMode) : DEFAULT_AI_MODE
}

export function useAIMode() {
  const [mode, setMode] = useLocalStorage<AIMode>(STORAGE_KEY, DEFAULT_AI_MODE, {
    serialize: (value: AIMode) => value,
    deserialize: deserializeAIMode,
  })

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
  }, [mode])

  const config = AI_MODE_CONFIGS[mode]
  const description = DESCRIPTIONS[mode]

  // Helper to check if a feature is enabled
  const isFeatureEnabled = (feature: keyof AIModeConfig['features']) => {
      return config.features[feature]
    }

  // Estimate token cost multiplier
  const tokenMultiplier = mode === 'low' ? 0.1 : mode === 'medium' ? 0.5 : 1.0

  return {
    mode,
    setMode,
    config,
    description,
    isFeatureEnabled,
    tokenMultiplier,
    // Convenience booleans
    shouldProactivelySuggest: config.features.proactiveSuggestions,
    shouldSummarize: config.features.summarizeData,
    shouldAutoAnalyze: config.features.autoAnalyze }
}
