/**
 * Share Mission Dialog
 *
 * Export a saved resolution as JSON file, clipboard, or markdown.
 * Runs security scanning before export to detect sensitive data.
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download,
  Copy,
  FileText,
  CheckCircle,
  AlertTriangle,
  Shield,
  Loader2 } from 'lucide-react'
import yaml from 'js-yaml'
import type { Resolution } from '../../hooks/useResolutions'
import type { MissionExport, FileScanResult } from '../../lib/missions/types'
import { fullScan } from '../../lib/missions/scanner/index'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals/BaseModal'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'
import { downloadText } from '../../lib/download'
import { useToast } from '../ui/Toast'

interface ShareMissionDialogProps {
  resolution: Resolution
  isOpen: boolean
  onClose: () => void
}

type ExportChannel = 'json' | 'clipboard' | 'markdown' | 'yaml'

function resolutionToMissionExport(resolution: Resolution): MissionExport {
  return {
    version: '1.0',
    title: resolution.title,
    description: resolution.resolution.summary || resolution.title,
    type: 'troubleshoot',
    tags: [
      resolution.issueSignature.type,
      ...(resolution.issueSignature.resourceKind ? [resolution.issueSignature.resourceKind] : []),
    ].filter(Boolean),
    category: 'troubleshooting',
    steps: resolution.resolution.steps.map((step, i) => ({
      title: `Step ${i + 1}`,
      description: step })),
    resolution: {
      summary: resolution.resolution.summary || '',
      steps: resolution.resolution.steps,
      yaml: resolution.resolution.yaml },
    metadata: {
      author: resolution.sharedBy || resolution.userId,
      source: 'kubestellar-console',
      createdAt: resolution.createdAt,
      updatedAt: resolution.updatedAt } }
}

/** YAML indent width used by js-yaml dump */
const YAML_INDENT = 2

function missionToYaml(mission: MissionExport): string {
  return yaml.dump(mission, {
    indent: YAML_INDENT,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false })
}

