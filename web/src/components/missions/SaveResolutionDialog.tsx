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
import { useResolutions, detectIssueSignature } from '../../hooks/useResolutions'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals/BaseModal'
import { LOCAL_AGENT_WS_URL } from '../../lib/constants'
import { getWsAuthParams } from '../../lib/utils/wsAuth'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui/Toast'
import { generateAISummary } from './AIUtils.parts'
import {
  validateForm,
  createFormHandlers,
  extractResolutionData,
  extractIssueSignature,
  populateFormFromAISummary,
  resetFormState,
} from './ValidationAndHandlers.parts'

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

  const autoDetectedSignature = useMemo(() => {
    const content = [
      mission.title,
      mission.description,
      ...(mission.messages || []).map(m => m.content),
    ].join('
')

    return detectIssueSignature(content)
  }, [mission.title, mission.description, mission.messages])

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

  const [title, setTitle] = useState('')
  const [issueType, setIssueType] = useState('')
  const [resourceKind, setResourceKind] = useState('')
  const [summary, setSummary] = useState('')
  const [steps, setSteps] = useState<string[]>([''])
  const [yaml, setYaml] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'shared'>('private')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isGenerating, setIsGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const isBusy = isGenerating || isSaving

  const generateSummary = useCallback(async () => {
    setIsGenerating(true)
    setAiError(null)

    const currentMission = missionRef.current
    try {
      const { url: wsUrl, protocols } = await getWsAuthParams(LOCAL_AGENT_WS_URL)
      const aiSummary = await generateAISummary(currentMission, wsUrl, protocols)

      populateFormFromAISummary(aiSummary, {
        setTitle,
        setIssueType,
        setResourceKind,
        setSummary,
        setSteps,
        setYaml,
      })
    } catch (err: unknown) {
      const translate = translationRef.current
      const errorMessage = err instanceof Error
        ? err.message
        : translate('dashboard.missions.aiSummaryFailed')
      setAiError(translate('dashboard.missions.aiSummaryFallbackDetail', { error: errorMessage }))
      showToastRef.current(translate('dashboard.missions.aiSummaryFallbackNotice'), 'warning')
      setTitle(currentMission.title)
      setIssueType(signatureRef.current.type || '')
      setResourceKind(signatureRef.current.resourceKind || '')
    } finally {
      setIsGenerating(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) {
        return
      }
      resetFormState({
        setTitle,
        setIssueType,
        setResourceKind,
        setSummary,
        setSteps,
        setYaml,
        setError,
        setAiError,
      })

      setTitle(missionRef.current.title)
      setIssueType(signatureRef.current.type || '')
      setResourceKind(signatureRef.current.resourceKind || '')

      void generateSummary()
    })

    return () => {
      cancelled = true
    }
  }, [isOpen, mission.id, generateSummary])

  const { onAddStep: handleAddStep, onRemoveStep: handleRemoveStep, onStepChange: handleStepChange } = useMemo(
    () => createFormHandlers(steps, setSteps),
    [steps]
  )

  const handleSave = async () => {
    const validationError = validateForm(title, issueType, summary, t)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      await Promise.resolve()

      const issueSignature = extractIssueSignature(issueType, resourceKind, autoDetectedSignature)
      const resolution = extractResolutionData(summary, steps, yaml)

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
              disabled={isBusy}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 rounded transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('w-3 h-3', isBusy && 'animate-spin')} />
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
              disabled={isBusy}
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
                disabled={isBusy}
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
                disabled={isBusy}
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
              disabled={isBusy}
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
                    disabled={isBusy}
                    className="flex-1 px-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                  {steps.length > 1 && (
                    <button
                      onClick={() => handleRemoveStep(index)}
                      disabled={isBusy}
                      className="p-1 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50"
                    >
                      <X className="w-4 h-4 text-muted-foreground hover:text-red-400" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={handleAddStep}
                disabled={isBusy}
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
              disabled={isBusy}
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
                disabled={isBusy}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                  visibility === 'private'
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground",
                  isBusy && "opacity-50"
                )}
              >
                <Save className="w-4 h-4" />
                <span className="text-sm">{t('dashboard.missions.private')}</span>
              </button>
              <button
                onClick={() => setVisibility('shared')}
                disabled={isBusy}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                  visibility === 'shared'
                    ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                    : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground",
                  isBusy && "opacity-50"
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
