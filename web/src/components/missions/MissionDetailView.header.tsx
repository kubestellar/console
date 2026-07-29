/**
 * MissionDetailView header — back link, title/description, and the
 * share / raw-toggle / improve / import action buttons.
 *
 * Extracted from `MissionDetailView.tsx` (issue #21786). Pure move — markup
 * and behaviour are unchanged.
 */

import { useState, useRef, useEffect } from 'react'
import {
  ArrowLeft,
  Download,
  Loader2,
  Eye,
  Code,
  Star,
  Check,
  MessageSquarePlus,
  Link } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { StatusBadge } from '../ui/StatusBadge'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'
import type { MissionDetailViewProps } from './MissionDetailView.types'

type MissionDetailHeaderProps = Pick<
  MissionDetailViewProps,
  'mission' | 'showRaw' | 'onToggleRaw' | 'onImport' | 'onBack' | 'onImprove' | 'matchScore' | 'importLabel' | 'hideBackButton' | 'shareUrl'
>

export function MissionDetailHeader({
  mission,
  showRaw,
  onToggleRaw,
  onImport,
  onBack,
  onImprove,
  matchScore,
  importLabel = 'Import',
  hideBackButton = false,
  shareUrl }: MissionDetailHeaderProps) {
  const { t } = useTranslation()
  const [linkCopied, setLinkCopied] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const linkCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (linkCopiedTimeoutRef.current !== null) clearTimeout(linkCopiedTimeoutRef.current)
    }
  }, [])

  const handleImport = async () => {
    setIsImporting(true)
    try {
      await Promise.resolve(onImport())
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <>
    {/* Back button — hidden when opened from saved missions (no listing context) */}
    {!hideBackButton && (
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('missions.detail.links.backToListing')}
      </button>
    )}

    {/* Header */}
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-semibold text-foreground">{mission.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{mission.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {matchScore != null && matchScore > 0 && (
          <StatusBadge color="purple" size="md" variant="outline" rounded="full">
            <Star className="w-3 h-3" />
            {matchScore}% match
          </StatusBadge>
        )}
        {shareUrl && (
          <button
            onClick={() => {
              copyToClipboard(shareUrl)
              setLinkCopied(true)
              if (linkCopiedTimeoutRef.current !== null) clearTimeout(linkCopiedTimeoutRef.current)
              linkCopiedTimeoutRef.current = setTimeout(() => setLinkCopied(false), UI_FEEDBACK_TIMEOUT_MS)
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors',
              linkCopied
                ? 'border-green-500/30 text-green-400'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
            title="Copy shareable link"
          >
            {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
            {linkCopied ? t('missions.detail.actions.copied') : t('missions.detail.actions.share')}
          </button>
        )}
        <button
          onClick={onToggleRaw}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors',
            showRaw
              ? 'bg-secondary border-border text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
        >
          {showRaw ? <Eye className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
          {showRaw ? t('missions.detail.actions.preview') : t('missions.detail.actions.viewRaw')}
        </button>
        {onImprove && (
          <button
            onClick={onImprove}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition-colors"
            title="Suggest improvements to this AI mission"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            {t('missions.detail.actions.improve')}
          </button>
        )}
        <button
          onClick={handleImport}
          disabled={isImporting}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg text-white transition-colors',
            isImporting
              ? 'bg-purple-600 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-500'
          )}
        >
          {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {importLabel}
        </button>
      </div>
    </div>
    </>
  )
}
