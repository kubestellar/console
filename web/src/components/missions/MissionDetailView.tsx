/**
 * MissionDetailView
 *
 * Formatted, human-readable mission viewer with tabbed sections:
 * Install | Uninstall | Update/Upgrade | Troubleshooting
 * Replaces raw JSON with structured, copy-pasteable content.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ArrowLeft,
  Download,
  Eye,
  Code,
  Star,
  Tag,
  CheckCircle,
  Copy,
  Check,
  AlertTriangle,
  Trash2,
  ArrowUpCircle,
  Wrench,
  ExternalLink,
  Shield,
  MessageSquarePlus,
  Link,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type { MissionExport, MissionStep } from '../../lib/missions/types'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'

type TabId = 'install' | 'uninstall' | 'upgrade' | 'troubleshooting'

interface TabDef {
  id: TabId
  label: string
  icon: React.ElementType
  steps: MissionStep[]
  emptyMessage: string
  color: string
}

/** Number of shimmer skeleton rows shown while full mission content loads */
const LOADING_SKELETON_COUNT = 3

interface MissionDetailViewProps {
  mission: MissionExport
  rawContent: string | null
  showRaw: boolean
  onToggleRaw: () => void
  onImport: () => void
  onBack: () => void
  onImprove?: () => void
  matchScore?: number
  /** Override the import button label (e.g. "Run" for saved missions) */
  importLabel?: string
  /** Hide the "Back to listing" button (e.g. when opened from saved missions) */
  hideBackButton?: boolean
  /** Shareable URL for this mission (e.g. http://localhost:8080/missions/install-prometheus) */
  shareUrl?: string
  /** Show shimmer skeleton while full mission content is being fetched */
  loading?: boolean
}

