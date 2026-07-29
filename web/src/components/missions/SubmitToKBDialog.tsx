/**
 * Submit to KB Dialog
 *
 * Converts a saved resolution into a console-kb compatible mission file
 * and opens GitHub's file creation UI to submit it as a PR to kubestellar/console-kb.
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BookUp,
  ExternalLink,
  Shield,
  Loader2,
  AlertTriangle,
  CheckCircle,
  FileJson,
  Tag } from 'lucide-react'
import { buildGitHubIssueUrl, buildGitHubNewFileUrl } from '@/lib/githubUrls'
import type { Resolution } from '../../hooks/useResolutions'
import type { MissionExport, MissionClass, FileScanResult } from '../../lib/missions/types'
import { fullScan } from '../../lib/missions/scanner/index'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals/BaseModal'
import {
  CONSOLE_KB_OWNER,
  CONSOLE_KB_REPO,
  CONSOLE_KB_BRANCH,
  MAX_GITHUB_URL_LENGTH,
  detectCNCFProject,
  resolutionToKBFormat,
  generateFilename,
} from './SubmitToKBDialog.helpers'

interface SubmitToKBDialogProps {
  resolution: Resolution
  isOpen: boolean
  onClose: () => void
}

export function SubmitToKBDialog({ resolution, isOpen, onClose }: SubmitToKBDialogProps) {
  const { t } = useTranslation()
  const [missionClass, setMissionClass] = useState<MissionClass>('fixer')
  const [cncfProjectInput, setCncfProjectInput] = useState<{ key: string; value: string }>({ key: '', value: '' })
  const [filenameInput, setFilenameInput] = useState<{ key: string; value: string }>({ key: '', value: '' })
  const [scanState, setScanState] = useState<{
    key: string
    result: FileScanResult | null
    scanning: boolean
  }>({ key: '', result: null, scanning: false })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const scanRanRef = useRef('')
  const isSubmitPending = isSubmitting

  const dialogKey = `${resolution.id}:${resolution.updatedAt}:${isOpen ? 'open' : 'closed'}`
  const filenameKey = `${dialogKey}:${missionClass}`
  const cncfProject = cncfProjectInput.key === dialogKey
    ? cncfProjectInput.value
    : detectCNCFProject(resolution)
  const filename = filenameInput.key === filenameKey
    ? filenameInput.value
    : generateFilename(resolution.title, missionClass)
  const scanResult = scanState.key === dialogKey ? scanState.result : null
  const scanning = scanState.key === dialogKey ? scanState.scanning : false

  const kbContent = resolutionToKBFormat(resolution, missionClass, cncfProject)
  const jsonString = JSON.stringify(kbContent, null, 2)
  const targetDir = missionClass === 'install' ? 'fixes/cncf-install' : 'fixes/troubleshoot'

  const runScan = () => {
    setScanState({ key: dialogKey, result: scanResult, scanning: true })
    try {
      const result = fullScan(kbContent as unknown as MissionExport)
      setScanState({ key: dialogKey, result, scanning: false })
    } catch {
      setScanState({ key: dialogKey, result: null, scanning: false })
    }
  }

  useEffect(() => {
    if (isOpen && scanRanRef.current !== dialogKey) {
      scanRanRef.current = dialogKey
      runScan()
    }
  }, [dialogKey, isOpen])

  const warningCount = scanResult?.findings.filter(f => f.severity !== 'info').length ?? 0
  const hasWarnings = warningCount > 0

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await Promise.resolve()

      const description = resolution.resolution.summary || resolution.title
      const url = buildGitHubNewFileUrl({
        owner: CONSOLE_KB_OWNER,
        repo: CONSOLE_KB_REPO,
        branch: CONSOLE_KB_BRANCH,
        path: targetDir,
        filename,
        content: jsonString,
        message: `Add ${filename}: ${description}`,
        description: `Submitted from KubeStellar Console resolution history.\n\n${description}`,
      })

      if (url.length > MAX_GITHUB_URL_LENGTH) {
        const issueUrl = buildGitHubIssueUrl({
          owner: CONSOLE_KB_OWNER,
          repo: CONSOLE_KB_REPO,
          title: `New ${missionClass}: ${resolution.title}`,
          body: [
            `## New ${missionClass === 'install' ? 'Install Mission' : 'Solution'}`,
            '',
            `**Title:** ${resolution.title}`,
            `**Issue Type:** ${resolution.issueSignature.type}`,
            cncfProject ? `**CNCF Project:** ${cncfProject}` : '',
            '',
            '## Mission JSON',
            '',
            '```json',
            jsonString,
            '```',
            '',
            '---',
            '_Submitted from KubeStellar Console resolution history._',
          ].filter(Boolean).join('\n'),
          labels: ['new-mission', missionClass],
        })

        window.open(issueUrl, '_blank', 'noopener,noreferrer')
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }

      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false} closeOnEscape={!isSubmitPending}>
      <BaseModal.Header title={t('missions.submitToKB.title')} icon={BookUp} onClose={isSubmitPending ? undefined : onClose} />

      <BaseModal.Content noPadding>
        <div className="p-4 space-y-4">
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <p className="text-xs font-medium text-foreground truncate">{resolution.title}</p>
            <p className="text-2xs text-muted-foreground mt-1">
              {resolution.issueSignature.type}
              {resolution.issueSignature.resourceKind && ` · ${resolution.issueSignature.resourceKind}`}
              {' · '}{t('missions.browser.stepsCount', { count: resolution.resolution.steps.length })}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              {t('missions.submitToKB.missionType')}
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setMissionClass('fixer')}
                disabled={isSubmitting || scanning}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-colors',
                  missionClass === 'fixer'
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                    : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Tag className="w-4 h-4" />
                <div className="text-left">
                  <span className="text-sm font-medium block">{t('missions.submitToKB.missionClass.fixer.label')}</span>
                  <span className="text-2xs opacity-70">{t('missions.submitToKB.missionClass.fixer.description')}</span>
                </div>
              </button>
              <button
                onClick={() => setMissionClass('install')}
                disabled={isSubmitting || scanning}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-colors',
                  missionClass === 'install'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <BookUp className="w-4 h-4" />
                <div className="text-left">
                  <span className="text-sm font-medium block">{t('missions.submitToKB.missionClass.install.label')}</span>
                  <span className="text-2xs opacity-70">{t('missions.submitToKB.missionClass.install.description')}</span>
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t('missions.submitToKB.cncfProject')}{' '}<span className="text-muted-foreground font-normal">({t('missions.submitToKB.optional')})</span>
            </label>
            <input
              type="text"
              value={cncfProject}
              onChange={(e) => setCncfProjectInput({ key: dialogKey, value: e.target.value })}
              disabled={isSubmitting || scanning}
              placeholder={t('missions.submitToKB.cncfProjectPlaceholder')}
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
              <FileJson className="w-4 h-4 text-muted-foreground" />
              {t('missions.submitToKB.filename')}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{targetDir}/</span>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilenameInput({ key: filenameKey, value: e.target.value })}
                disabled={isSubmitting || scanning}
                className="flex-1 px-3 py-2 text-sm font-mono bg-secondary/50 border border-border rounded-lg text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="px-3 py-2.5 rounded-lg border border-border bg-secondary/30">
            {scanning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('missions.submitToKB.scanning')}
              </div>
            ) : scanResult ? (
              <div className={cn('flex items-center gap-2 text-xs', hasWarnings ? 'text-yellow-400' : 'text-green-400')}>
                {hasWarnings ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                {hasWarnings
                  ? t('missions.submitToKB.findings', { count: warningCount })
                  : t('missions.submitToKB.noSensitiveData')}
              </div>
            ) : (
              <button
                onClick={runScan}
                disabled={isSubmitting || scanning}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <Shield className="w-3 h-3" />
                {t('missions.submitToKB.runSecurityScan')}
              </button>
            )}
          </div>

          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              {t('missions.submitToKB.previewJson', { count: jsonString.length })}
            </summary>
            <pre className="mt-2 p-3 rounded-lg bg-secondary/50 border border-border text-2xs font-mono text-foreground overflow-x-auto max-h-48 overflow-y-auto">
              {jsonString}
            </pre>
          </details>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <p className="text-2xs text-muted-foreground">
          {t('missions.submitToKB.opensPr', { repo: CONSOLE_KB_REPO })}
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onClose}
            disabled={isSubmitPending}
            className="px-3 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {t('missions.submitToKB.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!filename.trim() || isSubmitting || scanning}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-linear-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('missions.submitToKB.submitting')}
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4" />
                {t('missions.submitToKB.submit')}
              </>
            )}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
