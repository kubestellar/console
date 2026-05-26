/**
 * Submit to KB Dialog
 *
 * Converts a saved resolution into a console-kb compatible mission file
 * and opens GitHub's file creation UI to submit it as a PR to kubestellar/console-kb.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
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

/** GitHub repo for the knowledge base */
const CONSOLE_KB_OWNER = 'kubestellar'
const CONSOLE_KB_REPO = 'console-kb'

/** Default branch for new file PRs */
const CONSOLE_KB_BRANCH = 'master'

/** Max URL length for GitHub new-file links (browsers typically support ~8000) */
const MAX_GITHUB_URL_LENGTH = 7500

/**
 * Map of keywords found in resolution titles, error patterns, namespaces, and
 * operator lists to their canonical CNCF project name.
 * Checked against title, steps, namespace, operators, and resourceKind.
 */
const CNCF_PROJECT_KEYWORDS: Record<string, string> = {
  kyverno: 'Kyverno',
  kubescape: 'Kubescape',
  kubevuln: 'Kubescape',
  trivy: 'Trivy',
  istio: 'Istio',
  'argo cd': 'Argo CD',
  argocd: 'Argo CD',
  argo: 'Argo CD',
  'argo-rollouts': 'Argo Rollouts',
  prometheus: 'Prometheus',
  grafana: 'Grafana',
  jaeger: 'Jaeger',
  linkerd: 'Linkerd',
  envoy: 'Envoy',
  contour: 'Contour',
  'cert-manager': 'cert-manager',
  certmanager: 'cert-manager',
  falco: 'Falco',
  flux: 'Flux',
  fluxcd: 'Flux',
  'open policy agent': 'OPA',
  opa: 'OPA',
  gatekeeper: 'OPA Gatekeeper',
  etcd: 'etcd',
  coredns: 'CoreDNS',
  helm: 'Helm',
  harbor: 'Harbor',
  'cloud native buildpacks': 'Buildpacks',
  buildpack: 'Buildpacks',
  crossplane: 'Crossplane',
  thanos: 'Thanos',
  fluentd: 'Fluentd',
  'fluent bit': 'Fluent Bit',
  cilium: 'Cilium',
  calico: 'Calico',
  rook: 'Rook',
  vitess: 'Vitess',
  tikv: 'TiKV',
  nats: 'NATS',
  knative: 'Knative',
  dapr: 'Dapr',
  'open telemetry': 'OpenTelemetry',
  opentelemetry: 'OpenTelemetry',
  otel: 'OpenTelemetry',
  spiffe: 'SPIFFE',
  spire: 'SPIRE',
  longhorn: 'Longhorn',
  backstage: 'Backstage',
  'kube-virt': 'KubeVirt',
  kubevirt: 'KubeVirt',
  'virtual machine': 'KubeVirt',
  volcano: 'Volcano',
  keptn: 'Keptn',
  'kubestellar': 'KubeStellar' }

/** Try to detect the CNCF project from a resolution's context */
function detectCNCFProject(resolution: Resolution): string {
  const searchTexts = [
    resolution.title,
    resolution.issueSignature.type,
    resolution.issueSignature.errorPattern || '',
    resolution.issueSignature.namespace || '',
    resolution.issueSignature.resourceKind || '',
    resolution.resolution.summary || '',
    ...resolution.resolution.steps,
    ...(resolution.context.operators || []),
  ].join(' ').toLowerCase()

  for (const op of (resolution.context.operators || [])) {
    const opLower = op.toLowerCase()
    for (const [keyword, project] of Object.entries(CNCF_PROJECT_KEYWORDS)) {
      if (opLower === keyword || opLower.includes(keyword)) return project
    }
  }

  const titleAndNs = [
    resolution.title,
    resolution.issueSignature.namespace || '',
  ].join(' ').toLowerCase()

  for (const [keyword, project] of Object.entries(CNCF_PROJECT_KEYWORDS)) {
    if (titleAndNs.includes(keyword)) return project
  }

  for (const [keyword, project] of Object.entries(CNCF_PROJECT_KEYWORDS)) {
    if (searchTexts.includes(keyword)) return project
  }

  return ''
}

interface SubmitToKBDialogProps {
  resolution: Resolution
  isOpen: boolean
  onClose: () => void
}

/**
 * Convert a Resolution into the console-kb nested file format.
 * console-kb uses: { mission: { steps, ... }, metadata: { ... } }
 */
function resolutionToKBFormat(
  resolution: Resolution,
  missionClass: MissionClass,
  cncfProject: string,
): Record<string, unknown> {
  const steps = resolution.resolution.steps.map((step, i) => ({
    title: `Step ${i + 1}`,
    description: step }))

  const mission: Record<string, unknown> = {
    steps }

  if (missionClass === 'fixer' && resolution.resolution.summary) {
    mission.troubleshooting = [
      {
        title: resolution.issueSignature.type,
        description: resolution.resolution.summary },
    ]
  }

  if (resolution.resolution.summary || resolution.resolution.steps.length > 0) {
    mission.resolution = {
      summary: resolution.resolution.summary,
      steps: resolution.resolution.steps,
      ...(resolution.resolution.yaml ? { yaml: resolution.resolution.yaml } : {}) }
  }

  return {
    version: 'kc-mission-v1',
    title: resolution.title,
    description: resolution.resolution.summary || resolution.title,
    type: missionClass === 'install' ? 'deploy' : 'troubleshoot',
    missionClass,
    tags: [
      resolution.issueSignature.type,
      ...(resolution.issueSignature.resourceKind ? [resolution.issueSignature.resourceKind] : []),
      ...(cncfProject ? [cncfProject] : []),
    ].filter(Boolean),
    category: missionClass === 'install' ? 'installation' : 'troubleshooting',
    ...(cncfProject ? { cncfProject } : {}),
    ...(resolution.issueSignature.resourceKind ? { resourceKind: resolution.issueSignature.resourceKind } : {}),
    mission,
    metadata: {
      author: resolution.sharedBy || resolution.userId,
      source: 'kubestellar-console',
      createdAt: resolution.createdAt,
      updatedAt: resolution.updatedAt } }
}

