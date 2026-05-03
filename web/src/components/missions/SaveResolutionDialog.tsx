/**
 * Save Resolution Dialog
 *
 * Dialog for saving a successful mission resolution for future reference.
 * Uses AI to generate a clean problem/solution summary for reuse.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
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
  X } from 'lucide-react'
import type { Mission } from '../../hooks/useMissions'
import { useResolutions, detectIssueSignature, type IssueSignature, type ResolutionSteps } from '../../hooks/useResolutions'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals/BaseModal'
import { LOCAL_AGENT_WS_URL } from '../../lib/constants'
import { appendWsAuthToken } from '../../lib/utils/wsAuth'
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

/** Timeout for AI summary generation WebSocket request */
const AI_SUMMARY_TIMEOUT_MS = 60_000

/**
 * Maximum number of recent mission messages to include in the AI summary prompt.
 * Older messages add diminishing context for a fix-summary while inflating the
 * payload. Mirrors `MAX_RESENT_MESSAGES` in useMissions.tsx (used for reconnect
 * history) — same rationale: keep the WebSocket frame small enough that the
 * agent's 1 MB read limit is never the failure mode (#9162).
 */
const MAX_SUMMARY_MESSAGES = 20

/**
 * Per-message character cap when building the conversation snippet sent to the
 * AI. Tool outputs (pod logs, YAML manifests, kubectl describe) are routinely
 * tens of kilobytes; concatenating a handful of them blows past the agent's
 * 1 MB WebSocket frame limit, which closes the connection and surfaces the
 * misleading "Could not reach the local agent" error (#9162).
 */
const MAX_MESSAGE_CHARS = 4_000

/**
 * Hard cap on the assembled prompt sent to the agent. The agent rejects
 * prompts longer than `maxPromptChars` (100_000) with a `prompt_too_large`
 * error, and frames larger than `wsMaxMessageBytes` (1 MB) cause the agent
 * to close the connection without a response. We stay well under both so a
 * very long mission never triggers either failure mode (#9162).
 */
const MAX_PROMPT_CHARS = 80_000

/** Marker appended when message content was truncated. */
const TRUNCATION_MARKER = '… [truncated]'

/** Marker appended when the conversation tail was truncated. */
const CONVERSATION_TRUNCATION_MARKER = '\n\n[…earlier conversation omitted…]'

/**
 * Build the conversation snippet sent to the AI for summary generation.
 * Caps both per-message size and the total assembled length so the resulting
 * WebSocket frame stays under the agent's read limit (#9162).
 */
function buildConversationSnippet(messages: Mission['messages']): string {
  // Take only the most recent messages — older context adds little to a
  // resolution summary and risks blowing past the agent's read limit.
  const recent = messages.slice(-MAX_SUMMARY_MESSAGES)
  const omittedCount = messages.length - recent.length

  const lines = recent.map(m => {
    const content = m.content.length > MAX_MESSAGE_CHARS
      ? m.content.slice(0, MAX_MESSAGE_CHARS) + TRUNCATION_MARKER
      : m.content
    return `${m.role.toUpperCase()}: ${content}`
  })

  let snippet = lines.join('\n\n')
  if (omittedCount > 0) {
    snippet = CONVERSATION_TRUNCATION_MARKER.trimStart() + ` (${omittedCount} earlier messages)\n\n` + snippet
  }

  // Final safety net: if the assembled snippet is still too large (e.g. all
  // 20 recent messages were near the per-message cap), trim from the head.
  if (snippet.length > MAX_PROMPT_CHARS) {
    snippet = CONVERSATION_TRUNCATION_MARKER + snippet.slice(snippet.length - MAX_PROMPT_CHARS)
  }
  return snippet
}

/**
 * Detect whether an error message indicates an AI provider rate limit / quota error.
 * Matches HTTP 429 status codes, "rate limit", "quota", and "too many requests" patterns.
 */
function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('quota') ||
    lower.includes('too many requests') ||
    lower.includes('resource_exhausted') ||
    lower.includes('tokens per min') ||
    lower.includes('requests per min')
  )
}

/** User-friendly rate limit error message */
const RATE_LIMIT_MESSAGE =
  'AI provider rate limit exceeded. Please wait a minute and try again, or switch to a different AI provider in Settings.'

/**
 * Request AI to generate a resolution summary from the mission conversation
 */
