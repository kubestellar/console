import { useState, useEffect, useCallback } from 'react'

export interface CardTemplate {
  id: string
  name: string
  description?: string
  cardType: string
  config: Record<string, unknown>
  behaviors?: Record<string, boolean>
  createdAt: string
  isBuiltIn?: boolean
}

// Built-in templates that come with the app
const BUILT_IN_TEMPLATES: CardTemplate[] = [
  {
    id: 'built-in-1',
    name: 'Production Cluster Health',
    description: 'Monitor health of production clusters with alerts enabled',
    cardType: 'cluster_health',
    config: {},
    behaviors: { autoRefresh: true, showUnhealthyFirst: true, alertOnChange: true },
    createdAt: new Date().toISOString(),
    isBuiltIn: true,
  },
  {
    id: 'built-in-2',
    name: 'Warning Events Only',
    description: 'Stream of warning and error events only',
    cardType: 'event_stream',
    config: {},
    behaviors: { autoRefresh: true, warningsOnly: true },
    createdAt: new Date().toISOString(),
    isBuiltIn: true,
  },
  {
    id: 'built-in-3',
    name: 'Critical Pod Issues',
    description: 'Pods with crashes, OOM kills, and high restarts',
    cardType: 'pod_issues',
    config: {},
    behaviors: { autoRefresh: true, showRestartCount: true, alertOnNew: true },
    createdAt: new Date().toISOString(),
    isBuiltIn: true,
  },
  {
    id: 'built-in-4',
    name: 'Resource Usage with Alerts',
    description: 'CPU and memory usage with high usage alerts',
    cardType: 'resource_usage',
    config: {},
    behaviors: { autoRefresh: true, showPercentage: true, alertOnHigh: true },
    createdAt: new Date().toISOString(),
    isBuiltIn: true,
  },
  {
    id: 'built-in-5',
    name: 'Security Audit',
    description: 'Security issues including privileged containers and root access',
    cardType: 'security_issues',
    config: {},
    behaviors: { autoRefresh: true, alertOnCritical: true },
    createdAt: new Date().toISOString(),
    isBuiltIn: true,
  },
]

const STORAGE_KEY = 'kubestellar-card-templates'

export function useCardTemplates() {
  const [templates, setTemplates] = useState<CardTemplate[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const userTemplates = JSON.parse(stored)
        return [...BUILT_IN_TEMPLATES, ...userTemplates]
      } catch {
        return BUILT_IN_TEMPLATES
      }
    }
    return BUILT_IN_TEMPLATES
  })

  // Persist user templates to localStorage
  useEffect(() => {
    const userTemplates = templates.filter((t) => !t.isBuiltIn)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userTemplates))
  }, [templates])

  const saveTemplate = useCallback((template: Omit<CardTemplate, 'id' | 'createdAt' | 'isBuiltIn'>) => {
    const newTemplate: CardTemplate = {
      ...template,
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString(),
      isBuiltIn: false,
    }
    setTemplates((prev) => [...prev, newTemplate])
    return newTemplate
  }, [])

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id || t.isBuiltIn))
  }, [])

  const updateTemplate = useCallback((id: string, updates: Partial<CardTemplate>) => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === id && !t.isBuiltIn ? { ...t, ...updates } : t
      )
    )
  }, [])

  const getTemplatesByType = useCallback((cardType: string) => {
    return templates.filter((t) => t.cardType === cardType)
  }, [templates])

  const getUserTemplates = useCallback(() => {
    return templates.filter((t) => !t.isBuiltIn)
  }, [templates])

  const getBuiltInTemplates = useCallback(() => {
    return templates.filter((t) => t.isBuiltIn)
  }, [templates])

  return {
    templates,
    saveTemplate,
    deleteTemplate,
    updateTemplate,
    getTemplatesByType,
    getUserTemplates,
    getBuiltInTemplates,
  }
}