/** Generate a filesystem-safe filename from the resolution title */
function generateFilename(title: string, missionClass: MissionClass): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  const prefix = missionClass === 'install' ? 'install' : 'fixer'
  return `${prefix}-${slug}.json`
}

export function SubmitToKBDialog({ resolution, isOpen, onClose }: SubmitToKBDialogProps) {
  const { t } = useTranslation()
  const [missionClass, setMissionClass] = useState<MissionClass>('fixer')
  const [cncfProject, setCncfProject] = useState('')
  const [filename, setFilename] = useState('')
  const [scanResult, setScanResult] = useState<FileScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const scanRanRef = useRef(false)

  useEffect(() => {
    if (isOpen) {
      setFilename(generateFilename(resolution.title, missionClass))
      setCncfProject(detectCNCFProject(resolution))
      setScanResult(null)
      scanRanRef.current = false
    }
  }, [isOpen, resolution.title, missionClass, resolution])

  const kbContent = resolutionToKBFormat(resolution, missionClass, cncfProject)
  const jsonString = JSON.stringify(kbContent, null, 2)
  const targetDir = missionClass === 'install' ? 'fixes/cncf-install' : 'fixes/troubleshoot'

  const runScan = useCallback(() => {
    setScanning(true)
    try {
      const result = fullScan(kbContent as unknown as MissionExport)
      setScanResult(result)
    } catch {
      setScanResult(null)
    } finally {
      setScanning(false)
      scanRanRef.current = true
    }
  }, [kbContent])

  useEffect(() => {
    if (isOpen && !scanRanRef.current) {
      runScan()
    }
  }, [isOpen, runScan])

  const warningCount = scanResult?.findings.filter(f => f.severity !== 'info').length ?? 0
  const hasWarnings = warningCount > 0

  const handleSubmit = () => {
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
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header title={t('dialogs.submitToKB.title')} icon={BookUp} onClose={onClose} />

      <BaseModal.Content noPadding>
        <div className="p-4 space-y-4">
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <p className="text-xs font-medium text-foreground truncate">{resolution.title}</p>
            <p className="text-2xs text-muted-foreground mt-1">
              {t('dialogs.submitToKB.preview', {
                type: resolution.issueSignature.type,
                count: resolution.resolution.steps.length,
              })}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              {t('dialogs.submitToKB.missionType')}
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setMissionClass('fixer')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-colors',
                  missionClass === 'fixer'
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                    : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Tag className="w-4 h-4" />
                <div className="text-left">
                  <span className="text-sm font-medium block">{t('dialogs.submitToKB.fixer')}</span>
                  <span className="text-2xs opacity-70">{t('dialogs.submitToKB.fixerDescription')}</span>
                </div>
              </button>
              <button
                onClick={() => setMissionClass('install')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-colors',
                  missionClass === 'install'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <BookUp className="w-4 h-4" />
                <div className="text-left">
                  <span className="text-sm font-medium block">{t('dialogs.submitToKB.installMission')}</span>
                  <span className="text-2xs opacity-70">{t('dialogs.submitToKB.installMissionDescription')}</span>
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t('dialogs.submitToKB.cncfProject')} <span className="text-muted-foreground font-normal">{t('dialogs.submitToKB.optional')}</span>
            </label>
            <input
              type="text"
              value={cncfProject}
              onChange={(e) => setCncfProject(e.target.value)}
              placeholder={t('dialogs.submitToKB.cncfProjectPlaceholder')}
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
              <FileJson className="w-4 h-4 text-muted-foreground" />
              {t('dialogs.submitToKB.filename')}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{targetDir}/</span>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="flex-1 px-3 py-2 text-sm font-mono bg-secondary/50 border border-border rounded-lg text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="px-3 py-2.5 rounded-lg border border-border bg-secondary/30">
            {scanning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('dialogs.submitToKB.scanning')}
              </div>
            ) : scanResult ? (
              <div className={cn('flex items-center gap-2 text-xs', hasWarnings ? 'text-yellow-400' : 'text-green-400')}>
                {hasWarnings ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                {hasWarnings
                  ? t('dialogs.submitToKB.findingsWarning', { count: warningCount })
                  : t('dialogs.submitToKB.noSensitiveData')}
              </div>
            ) : (
              <button
                onClick={runScan}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Shield className="w-3 h-3" />
                {t('dialogs.submitToKB.runSecurityScan')}
              </button>
            )}
          </div>

          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              {t('dialogs.submitToKB.previewJson', { count: jsonString.length })}
            </summary>
            <pre className="mt-2 p-3 rounded-lg bg-secondary/50 border border-border text-2xs font-mono text-foreground overflow-x-auto max-h-48 overflow-y-auto">
              {jsonString}
            </pre>
          </details>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <p className="text-2xs text-muted-foreground">
          {t('dialogs.submitToKB.opensPr', { repo: CONSOLE_KB_REPO })}
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('actions.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!filename.trim()}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-linear-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            <ExternalLink className="w-4 h-4" />
            {t('dialogs.submitToKB.submit')}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
