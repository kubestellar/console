/**
 * Save Resolution Dialog
 *
 * Dialog for saving a successful mission resolution for future reference.
 * Uses AI to generate a clean problem/solution summary for reuse.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Save,
  CheckCircle,
  Loader2,
  Sparkles,
} from 'lucide-react'
import type { Mission } from '../../hooks/useMissions'
import { useResolutions, detectIssueSignature, type IssueSignature, type ResolutionSteps } from '../../hooks/useResolutions'
import { BaseModal } from '../../lib/modals/BaseModal'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui/Toast'
import { ResolutionForm } from './ResolutionForm'
import { generateAISummary } from './SaveResolutionDialog.aiSummary'

interface SaveResolutionDialogProps {
  mission: Mission
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
}

export function SaveResolutionDialog({
  mission,
  isOpen,
  onClose,
  onSaved }: SaveResolutionDialogProps) {
  const { t } = useTranslation(['common', 'cards'])
  const { saveResolution } = useResolutions()
  const { showToast } = useToast()

  // Auto-detect issue signature from mission content.
  // Memoized: avoids producing a new object reference on every render, which
  // would otherwise invalidate the init effect's deps and (combined with an
  // unstable generateSummary) trigger an infinite render loop that kept
  // opening fresh AI WebSockets and froze the UI (issue #9163).
  const autoDetectedSignature = useMemo(() => {
    const content = [
      mission.title,
      mission.description,
      ...(mission.messages || []).map(m => m.content),
    ].join('\n')

    return detectIssueSignature(content)
  }, [mission.title, mission.description, mission.messages])

  // Keep latest mission + signature in refs so generateSummary can be a stable
  // callback (no deps) without going stale. Stable callback identity is what
  // lets the init useEffect depend only on isOpen + mission.id.
  const missionRef = useRef(mission)
  const signatureRef = useRef(autoDetectedSignature)
  const translationRef = useRef(t)
  const showToastRef = useRef(showToast)
  useEffect(() => {
    missionRef.current = mission
    signatureRef.current = autoDetectedSignature
  }, [mission, autoDetectedSignature])
  useEffect(() => {
    translationRef.current = t
    showToastRef.current = showToast
  }, [t, showToast])

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
  const isBusy = isGenerating || isSaving

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
      const translate = translationRef.current
      const errorMessage = err instanceof Error
        ? err.message
        : translate('dashboard.missions.aiSummaryFailed')
      setAiError(translate('dashboard.missions.aiSummaryFallbackDetail', { error: errorMessage }))
      showToastRef.current(translate('dashboard.missions.aiSummaryFallbackNotice'), 'warning')
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
    if (!isOpen) {
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) {
        return
      }
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
      void generateSummary()
    })

    return () => {
      cancelled = true
    }
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
      await Promise.resolve()

      const issueSignature: IssueSignature = {
        type: issueType.trim(),
        resourceKind: resourceKind.trim() || undefined,
        errorPattern: autoDetectedSignature.errorPattern,
        namespace: autoDetectedSignature.namespace }

      const resolution: ResolutionSteps = {
        summary: summary.trim(),
        steps: steps.filter(s => s.trim()),
        yaml: yaml.trim() || undefined }

      await Promise.resolve(saveResolution({
        missionId: mission.id,
        title: title.trim(),
        issueSignature,
        resolution,
        context: {
          cluster: mission.cluster },
        visibility }))

      await Promise.resolve(onSaved?.())
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('dashboard.missions.failedToSave'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false} closeOnEscape={!isBusy}>
      <BaseModal.Header title={t('dashboard.missions.saveResolution')} icon={Save} onClose={isBusy ? undefined : onClose} />

      <BaseModal.Content noPadding>
        <ResolutionForm
          isGenerating={isGenerating}
          aiError={aiError}
          summary={summary}
          title={title}
          issueType={issueType}
          resourceKind={resourceKind}
          steps={steps}
          yaml={yaml}
          visibility={visibility}
          error={error}
          isBusy={isBusy}
          onRetryGenerate={generateSummary}
          onTitleChange={setTitle}
          onIssueTypeChange={setIssueType}
          onResourceKindChange={setResourceKind}
          onSummaryChange={setSummary}
          onStepChange={handleStepChange}
          onAddStep={handleAddStep}
          onRemoveStep={handleRemoveStep}
          onYamlChange={setYaml}
          onVisibilityChange={setVisibility}
          t={t}
        />
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <button
          onClick={generateSummary}
          disabled={isBusy}
          className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('dashboard.missions.generating')}
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              {t('dashboard.missions.regenerate')}
            </>
          )}
        </button>
        <div className="flex items-center gap-3 ml-auto">
          <button
            onClick={onClose}
            disabled={isBusy}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {t('actions.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isBusy}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.saving')}
              </>
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
