/**
 * Share Mission Dialog
 *
 * Export a saved resolution as JSON file, clipboard, or markdown.
 * Runs security scanning before export to detect sensitive data.
 */

import { useState, useCallback } from 'react'
import {
  X,
  Download,
  Copy,
  FileText,
  CheckCircle,
  AlertTriangle,
  Shield,
  Loader2,
} from 'lucide-react'
import type { Resolution } from '../../hooks/useResolutions'
import type { MissionExport, FileScanResult } from '../../lib/missions/types'
import { fullScan } from '../../lib/missions/scanner/index'
import { cn } from '../../lib/cn'

interface ShareMissionDialogProps {
  resolution: Resolution
  isOpen: boolean
  onClose: () => void
}

type ExportChannel = 'json' | 'clipboard' | 'markdown'

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
      description: step,
    })),
    resolution: {
      summary: resolution.resolution.summary || '',
      steps: resolution.resolution.steps,
      yaml: resolution.resolution.yaml,
    },
    metadata: {
      author: resolution.sharedBy || resolution.userId,
      source: 'kubestellar-console',
      createdAt: resolution.createdAt,
      updatedAt: resolution.updatedAt,
    },
  }
}

function missionToMarkdown(mission: MissionExport): string {
  const lines = [
    `# ${mission.title}`,
    '',
    `**Type:** ${mission.type}`,
    `**Tags:** ${mission.tags.join(', ')}`,
    '',
    '## Problem',
    mission.description,
    '',
  ]

  if (mission.resolution?.summary) {
    lines.push('## Solution', mission.resolution.summary, '')
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
  const [scanResult, setScanResult] = useState<FileScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [exported, setExported] = useState<ExportChannel | null>(null)

  const mission = resolutionToMissionExport(resolution)

  const runScan = useCallback(() => {
    setScanning(true)
    try {
      const result = fullScan(mission)
      setScanResult(result)
    } catch {
      setScanResult(null)
    } finally {
      setScanning(false)
    }
  }, [mission])

  const handleExport = useCallback(async (channel: ExportChannel) => {
    // Run scan first if not done yet
    if (!scanResult && !scanning) {
      runScan()
    }

    const json = JSON.stringify(mission, null, 2)

    switch (channel) {
      case 'json': {
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${mission.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.json`
        a.click()
        URL.revokeObjectURL(url)
        break
      }
      case 'clipboard':
        await navigator.clipboard.writeText(json)
        break
      case 'markdown':
        await navigator.clipboard.writeText(missionToMarkdown(mission))
        break
    }

    setExported(channel)
    setTimeout(() => setExported(null), 2000)
  }, [mission, scanResult, scanning, runScan])

  if (!isOpen) return null

  const hasWarnings = scanResult && scanResult.findings.some(f => f.severity === 'warning' || f.severity === 'error')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Export Mission</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mission preview */}
        <div className="p-4 border-b border-border">
          <p className="text-xs font-medium text-foreground truncate">{resolution.title}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {resolution.issueSignature.type} · {resolution.resolution.steps.length} steps
          </p>
        </div>

        {/* Security scan status */}
        <div className="px-4 py-3 border-b border-border">
          {scanning ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Scanning for sensitive data...
            </div>
          ) : scanResult ? (
            <div className={cn('flex items-center gap-2 text-xs', hasWarnings ? 'text-yellow-400' : 'text-green-400')}>
              {hasWarnings ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
              {hasWarnings
                ? `${scanResult.findings.filter(f => f.severity !== 'info').length} finding(s) — review before sharing externally`
                : 'No sensitive data detected'}
            </div>
          ) : (
            <button
              onClick={runScan}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Shield className="w-3 h-3" />
              Run security scan before export
            </button>
          )}
        </div>

        {/* Export channels */}
        <div className="p-4 space-y-2">
          <ExportButton
            icon={<Download className="w-4 h-4" />}
            label="Download JSON"
            description="Save as .json file"
            active={exported === 'json'}
            onClick={() => handleExport('json')}
          />
          <ExportButton
            icon={<Copy className="w-4 h-4" />}
            label="Copy JSON"
            description="Copy to clipboard"
            active={exported === 'clipboard'}
            onClick={() => handleExport('clipboard')}
          />
          <ExportButton
            icon={<FileText className="w-4 h-4" />}
            label="Copy Markdown"
            description="Human-readable format"
            active={exported === 'markdown'}
            onClick={() => handleExport('markdown')}
          />
        </div>
      </div>
    </div>
  )
}

function ExportButton({ icon, label, description, active, onClick }: {
  icon: React.ReactNode
  label: string
  description: string
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
      <div className="flex-shrink-0">{active ? <CheckCircle className="w-4 h-4 text-green-400" /> : icon}</div>
      <div>
        <p className="text-xs font-medium">{active ? 'Done!' : label}</p>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
    </button>
  )
}