async function generateAISummary(mission: Mission): Promise<AISummary> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(appendWsAuthToken(LOCAL_AGENT_WS_URL))

    let responseContent = ''
    // #9162 — Track whether the connection ever opened. If the agent closes
    // the socket mid-request (e.g. because our payload exceeded its 1 MB
    // read limit), `onerror` would otherwise fire the misleading "Could not
    // reach the local agent" message even though the agent is running and
    // already accepted our connection.
    let didOpen = false
    // #9162 — Once we have received an explicit `error` or `result` frame,
    // we have already settled the promise; suppress any subsequent
    // onerror/onclose handlers from rejecting again.
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      if (timeout !== undefined) clearTimeout(timeout)
      fn()
    }
    timeout = setTimeout(() => {
      settle(() => {
        ws.close()
        reject(new Error('Timeout waiting for AI summary'))
      })
    }, AI_SUMMARY_TIMEOUT_MS)

    ws.onopen = () => {
      didOpen = true
      try {
        // #9162 — Build conversation context with size caps so the assembled
        // WebSocket frame stays under the agent's 1 MB read limit. Without
        // this, long missions (with large tool outputs) would silently exceed
        // the limit, the agent would close the socket, and the client would
        // surface a misleading "Could not reach the local agent" error.
        const conversation = buildConversationSnippet(mission.messages)

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
          id: `summary-${crypto.randomUUID()}`,
          payload: {
            prompt: prompt,
            sessionId: `resolution-${mission.id}`,
            agent: mission.agent || undefined }
        }))
      } catch (err: unknown) {
        settle(() => {
          ws.close()
          reject(err instanceof Error ? err : new Error('Failed to send AI summary request'))
        })
      }
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)

        if (message.type === 'stream') {
          responseContent += message.payload?.content || ''
        } else if (message.type === 'result') {
          const content = message.payload?.content || message.payload?.output || responseContent
          settle(() => {
            ws.close()

            // Check if the result content itself indicates a rate limit error
            if (isRateLimitError(content)) {
              reject(new Error(RATE_LIMIT_MESSAGE))
              return
            }

            // Try to parse JSON from response
            try {
              // Extract JSON if wrapped in code blocks
              const jsonMatch = content.match(/\{[\s\S]*\}/)
              if (jsonMatch?.[0]) {
                const parsed = JSON.parse(jsonMatch[0])
                resolve({
                  title: parsed.title || mission.title,
                  issueType: parsed.issueType || 'Unknown',
                  resourceKind: parsed.resourceKind,
                  problem: parsed.problem || '',
                  solution: parsed.solution || '',
                  steps: Array.isArray(parsed.steps) ? parsed.steps : [],
                  yaml: parsed.yaml })
              } else {
                reject(new Error('Could not parse AI response as JSON'))
              }
            } catch {
              reject(new Error('Failed to parse AI summary response'))
            }
          })
        } else if (message.type === 'error') {
          const errorMsg = message.payload?.message || 'AI request failed'
          const errorCode = message.payload?.code || ''
          settle(() => {
            ws.close()
            // Surface a clear rate-limit message instead of the generic backend error
            if (isRateLimitError(errorMsg) || isRateLimitError(errorCode)) {
              reject(new Error(RATE_LIMIT_MESSAGE))
            } else {
              reject(new Error(errorMsg))
            }
          })
        }
      } catch {
        // Ignore parse errors for non-JSON messages
      }
    }

    ws.onerror = () => {
      settle(() => {
        // #9162 — Distinguish a real "agent unreachable" failure from an
        // abnormal close after the connection was already established.
        // If `didOpen` is true, the agent accepted the WebSocket and then
        // closed it (commonly because we exceeded its 1 MB read limit, or
        // it crashed mid-request). Telling the user "make sure kc-agent is
        // running" in that case is misleading — chat is still working.
        if (didOpen) {
          reject(new Error('Lost connection to local agent while generating summary. The mission conversation may be too large; try Regenerate or save with a manual summary.'))
        } else {
          reject(new Error('Could not reach the local agent — make sure kc-agent is running'))
        }
      })
    }

    ws.onclose = (event) => {
      // #9162 — A close without a prior `result`/`error`/`onerror` (e.g.
      // server hangup after we exceeded the read limit) would otherwise
      // leave the promise pending until the AI summary timeout. Reject
      // explicitly so the user sees actionable feedback immediately.
      settle(() => {
        if (didOpen) {
          // 1009 = Message Too Big (RFC 6455). Emit a precise hint when the
          // close code matches; otherwise stick to the generic "lost
          // connection" message which already mentions size as a likely cause.
          const isTooBig = event.code === 1009
          reject(new Error(
            isTooBig
              ? 'Mission conversation is too large for the agent to summarize. Try Regenerate after a shorter run or save with a manual summary.'
              : 'Connection to local agent closed before the summary completed. Try Regenerate or save with a manual summary.'
          ))
        } else {
          reject(new Error('Could not reach the local agent — make sure kc-agent is running'))
        }
      })
    }
  })
}

