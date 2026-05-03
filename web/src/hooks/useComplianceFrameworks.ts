/**
 * Hook for fetching compliance framework data from the backend API.
 * Used by the ComplianceFrameworks page.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'

export interface ComplianceCheck {
  id: string
  name: string
  type: string
  status: 'pass' | 'fail' | 'partial' | 'error' | 'skipped'
  message: string
  remediation: string
  severity: 'critical' | 'high' | 'medium' | 'low'
}

export interface ControlResult {
  id: string
  name: string
  status: 'pass' | 'fail' | 'partial'
  checks: ComplianceCheck[]
}

export interface EvaluationResult {
  framework_id: string
  framework_name: string
  cluster: string
  score: number
  passed: number
  failed: number
  partial: number
  skipped: number
  total_checks: number
  controls: ControlResult[]
  evaluated_at: string
}

export interface Framework {
  id: string
  name: string
  version: string
  description: string
  category: string
  controls: number
  checks: number
}

const CACHE_KEY = 'compliance-frameworks-cache'
const CACHE_TTL_MS = 120_000

interface CacheEntry {
  frameworks: Framework[]
  timestamp: number
}

function loadCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry: CacheEntry = JSON.parse(raw)
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null
    return entry
  } catch {
    return null
  }
}

function saveCache(frameworks: Framework[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ frameworks, timestamp: Date.now() }))
  } catch { /* quota exceeded — ignore */ }
}

export function useComplianceFrameworks() {
  const cached = useRef(loadCache())
  const [frameworks, setFrameworks] = useState<Framework[]>(cached.current?.frameworks ?? [])
  const [isLoading, setIsLoading] = useState(!cached.current)
  const [error, setError] = useState<string | null>(null)

  const fetchFrameworks = useCallback(async () => {
    try {
      const { data } = await api.get<Framework[]>('/api/compliance/frameworks/')
      setFrameworks(data)
      saveCache(data)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load frameworks')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFrameworks()
  }, [fetchFrameworks])

  return { frameworks, isLoading, error, refetch: fetchFrameworks }
}

export function useFrameworkEvaluation() {
  const [result, setResult] = useState<EvaluationResult | null>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const evaluate = useCallback(async (frameworkId: string, cluster: string) => {
    setIsEvaluating(true)
    setError(null)
    try {
      const { data } = await api.post<EvaluationResult>(
        `/api/compliance/frameworks/${encodeURIComponent(frameworkId)}/evaluate`,
        { cluster },
      )
      setResult(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Evaluation failed')
      setResult(null)
    } finally {
      setIsEvaluating(false)
    }
  }, [])

  return { result, isEvaluating, error, evaluate }
}
