import { AlertCircle, Code, FileText, Loader2, RefreshCw, Save, Share2, Sparkles, Tag } from 'lucide-react'
import type { TFunction } from 'i18next'
import { cn } from '../../lib/cn'
import { ConflictList } from './ConflictList'

interface ResolutionFormProps {
  isGenerating: boolean
  aiError: string | null
  summary: string
  title: string
  issueType: string
  resourceKind: string
  steps: string[]
  yaml: string
  visibility: 'private' | 'shared'
  error: string | null
  isBusy: boolean
  onRetryGenerate: () => void
  onTitleChange: (value: string) => void
  onIssueTypeChange: (value: string) => void
  onResourceKindChange: (value: string) => void
  onSummaryChange: (value: string) => void
  onStepChange: (index: number, value: string) => void
  onAddStep: () => void
  onRemoveStep: (index: number) => void
  onYamlChange: (value: string) => void
  onVisibilityChange: (visibility: 'private' | 'shared') => void
  t: TFunction
}

export function ResolutionForm({
  isGenerating,
  aiError,
  summary,
  title,
  issueType,
  resourceKind,
  steps,
  yaml,
  visibility,
  error,
  isBusy,
  onRetryGenerate,
  onTitleChange,
  onIssueTypeChange,
  onResourceKindChange,
  onSummaryChange,
  onStepChange,
  onAddStep,
  onRemoveStep,
  onYamlChange,
  onVisibilityChange,
  t,
}: ResolutionFormProps) {
  return (
    <>
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
            onClick={onRetryGenerate}
            disabled={isBusy}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3 h-3', isBusy && 'animate-spin')} />
            {t('common.retry')}
          </button>
        </div>
      )}

      <div className="p-4 space-y-4">
        {!isGenerating && !aiError && summary && (
          <div className="flex items-center gap-2 text-xs text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('dashboard.missions.aiGeneratedReview')}</span>
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
            <FileText className="w-4 h-4 text-muted-foreground" />
            {t('dashboard.missions.title')}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={t('dashboard.missions.titlePlaceholder')}
            disabled={isBusy}
            className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
              <Tag className="w-4 h-4 text-muted-foreground" />
              {t('dashboard.missions.issueType')}
            </label>
            <input
              type="text"
              value={issueType}
              onChange={(e) => onIssueTypeChange(e.target.value)}
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
              onChange={(e) => onResourceKindChange(e.target.value)}
              placeholder={t('dashboard.missions.resourceKindPlaceholder')}
              disabled={isBusy}
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">
            {t('dashboard.missions.problemAndSolution')}
          </label>
          <textarea
            value={summary}
            onChange={(e) => onSummaryChange(e.target.value)}
            placeholder={isGenerating ? t('dashboard.missions.generating') : t('dashboard.missions.problemSolutionPlaceholder')}
            rows={4}
            disabled={isBusy}
            className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary resize-none disabled:opacity-50"
          />
        </div>

        <ConflictList
          steps={steps}
          isBusy={isBusy}
          isGenerating={isGenerating}
          onStepChange={onStepChange}
          onAddStep={onAddStep}
          onRemoveStep={onRemoveStep}
          t={t}
        />

        <div>
          <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
            <Code className="w-4 h-4 text-muted-foreground" />
            {t('dashboard.missions.yamlConfig')}
          </label>
          <textarea
            value={yaml}
            onChange={(e) => onYamlChange(e.target.value)}
            placeholder={isGenerating ? t('dashboard.missions.generating') : t('dashboard.missions.yamlPlaceholder')}
            rows={4}
            disabled={isBusy}
            className="w-full px-3 py-2 text-xs font-mono bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary resize-none disabled:opacity-50"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            {t('dashboard.missions.visibility')}
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => onVisibilityChange('private')}
              disabled={isBusy}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors',
                visibility === 'private'
                  ? 'bg-primary/20 border-primary/50 text-primary'
                  : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground',
                isBusy && 'opacity-50'
              )}
            >
              <Save className="w-4 h-4" />
              <span className="text-sm">{t('dashboard.missions.private')}</span>
            </button>
            <button
              onClick={() => onVisibilityChange('shared')}
              disabled={isBusy}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors',
                visibility === 'shared'
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                  : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground',
                isBusy && 'opacity-50'
              )}
            >
              <Share2 className="w-4 h-4" />
              <span className="text-sm">{t('dashboard.missions.shareToOrg')}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </>
  )
}