// Extract code blocks from markdown-style description
function extractCodeBlocks(text: string): { before: string; code: string; after: string }[] {
  const parts: { before: string; code: string; after: string }[] = []
  const regex = /```[\w]*\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).trim()
    const code = match[1].trim()
    lastIndex = match.index + match[0].length
    parts.push({ before, code, after: '' })
  }

  // Remaining text after last code block
  const remaining = text.slice(lastIndex).trim()
  if (parts.length === 0) {
    return [{ before: text, code: '', after: '' }]
  }
  if (remaining) {
    parts[parts.length - 1].after = remaining
  }

  return parts
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) clearTimeout(copiedTimeoutRef.current)
    }
  }, [])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (copiedTimeoutRef.current !== null) clearTimeout(copiedTimeoutRef.current)
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT_MS)
    })
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function StepCard({ step, index, accentColor }: { step: MissionStep; index: number; accentColor: string }) {
  const blocks = extractCodeBlocks(step.description)

  return (
    <div className="flex gap-3 p-4 rounded-lg bg-secondary/50 border border-border">
      <span
        className={cn(
          'flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold',
          accentColor
        )}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold text-foreground">{step.title}</p>
        {blocks.map((block, bi) => (
          <div key={bi}>
            {block.before && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{block.before}</p>
            )}
            {block.code && (
              <div className="relative mt-2 mb-2">
                <pre className="p-3 rounded-lg bg-background text-xs text-foreground font-mono border border-border overflow-x-auto whitespace-pre-wrap">
                  {block.code}
                </pre>
                <CopyButton text={block.code} />
              </div>
            )}
            {block.after && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{block.after}</p>
            )}
          </div>
        ))}
        {step.command && (
          <div className="relative mt-2">
            <code className="block p-2 rounded bg-background text-xs text-foreground font-mono border border-border">
              {step.command}
            </code>
            <CopyButton text={step.command} />
          </div>
        )}
      </div>
    </div>
  )
}

function SectionBadge({ present, label }: { present: boolean; label: string }) {
  return (
    <span
      className={cn(
        'px-2 py-0.5 text-xs rounded-full border',
        present
          ? 'bg-green-500/10 text-green-400 border-green-500/20'
          : 'bg-muted/30 text-muted-foreground/50 border-border/50'
      )}
    >
      {present ? '✓' : '○'} {label}
    </span>
  )
}

export function MissionDetailView({
  mission,
  rawContent,
  showRaw,
  onToggleRaw,
  onImport,
  onBack,
  onImprove,
  matchScore,
  importLabel = 'Import',
  hideBackButton = false,
  shareUrl,
  loading = false,
}: MissionDetailViewProps) {
  const [linkCopied, setLinkCopied] = useState(false)
  const linkCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (linkCopiedTimeoutRef.current !== null) clearTimeout(linkCopiedTimeoutRef.current)
    }
  }, [])
  const tabs: TabDef[] = [
    {
      id: 'install',
      label: 'Install',
      icon: Download,
      steps: mission.steps || [],
      emptyMessage: 'No install steps available.',
      color: 'bg-green-500/20 text-green-400',
    },
    {
      id: 'uninstall',
      label: 'Uninstall',
      icon: Trash2,
      steps: mission.uninstall || [],
      emptyMessage: 'Uninstall steps not yet available for this mission.',
      color: 'bg-red-500/20 text-red-400',
    },
    {
      id: 'upgrade',
      label: 'Update / Upgrade',
      icon: ArrowUpCircle,
      steps: mission.upgrade || [],
      emptyMessage: 'Upgrade steps not yet available for this mission.',
      color: 'bg-blue-500/20 text-blue-400',
    },
    {
      id: 'troubleshooting',
      label: 'Troubleshooting',
      icon: Wrench,
      steps: mission.troubleshooting || [],
      emptyMessage: 'Troubleshooting steps not yet available for this mission.',
      color: 'bg-yellow-500/20 text-yellow-400',
    },
  ]

  const [activeTab, setActiveTab] = useState<TabId>('install')
  const activeTabDef = tabs.find((t) => t.id === activeTab) || tabs[0]

  const typeColors: Record<string, string> = {
    troubleshoot: 'bg-red-500/10 text-red-400 border-red-500/20',
    deploy: 'bg-green-500/10 text-green-400 border-green-500/20',
    upgrade: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    analyze: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    repair: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    custom: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  }

  const qualityScore = mission.metadata?.qualityScore
  const maturity = mission.metadata?.maturity
  const projectVersion = mission.metadata?.projectVersion
  const sourceUrls = mission.metadata?.sourceUrls

  return (
    <div className="space-y-5">
      {/* Back button — hidden when opened from saved missions (no listing context) */}
      {!hideBackButton && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to listing
        </button>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-foreground">{mission.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{mission.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {matchScore != null && matchScore > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Star className="w-3 h-3" />
              {matchScore}% match
            </span>
          )}
          {shareUrl && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareUrl)
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
              {linkCopied ? 'Copied!' : 'Share'}
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
            {showRaw ? 'Preview' : 'View Raw'}
          </button>
          {onImprove && (
            <button
              onClick={onImprove}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
              title="Suggest improvements to this AI mission"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Improve
            </button>
          )}
          <button
            onClick={onImport}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            {importLabel}
          </button>
        </div>
      </div>

      {/* Raw view */}
      {showRaw && rawContent ? (
        <pre className="p-4 rounded-lg bg-secondary border border-border text-xs text-foreground font-mono overflow-x-auto max-h-[60vh] overflow-y-auto whitespace-pre-wrap">
          {rawContent}
        </pre>
      ) : (
        <>
          {/* Metadata bar */}
          <div className="flex items-center flex-wrap gap-2">
            <span
              className={cn(
                'px-2.5 py-1 text-xs rounded-full border',
                typeColors[mission.type] || typeColors.custom
              )}
            >
              {mission.type}
            </span>
            {mission.category && (
              <span className="px-2.5 py-1 text-xs rounded-full bg-secondary text-muted-foreground border border-border">
                {mission.category}
              </span>
            )}
            {mission.cncfProject && (
              <span className="px-2.5 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {mission.cncfProject}
              </span>
            )}
            {mission.difficulty && (
              <span className="px-2.5 py-1 text-xs rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                {mission.difficulty}
              </span>
            )}
            {maturity && (
              <span
                className={cn(
                  'px-2.5 py-1 text-xs rounded-full border',
                  maturity === 'graduated'
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : maturity === 'incubating'
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                )}
              >
                {maturity}
              </span>
            )}
            {projectVersion && projectVersion !== 'latest' && (
              <span className="px-2.5 py-1 text-xs rounded-full bg-secondary text-muted-foreground border border-border">
                {projectVersion}
              </span>
            )}
            {qualityScore != null && (
              <span
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border',
                  qualityScore >= 80
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : qualityScore >= 60
                      ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                )}
              >
                <Shield className="w-3 h-3" />
                {qualityScore}/100
              </span>
            )}
            {mission.installMethods?.map((method) => (
              <span
                key={method}
                className="px-2 py-0.5 text-xs rounded-full bg-secondary text-muted-foreground"
              >
                {method}
              </span>
            ))}
            {mission.tags
              .filter((t) => !['installation', 'configuration', 'cncf'].includes(t))
              .slice(0, 4)
              .map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-secondary text-muted-foreground"
                >
                  <Tag className="w-3 h-3" />
                  {tag}
                </span>
              ))}
          </div>

          {/* Section completeness badges */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sections:</span>
            <SectionBadge present={(mission.steps || []).length > 0} label="Install" />
            <SectionBadge present={(mission.uninstall || []).length > 0} label="Uninstall" />
            <SectionBadge present={(mission.upgrade || []).length > 0} label="Upgrade" />
            <SectionBadge present={(mission.troubleshooting || []).length > 0} label="Troubleshooting" />
          </div>

          {/* Source links */}
          {sourceUrls && (
            <div className="flex items-center gap-3 text-xs">
              {sourceUrls.repo && (
                <a
                  href={sourceUrls.repo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Repository
                </a>
              )}
              {sourceUrls.docs && sourceUrls.docs !== sourceUrls.repo && (
                <a
                  href={sourceUrls.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Documentation
                </a>
              )}
              {sourceUrls.helm && (
                <a
                  href={sourceUrls.helm}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Helm Chart
                </a>
              )}
              {sourceUrls.issue && (
                <a
                  href={sourceUrls.issue}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Issue
                </a>
              )}
              {sourceUrls.pr && (
                <a
                  href={sourceUrls.pr}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Pull Request
                </a>
              )}
            </div>
          )}

          {/* Prerequisites */}
          {mission.prerequisites && mission.prerequisites.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Prerequisites</h3>
              <ul className="space-y-1">
                {mission.prerequisites.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tab navigation */}
          <div className="border-b border-border">
            <nav className="flex gap-0 -mb-px">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const hasContent = tab.steps.length > 0
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                      activeTab === tab.id
                        ? 'border-purple-500 text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                      !hasContent && 'opacity-50'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {hasContent && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-secondary">
                        {tab.steps.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Tab content */}
          <div className="space-y-3">
            {loading ? (
              /* Shimmer skeleton placeholders while full mission content loads */
              Array.from({ length: LOADING_SKELETON_COUNT }).map((_, i) => (
                <div key={i} className="flex gap-3 p-4 rounded-lg bg-secondary/50 border border-border">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full animate-shimmer" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 rounded animate-shimmer" />
                    <div className="h-3 w-full rounded animate-shimmer" />
                    <div className="h-3 w-2/3 rounded animate-shimmer" />
                    <div className="h-16 w-full rounded animate-shimmer" />
                  </div>
                </div>
              ))
            ) : activeTabDef.steps.length > 0 ? (
              activeTabDef.steps.map((step, i) => (
                <StepCard
                  key={`${activeTab}-${i}`}
                  step={step}
                  index={i}
                  accentColor={activeTabDef.color}
                />
              ))
            ) : (
              <div className="py-8 text-center">
                <AlertTriangle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{activeTabDef.emptyMessage}</p>
                {onImprove && (
                  <button
                    onClick={onImprove}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    Help improve this section
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Resolution */}
          {activeTab === 'install' && mission.resolution && (
            <div className="mt-4 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
              <h3 className="text-sm font-medium text-green-400 mb-2">
                <CheckCircle className="w-4 h-4 inline-block mr-1.5" />
                Expected Result
              </h3>
              {mission.resolution.summary && (
                <p className="text-sm text-muted-foreground">{mission.resolution.summary}</p>
              )}
              {mission.resolution.steps && mission.resolution.steps.length > 0 && (
                <ul className="mt-2 space-y-1 ml-2">
                  {mission.resolution.steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-muted-foreground/50">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              {mission.resolution.yaml && (
                <div className="relative mt-2">
                  <pre className="p-3 rounded-lg bg-secondary border border-border text-xs text-foreground font-mono overflow-x-auto whitespace-pre-wrap">
                    {mission.resolution.yaml}
                  </pre>
                  <CopyButton text={mission.resolution.yaml} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