function missionToMarkdown(mission: MissionExport): string {
  const lines = [
    `# ${mission.title}`,
    '',
    `**Type:** ${mission.type}`,
    `**Tags:** ${(mission.tags || []).join(', ')}`,
    '',
    '## Problem',
    mission.description,
    '',
  ]

  if (mission.resolution?.summary) {
    lines.push('## Fix', mission.resolution.summary, '')
  }

  if (mission.steps.length > 0) {
    lines.push('## Steps')
    mission.steps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step.description}`)
    })
    lines.push('')
  }

  if (mission.resolution?.yaml) {
    lines.push('## YAML', '```yaml', mission.resolution.yaml, '```', '')
  }

  return lines.join('\n')
}

export function ShareMissionDialog({ resolution, isOpen, onClose }: ShareMissionDialogProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [scanResult, setScanResult] = useState<FileScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [exported, setExported] = useState<ExportChannel | null>(null)
  const exportedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (exportedTimeoutRef.current !== null) clearTimeout(exportedTimeoutRef.current)
    }
  }, [])

  const mission = resolutionToMissionExport(resolution)

  const runScan = () => {
    setScanning(true)
    try {
      const result = fullScan(mission)
      setScanResult(result)
    } catch {
      setScanResult(null)
    } finally {
      setScanning(false)
    }
  }

  const handleExport = async (channel: ExportChannel) => {
    if (!scanResult && !scanning) {
      runScan()
    }

    const json = JSON.stringify(mission, null, 2)
    const unknownError = t('dialogs.shareMission.unknownError')
    const slug = mission.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)

    switch (channel) {
      case 'json': {
        const result = downloadText(`${slug}.json`, json, 'application/json')
        if (!result.ok) {
          showToast(t('dialogs.shareMission.exportJsonFailed', {
            message: result.error?.message || unknownError,
          }), 'error')
          return
        }
        break
      }
      case 'clipboard':
        await copyToClipboard(json)
        break
      case 'markdown':
        await copyToClipboard(missionToMarkdown(mission))
        break
      case 'yaml': {
        const yamlContent = missionToYaml(mission)
        const result = downloadText(`${slug}.yaml`, yamlContent, 'application/x-yaml')
        if (!result.ok) {
          showToast(t('dialogs.shareMission.exportYamlFailed', {
            message: result.error?.message || unknownError,
          }), 'error')
          return
        }
        break
      }
    }

    setExported(channel)
    if (exportedTimeoutRef.current !== null) clearTimeout(exportedTimeoutRef.current)
    exportedTimeoutRef.current = setTimeout(() => setExported(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  const warningCount = scanResult?.findings.filter(f => f.severity !== 'info').length ?? 0
  const hasWarnings = warningCount > 0

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="sm">
      <BaseModal.Header title={t('dialogs.shareMission.title')} icon={Shield} onClose={onClose} />

      <BaseModal.Content noPadding>
        <div className="p-4 border-b border-border">
          <p className="text-xs font-medium text-foreground truncate">{resolution.title}</p>
          <p className="text-2xs text-muted-foreground mt-1">
            {t('dialogs.shareMission.preview', {
              type: resolution.issueSignature.type,
              count: resolution.resolution.steps.length,
            })}
          </p>
        </div>

        <div className="px-4 py-3 border-b border-border">
          {scanning ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('dialogs.shareMission.scanning')}
            </div>
          ) : scanResult ? (
            <div className={cn('flex items-center gap-2 text-xs', hasWarnings ? 'text-yellow-400' : 'text-green-400')}>
              {hasWarnings ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
              {hasWarnings
                ? t('dialogs.shareMission.findingsWarning', { count: warningCount })
                : t('dialogs.shareMission.noSensitiveData')}
            </div>
          ) : (
            <button
              onClick={runScan}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Shield className="w-3 h-3" />
              {t('dialogs.shareMission.runSecurityScan')}
            </button>
          )}
        </div>

        <div className="p-4 space-y-2">
          <ExportButton
            icon={<Download className="w-4 h-4" />}
            label={t('dialogs.shareMission.exports.downloadJson.label')}
            description={t('dialogs.shareMission.exports.downloadJson.description')}
            doneLabel={t('dialogs.shareMission.done')}
            active={exported === 'json'}
            onClick={() => handleExport('json')}
          />
          <ExportButton
            icon={<Copy className="w-4 h-4" />}
            label={t('dialogs.shareMission.exports.copyJson.label')}
            description={t('dialogs.shareMission.exports.copyJson.description')}
            doneLabel={t('dialogs.shareMission.done')}
            active={exported === 'clipboard'}
            onClick={() => handleExport('clipboard')}
          />
          <ExportButton
            icon={<FileText className="w-4 h-4" />}
            label={t('dialogs.shareMission.exports.copyMarkdown.label')}
            description={t('dialogs.shareMission.exports.copyMarkdown.description')}
            doneLabel={t('dialogs.shareMission.done')}
            active={exported === 'markdown'}
            onClick={() => handleExport('markdown')}
          />
          <ExportButton
            icon={<Download className="w-4 h-4" />}
            label={t('dialogs.shareMission.exports.downloadYaml.label')}
            description={t('dialogs.shareMission.exports.downloadYaml.description')}
            doneLabel={t('dialogs.shareMission.done')}
            active={exported === 'yaml'}
            onClick={() => handleExport('yaml')}
          />
        </div>
      </BaseModal.Content>
    </BaseModal>
  )
}

function ExportButton({ icon, label, description, doneLabel, active, onClick }: {
  icon: React.ReactNode
  label: string
  description: string
  doneLabel: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
        active
          ? 'border-green-500/50 bg-green-500/10 text-green-400'
          : 'border-border hover:border-primary/30 hover:bg-accent/50 text-foreground'
      )}
    >
      <div className="shrink-0">{active ? <CheckCircle className="w-4 h-4 text-green-400" /> : icon}</div>
      <div>
        <p className="text-xs font-medium">{active ? doneLabel : label}</p>
        <p className="text-2xs text-muted-foreground">{description}</p>
      </div>
    </button>
  )
}
