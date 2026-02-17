/**
 * Save Resolution Dialog
 *
 * Dialog for saving a successful mission resolution for future reference.
 * Uses AI to generate a clean problem/solution summary for reuse.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  X,
  Save,
  Share2,
  AlertCircle,
  CheckCircle,
  Tag,
  FileText,
  ListOrdered,
  Code,
  Loader2,
  Sparkles,
  RefreshCw,
} from 'lucide-react'
import type { Mission } from '../../hooks/useMissions'
import { useResolutions, detectIssueSignature, type IssueSignature, type ResolutionSteps } from '../../hooks/useResolutions'
import { cn } from '../../lib/cn'
import { LOCAL_AGENT_WS_URL } from '../../lib/constants'
import { useTranslation } from 'react-i18next'

interface AISummary {
  title: string
  issueType: string
  resourceKind?: string
  problem: string
  solution: string
  steps: string[]
  yaml?: string
}

interface SaveResolutionDialogProps {
  mission: Mission
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
}

/**
 * Request AI to generate a resolution summary from the mission conversation
 */
async function generateAISummary(mission: Mission): Promise<AISummary> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(LOCAL_AGENT_WS_URL)
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('Timeout waiting for AI summary'))
    }, 30000)

    let responseContent = ''

    ws.onopen = () => {
      // Build conversation context
      const conversation = mission.messages
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n')

      const prompt = `You are helping save a resolution for future reuse. Analyze this mission conversation and create a structured summary.

MISSION: ${mission.title}
DESCRIPTION: ${mission.description}

CONVERSATION:
${conversation}

Create a JSON summary with these fields:
- title: Short descriptive title for this resolution (max 60 chars)
- issueType: Category like "CrashLoopBackOff", "OOMKilled", "ImagePullBackOff", "DeploymentFailed", etc.
- resourceKind: Kubernetes resource type if applicable (Pod, Deployment, Service, etc.)
- problem: 1-2 sentence description of what went wrong
- solution: 1-2 sentence description of how it was fixed
- steps: Array of specific actionable steps that fixed the issue (commands, config changes, etc.)
- yaml: Any YAML manifests or config snippets that were part of the fix (optional)

Return ONLY valid JSON, no markdown code blocks or explanation.`

      ws.send(JSON.stringify({
        type: 'chat',
        id: `summary-${Date.now()}`,
        payload: {
          prompt: prompt,
          sessionId: `resolution-${mission.id}`,
          agent: mission.agent || 'claude',
        }
      }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)

        if (message.type === 'stream') {
          responseContent += message.payload?.content || ''
        } else if (message.type === 'result') {
          clearTimeout(timeout)
          ws.close()

          const content = message.payload?.content || message.payload?.output || responseContent

          // Try to parse JSON from response
          try {
            // Extract JSON if wrapped in code blocks
            const jsonMatch = content.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0])
              resolve({
                title: parsed.title || mission.title,
                issueType: parsed.issueType || 'Unknown',
                resourceKind: parsed.resourceKind,
                problem: parsed.problem || '',
                solution: parsed.solution || '',
                steps: Array.isArray(parsed.steps) ? parsed.steps : [],
                yaml: parsed.yaml,
              })
            } else {
              reject(new Error('Could not parse AI response as JSON'))
            }
          } catch (parseError) {
            reject(new Error('Failed to parse AI summary response'))
          }
        } else if (message.type === 'error') {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(message.payload?.message || 'AI request failed'))
        }
      } catch {
        // Ignore parse errors for non-JSON messages
      }
    }

    ws.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('WebSocket connection failed'))
    }

    ws.onclose = () => {
      clearTimeout(timeout)
    }
  })
}

