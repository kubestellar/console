/**
 * Unstructured File Preview
 *
 * Shown when a YAML or Markdown file doesn't directly parse as a MissionExport.
 * Displays detected CNCF projects (from CR apiVersion fields), a raw content
 * preview, and options to convert via AI or create a holistic mission by
 * combining with matched console-kb install missions.
 */

import { useState, useRef, useEffect } from 'react'
import {
  ArrowLeft,
  FileCode,
  FileText,
  Sparkles,
  Package,
  CheckCircle,
  AlertTriangle,
  Terminal,
  Copy,
  Rocket } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useTranslation } from 'react-i18next'
import type { MissionExport } from '../../lib/missions/types'
import type { UnstructuredPreview } from '../../lib/missions/fileParser'
import type { ApiGroupMapping } from '../../lib/missions/apiGroupMapping'
import { copyToClipboard } from '../../lib/clipboard'

// ============================================================================
// Constants
// ============================================================================

/** Maximum lines shown in the raw preview before truncation */
const MAX_PREVIEW_LINES = 200

// ============================================================================
// Types
// ============================================================================

interface UnstructuredFilePreviewProps {
  content: string
  format: 'yaml' | 'markdown'
  preview: UnstructuredPreview
  detectedProjects: ApiGroupMapping[]
  fileName: string
  onConvert: (mission: MissionExport) => void
  onBack: () => void
  /** When set, this file is from a Kubara chart — enables the "Use in Mission Control" CTA */
  kubaraChartName?: string
  /** Callback to add the Kubara chart to Mission Control and open Phase 1 */
  onUseInMissionControl?: (chartName: string) => void
}

// ============================================================================
// Component
// ============================================================================

export function UnstructuredFilePreview({
  content,
  format,
  preview,
  detectedProjects,
  fileName,
  onConvert,
  onBack,
  kubaraChartName,
  onUseInMissionControl }: UnstructuredFilePreviewProps) {
  const { t } = useTranslation()
  const [showFullContent, setShowFullContent] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear copy feedback timer on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const lines = content.split('\n')
  const isTruncated = lines.length > MAX_PREVIEW_LINES && !showFullContent
  const displayContent = isTruncated
    ? lines.slice(0, MAX_PREVIEW_LINES).join('\n')
    : content

  const FormatIcon = format === 'yaml' ? FileCode : FileText

  const handleCopy = async () => {
    await copyToClipboard(content)
    setCopied(true)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    const COPY_FEEDBACK_MS = 2_000
    copyTimerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
          title="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <FormatIcon className="w-5 h-5 text-blue-400 shrink-0" />
        <div className="min-w-0">
          <h3 className="font-medium text-sm truncate">{fileName}</h3>
          <p className="text-xs text-muted-foreground">
            {format === 'yaml' ? 'YAML' : 'Markdown'} file &middot; {preview.totalLines} lines
          </p>
        </div>
      </div>

      {/* Detected CNCF Projects */}
      {detectedProjects.length > 0 && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-300">
            <Package className="w-4 h-4" />
            Detected CNCF Projects
          </div>
          <div className="flex flex-wrap gap-2">
            {detectedProjects.map((p) => (
              <div
                key={p.project}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs"
              >
                <CheckCircle className="w-3 h-3 text-blue-400" />
                <span className="font-medium text-blue-200">{p.displayName}</span>
                {p.installMission && (
                  <span className="text-blue-400/60">· install mission available</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detected API Groups (including unmatched) */}
      {preview.detectedApiGroups.length > 0 && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Kubernetes Resources Detected
          </div>
          <div className="space-y-1">
            {preview.detectedApiGroups.map((d, i) => (
              <div key={`${d.apiVersion}-${d.kind}-${i}`} className="flex items-center gap-2 text-xs">
                {d.project ? (
                  <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />
                )}
                <span className="font-mono text-muted-foreground">{d.kind}</span>
                <span className="text-muted-foreground/60">({d.apiVersion})</span>
                {d.project && (
                  <span className="text-green-400/70">→ {d.project.displayName}</span>
                )}
                {!d.project && (
                  <span className="text-yellow-400/70">→ unknown project</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detection Summary */}
      {(preview.detectedSections.length > 0 || preview.detectedCommands.length > 0) && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Content Analysis
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {preview.detectedSections.length > 0 && (
              <div className="flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-muted-foreground" />
                <span>{preview.detectedSections.length} section(s)</span>
              </div>
            )}
            {preview.detectedCommands.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Terminal className="w-3 h-3 text-muted-foreground" />
                <span>{preview.detectedCommands.length} command(s)</span>
              </div>
            )}
            {preview.detectedYamlBlocks > 0 && (
              <div className="flex items-center gap-1.5">
                <FileCode className="w-3 h-3 text-muted-foreground" />
                <span>{preview.detectedYamlBlocks} YAML block(s)</span>
              </div>
            )}
          </div>
          {preview.detectedSections.length > 0 && (
            <div className="pt-1 border-t border-border/50">
              <div className="text-xs text-muted-foreground/80 space-y-0.5">
                {preview.detectedSections.slice(0, 8).map((s, i) => (
                  <div key={i} className="truncate">## {s}</div>
                ))}
                {preview.detectedSections.length > 8 && (
                  <div className="text-muted-foreground/50">
                    +{preview.detectedSections.length - 8} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Kubara CTA: Use in Mission Control (#8483) */}
      {kubaraChartName && onUseInMissionControl && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
            <Rocket className="w-4 h-4" />
            {t('layout.missionSidebar.kubaraBadge')} — {kubaraChartName}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('layout.missionSidebar.useInMissionControlDescription')}
          </p>
          <button
            onClick={() => onUseInMissionControl(kubaraChartName)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20'
            )}
          >
            <Rocket className="w-3.5 h-3.5" />
            {t('layout.missionSidebar.useInMissionControl')}
          </button>
        </div>
      )}

      {/* Action: Convert with AI */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            // Build a minimal mission from what we have and let the user refine in the detail view
            const mission: MissionExport = {
              version: 'kc-mission-v1',
              title: preview.detectedTitle ?? fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
              description: `Imported from ${fileName}`,
              type: 'custom',
              tags: detectedProjects.flatMap((p) => p.tags),
              steps: [{
                title: `Apply ${fileName}`,
                description: `Content imported from ${format === 'yaml' ? 'YAML' : 'Markdown'} file`,
                ...(format === 'yaml' ? { yaml: content } : {}),
                ...(format === 'markdown' ? { description: content } : {}) }],
              ...(detectedProjects.length > 0 ? { cncfProject: detectedProjects[0].project } : {}),
              metadata: {
                source: `${format}-import` } }
            onConvert(mission)
          }}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            'bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20'
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Import as Mission
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {copied ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Raw Content Preview */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground">
            {format === 'yaml' ? 'YAML' : 'Markdown'} Content
          </span>
          {isTruncated && (
            <button
              onClick={() => setShowFullContent(true)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Show all {lines.length} lines
            </button>
          )}
        </div>
        <pre className="p-3 text-xs font-mono text-muted-foreground overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap wrap-break-word">
          {displayContent}
          {isTruncated && (
            <span className="text-muted-foreground/40">
              {'\n'}... truncated ({lines.length - MAX_PREVIEW_LINES} more lines)
            </span>
          )}
        </pre>
      </div>
    </div>
  )
}