export function SaveResolutionDialog({
  mission,
  isOpen,
  onClose,
  onSaved }: SaveResolutionDialogProps) {
  const { t } = useTranslation(['common', 'cards'])
  const { saveResolution } = useResolutions()

  // Auto-detect issue signature from mission content.
  // Memoized: avoids producing a new object reference on every render, which
  // would otherwise invalidate the init effect's deps and (combined with an
  // unstable generateSummary) trigger an infinite render loop that kept
  // opening fresh AI WebSockets and froze the UI (issue #9163).
  const autoDetectedSignature = useMemo(() => {
    const content = [
      mission.title,
      mission.description,
      ...mission.messages.map(m => m.content),
    ].join('\n')

    return detectIssueSignature(content)
  }, [mission.title, mission.description, mission.messages])

  // Keep latest mission + signature in refs so generateSummary can be a stable
  // callback (no deps) without going stale. Stable callback identity is what
  // lets the init useEffect depend only on isOpen + mission.id.
  const missionRef = useRef(mission)
  const signatureRef = useRef(autoDetectedSignature)
  useEffect(() => {
    missionRef.current = mission
    signatureRef.current = autoDetectedSignature
  }, [mission, autoDetectedSignature])

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

  // Generate AI summary. Stable identity (empty deps) — reads latest mission
  // via missionRef so it doesn't need mission in its closure.
  const generateSummary = useCallback(async () => {
    setIsGenerating(true)
    setAiError(null)

    const currentMission = missionRef.current
    try {
      const aiSummary = await generateAISummary(currentMission)

      setTitle(aiSummary.title)
      setIssueType(aiSummary.issueType)
      setResourceKind(aiSummary.resourceKind || '')
      setSummary(`**Problem:** ${aiSummary.problem}\n\n**Solution:** ${aiSummary.solution}`)
      setSteps(aiSummary.steps.length > 0 ? aiSummary.steps : [''])
      setYaml(aiSummary.yaml || '')
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Failed to generate summary')
      // Fall back to basic extraction
      setTitle(currentMission.title)
      setIssueType(signatureRef.current.type || '')
      setResourceKind(signatureRef.current.resourceKind || '')
    } finally {
      setIsGenerating(false)
    }
  }, [])

  // Initialize form when dialog opens - auto-generate AI summary.
  // Depends only on isOpen + mission.id so streaming message updates on the
  // active mission don't re-fire the effect (which would re-open the AI
  // WebSocket and freeze the UI — issue #9163).
  useEffect(() => {
    if (isOpen) {
      setError(null)
      setAiError(null)

      // Start with basic values while AI generates
      setTitle(missionRef.current.title)
      setIssueType(signatureRef.current.type || '')
      setResourceKind(signatureRef.current.resourceKind || '')
      setSummary('')
      setSteps([''])
      setYaml('')

      // Generate AI summary
      generateSummary()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mission.id, generateSummary])

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
        namespace: autoDetectedSignature.namespace }

      const resolution: ResolutionSteps = {
        summary: summary.trim(),
        steps: steps.filter(s => s.trim()),
        yaml: yaml.trim() || undefined }

      saveResolution({
        missionId: mission.id,
        title: title.trim(),
        issueSignature,
        resolution,
        context: {
          cluster: mission.cluster },
        visibility })

      onSaved?.()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('dashboard.missions.failedToSave'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header title={t('dashboard.missions.saveResolution')} icon={Save} onClose={onClose} />

      <BaseModal.Content noPadding>
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

        <div className="p-4 space-y-4">
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
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-50"
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
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-50"
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
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-50"
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
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary resize-none disabled:opacity-50"
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
                    className="flex-1 px-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-50"
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
              className="w-full px-3 py-2 text-xs font-mono bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary resize-none disabled:opacity-50"
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
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <button
          onClick={generateSummary}
          disabled={isGenerating || isSaving}
          className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          {t('dashboard.missions.regenerate')}
        </button>
        <div className="flex items-center gap-3 ml-auto">
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
      </BaseModal.Footer>
    </BaseModal>
  )
}