export function SaveResolutionDialog({
  mission,
  isOpen,
  onClose,
  onSaved,
}: SaveResolutionDialogProps) {
  const { t } = useTranslation(['common', 'cards'])
  const { saveResolution } = useResolutions()

  // Auto-detect issue signature from mission content
  const autoDetectedSignature = useMemo(() => {
    const content = [
      mission.title,
      mission.description,
      ...mission.messages.map(m => m.content),
    ].join('\n')

    return detectIssueSignature(content)
  }, [mission])

  // Form state
  const [title, setTitle] = useState('')
  const [issueType, setIssueType] = useState('')
  const [resourceKind, setResourceKind] = useState('')
  const [summary, setSummary] = useState('')
  const [steps, setSteps] = useState<string[]>([''])
  const [yaml, setYaml] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'shared'>('private')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // AI summary state
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // Generate AI summary
  const generateSummary = useCallback(async () => {
    setIsGenerating(true)
    setAiError(null)

    try {
      const aiSummary = await generateAISummary(mission)

      setTitle(aiSummary.title)
      setIssueType(aiSummary.issueType)
      setResourceKind(aiSummary.resourceKind || '')
      setSummary(`**Problem:** ${aiSummary.problem}\n\n**Solution:** ${aiSummary.solution}`)
      setSteps(aiSummary.steps.length > 0 ? aiSummary.steps : [''])
      setYaml(aiSummary.yaml || '')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to generate summary')
      // Fall back to basic extraction
      setTitle(mission.title)
      setIssueType(autoDetectedSignature.type || '')
      setResourceKind(autoDetectedSignature.resourceKind || '')
    } finally {
      setIsGenerating(false)
    }
  }, [mission, autoDetectedSignature])

  // Initialize form when dialog opens - auto-generate AI summary
  useEffect(() => {
    if (isOpen) {
      setError(null)
      setAiError(null)

      // Start with basic values while AI generates
      setTitle(mission.title)
      setIssueType(autoDetectedSignature.type || '')
      setResourceKind(autoDetectedSignature.resourceKind || '')
      setSummary('')
      setSteps([''])
      setYaml('')

      // Generate AI summary
      generateSummary()
    }
  }, [isOpen, mission, autoDetectedSignature, generateSummary])

  const handleAddStep = () => {
    setSteps(prev => [...prev, ''])
  }

  const handleRemoveStep = (index: number) => {
    setSteps(prev => prev.filter((_, i) => i !== index))
  }

  const handleStepChange = (index: number, value: string) => {
    setSteps(prev => prev.map((s, i) => i === index ? value : s))
  }

  const handleSave = async () => {
    // Validate
    if (!title.trim()) {
      setError(t('dashboard.missions.titleRequired'))
      return
    }
    if (!issueType.trim()) {
      setError(t('dashboard.missions.issueTypeRequired'))
      return
    }
    if (!summary.trim()) {
      setError(t('dashboard.missions.summaryRequired'))
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const issueSignature: IssueSignature = {
        type: issueType.trim(),
        resourceKind: resourceKind.trim() || undefined,
        errorPattern: autoDetectedSignature.errorPattern,
        namespace: autoDetectedSignature.namespace,
      }

      const resolution: ResolutionSteps = {
        summary: summary.trim(),
        steps: steps.filter(s => s.trim()),
        yaml: yaml.trim() || undefined,
      }

      saveResolution({
        missionId: mission.id,
        title: title.trim(),
        issueSignature,
        resolution,
        context: {
          cluster: mission.cluster,
        },
        visibility,
      })

      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dashboard.missions.failedToSave'))
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Save className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">{t('dashboard.missions.saveResolution')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* AI Generation Status */}
        {isGenerating && (
          <div className="flex items-center gap-3 p-4 bg-primary/10 border-b border-primary/20">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <div>
              <p className="text-sm font-medium text-foreground">{t('dashboard.missions.generatingAISummary')}</p>
              <p className="text-xs text-muted-foreground">{t('dashboard.missions.creatingReusablePair')}</p>
            </div>
          </div>
        )}

        {aiError && (
          <div className="flex items-center justify-between gap-3 p-3 bg-yellow-500/10 border-b border-yellow-500/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-500" />
              <span className="text-xs text-yellow-500">{aiError}</span>
            </div>
            <button
              onClick={generateSummary}
              disabled={isGenerating}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 rounded transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              {t('common.retry')}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* AI Badge */}
          {!isGenerating && !aiError && summary && (
            <div className="flex items-center gap-2 text-xs text-primary">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('dashboard.missions.aiGeneratedReview')}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
              <FileText className="w-4 h-4 text-muted-foreground" />
              {t('dashboard.missions.title')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('dashboard.missions.titlePlaceholder')}
              disabled={isGenerating}
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          {/* Issue Signature */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
                <Tag className="w-4 h-4 text-muted-foreground" />
                {t('dashboard.missions.issueType')}
              </label>
              <input
                type="text"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                placeholder={t('dashboard.missions.issueTypePlaceholder')}
                disabled={isGenerating}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {t('dashboard.missions.resourceKind')}
              </label>
              <input
                type="text"
                value={resourceKind}
                onChange={(e) => setResourceKind(e.target.value)}
                placeholder={t('dashboard.missions.resourceKindPlaceholder')}
                disabled={isGenerating}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>
          </div>

          {/* Summary (Problem & Solution) */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t('dashboard.missions.problemAndSolution')}
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={isGenerating ? t('dashboard.missions.generating') : t('dashboard.missions.problemSolutionPlaceholder')}
              rows={4}
              disabled={isGenerating}
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none disabled:opacity-50"
            />
          </div>

          {/* Steps */}
          <div>
            <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
              <ListOrdered className="w-4 h-4 text-muted-foreground" />
              {t('dashboard.missions.remediationSteps')}
            </label>
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5">{index + 1}.</span>
                  <input
                    type="text"
                    value={step}
                    onChange={(e) => handleStepChange(index, e.target.value)}
                    placeholder={isGenerating ? t('dashboard.missions.generating') : t('dashboard.missions.stepPlaceholder')}
                    disabled={isGenerating}
                    className="flex-1 px-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                  {steps.length > 1 && (
                    <button
                      onClick={() => handleRemoveStep(index)}
                      disabled={isGenerating}
                      className="p-1 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50"
                    >
                      <X className="w-4 h-4 text-muted-foreground hover:text-red-400" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={handleAddStep}
                disabled={isGenerating}
                className="text-xs text-primary hover:text-primary/80 ml-7 disabled:opacity-50"
              >
                {t('dashboard.missions.addStep')}
              </button>
            </div>
          </div>

          {/* YAML */}
          <div>
            <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
              <Code className="w-4 h-4 text-muted-foreground" />
              {t('dashboard.missions.yamlConfig')}
            </label>
            <textarea
              value={yaml}
              onChange={(e) => setYaml(e.target.value)}
              placeholder={isGenerating ? t('dashboard.missions.generating') : t('dashboard.missions.yamlPlaceholder')}
              rows={4}
              disabled={isGenerating}
              className="w-full px-3 py-2 text-xs font-mono bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none disabled:opacity-50"
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              {t('dashboard.missions.visibility')}
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setVisibility('private')}
                disabled={isGenerating}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                  visibility === 'private'
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground",
                  isGenerating && "opacity-50"
                )}
              >
                <Save className="w-4 h-4" />
                <span className="text-sm">{t('dashboard.missions.private')}</span>
              </button>
              <button
                onClick={() => setVisibility('shared')}
                disabled={isGenerating}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                  visibility === 'shared'
                    ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                    : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground",
                  isGenerating && "opacity-50"
                )}
              >
                <Share2 className="w-4 h-4" />
                <span className="text-sm">{t('dashboard.missions.shareToOrg')}</span>
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-border">
          <button
            onClick={generateSummary}
            disabled={isGenerating || isSaving}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {t('dashboard.missions.regenerate')}
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('actions.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isGenerating}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? (
                <>{t('common.saving')}</>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  {t('dashboard.missions.saveResolution')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
