/**
 * Validation and Form Handlers
 *
 * Handles validation logic and form state management for SaveResolutionDialog.
 */

import type { ResolutionSteps, IssueSignature } from '../../hooks/useResolutions'
import type { AISummary } from './AIUtils.parts'

export function validateForm(
  title: string,
  issueType: string,
  summary: string,
  t: (key: string) => string
): string | null {
  if (!title.trim()) {
    return t('dashboard.missions.titleRequired')
  }
  if (!issueType.trim()) {
    return t('dashboard.missions.issueTypeRequired')
  }
  if (!summary.trim()) {
    return t('dashboard.missions.summaryRequired')
  }
  return null
}

export interface FormHandlers {
  onAddStep: () => void
  onRemoveStep: (index: number) => void
  onStepChange: (index: number, value: string) => void
}

export function createFormHandlers(
  steps: string[],
  setSteps: (steps: string[]) => void
): FormHandlers {
  return {
    onAddStep: () => {
      setSteps([...steps, ''])
    },
    onRemoveStep: (index: number) => {
      setSteps(steps.filter((_, i) => i !== index))
    },
    onStepChange: (index: number, value: string) => {
      setSteps(steps.map((s, i) => i === index ? value : s))
    },
  }
}

export function extractResolutionData(
  summary: string,
  steps: string[],
  yaml: string
): ResolutionSteps {
  return {
    summary: summary.trim(),
    steps: steps.filter(s => s.trim()),
    yaml: yaml.trim() || undefined,
  }
}

export function extractIssueSignature(
  issueType: string,
  resourceKind: string,
  autoDetectedSignature: { type?: string; resourceKind?: string; errorPattern?: string; namespace?: string }
): IssueSignature {
  return {
    type: issueType.trim(),
    resourceKind: resourceKind.trim() || undefined,
    errorPattern: autoDetectedSignature.errorPattern,
    namespace: autoDetectedSignature.namespace,
  }
}

export function populateFormFromAISummary(
  aiSummary: AISummary,
  setters: {
    setTitle: (val: string) => void
    setIssueType: (val: string) => void
    setResourceKind: (val: string) => void
    setSummary: (val: string) => void
    setSteps: (val: string[]) => void
    setYaml: (val: string) => void
  }
): void {
  setters.setTitle(aiSummary.title)
  setters.setIssueType(aiSummary.issueType)
  setters.setResourceKind(aiSummary.resourceKind || '')
  setters.setSummary(`**Problem:** ${aiSummary.problem}\n\n**Solution:** ${aiSummary.solution}`)
  setters.setSteps(aiSummary.steps.length > 0 ? aiSummary.steps : [''])
  setters.setYaml(aiSummary.yaml || '')
}

export function resetFormState(setters: {
  setTitle: (val: string) => void
  setIssueType: (val: string) => void
  setResourceKind: (val: string) => void
  setSummary: (val: string) => void
  setSteps: (val: string[]) => void
  setYaml: (val: string) => void
  setError: (val: string | null) => void
  setAiError: (val: string | null) => void
}): void {
  setters.setError(null)
  setters.setAiError(null)
  setters.setTitle('')
  setters.setIssueType('')
  setters.setResourceKind('')
  setters.setSummary('')
  setters.setSteps([''])
  setters.setYaml('')
}
