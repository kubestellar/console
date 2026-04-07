/**
 * Submit to KB Dialog
 *
 * Converts a saved resolution into a console-kb compatible mission file
 * and opens GitHub's file creation UI to submit it as a PR to kubestellar/console-kb.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  BookUp,
  ExternalLink,
  Shield,
  Loader2,
  AlertTriangle,
  CheckCircle,
  FileJson,
  Tag } from 'lucide-react'
import type { Resolution } from '../../hooks/useResolutions'
import type { MissionExport, MissionClass, FileScanResult } from '../../lib/missions/types'
import { fullScan } from '../../lib/missions/scanner/index'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals/BaseModal'

/** GitHub repo for the knowledge base */
const CONSOLE_KB_REPO = 'kubestellar/console-kb'

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
  // Collect all text to search through
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

  // Check operators first (most reliable signal)
  for (const op of (resolution.context.operators || [])) {
    const opLower = op.toLowerCase()
    for (const [keyword, project] of Object.entries(CNCF_PROJECT_KEYWORDS)) {
      if (opLower === keyword || opLower.includes(keyword)) return project
    }
  }

  // Check title and namespace (next most reliable)
  const titleAndNs = [
    resolution.title,
    resolution.issueSignature.namespace || '',
  ].join(' ').toLowerCase()

  for (const [keyword, project] of Object.entries(CNCF_PROJECT_KEYWORDS)) {
    if (titleAndNs.includes(keyword)) return project
  }

  // Broader search across all text
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

  // Add troubleshooting section for fixer-class missions
  if (missionClass === 'fixer' && resolution.resolution.summary) {
    mission.troubleshooting = [
      {
        title: resolution.issueSignature.type,
        description: resolution.resolution.summary },
    ]
  }

  // Add resolution data
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

/** Build the GitHub "new file" URL that opens the file creation UI */
function buildGitHubNewFileUrl(
  filepath: string,
  content: string,
  description: string,
): string {
  // GitHub new file URL: /new/{branch}/{path}?filename=...&value=...&message=...
  const directory = filepath.includes('/') ? filepath.substring(0, filepath.lastIndexOf('/')) : 'fixes'
  const filename = filepath.includes('/') ? filepath.substring(filepath.lastIndexOf('/') + 1) : filepath

  const params = new URLSearchParams({
    filename,
    value: content,
    message: `Add ${filename}: ${description}`,
    description: `Submitted from KubeStellar Console resolution history.\n\n${description}` })

  return `https://github.com/${CONSOLE_KB_REPO}/new/${CONSOLE_KB_BRANCH}/${directory}?${params.toString()}`
}

export function SubmitToKBDialog({ resolution, isOpen, onClose }: SubmitToKBDialogProps) {
  const [missionClass, setMissionClass] = useState<MissionClass>('fixer')
  const [cncfProject, setCncfProject] = useState('')
  const [filename, setFilename] = useState('')
  const [scanResult, setScanResult] = useState<FileScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const scanRanRef = useRef(false)

  // Generate default filename and auto-detect CNCF project when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFilename(generateFilename(resolution.title, missionClass))
      setCncfProject(detectCNCFProject(resolution))
      setScanResult(null)
      scanRanRef.current = false
    }
  }, [isOpen, resolution.title, missionClass, resolution])

  // Build the console-kb formatted JSON
  const kbContent = resolutionToKBFormat(resolution, missionClass, cncfProject)

  const jsonString = JSON.stringify(kbContent, null, 2)

  // Determine the target directory based on mission class
  const targetDir = missionClass === 'install' ? 'fixes/cncf-install' : 'fixes/troubleshoot'
  const fullPath = `${targetDir}/${filename}`

  // Run security scan
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

  // Auto-scan on first open
  useEffect(() => {
    if (isOpen && !scanRanRef.current) {
      runScan()
    }
  }, [isOpen, runScan])

  const hasWarnings = scanResult?.findings.some(f => f.severity === 'warning' || f.severity === 'error')

  const handleSubmit = () => {
    const description = resolution.resolution.summary || resolution.title
    const url = buildGitHubNewFileUrl(fullPath, jsonString, description)

    // Check URL length — GitHub has limits
    if (url.length > MAX_GITHUB_URL_LENGTH) {
      // Fall back to opening an issue with the content instead
      const issueParams = new URLSearchParams({
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
        labels: ['new-mission', missionClass].join(',') })

      window.open(
        `https://github.com/${CONSOLE_KB_REPO}/issues/new?${issueParams.toString()}`,
        '_blank',
        'noopener,noreferrer',
      )
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }

    onClose()
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header title="Submit to Knowledge Base" icon={BookUp} onClose={onClose} />

      <BaseModal.Content noPadding>
        <div className="p-4 space-y-4">
          {/* Resolution preview */}
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <p className="text-xs font-medium text-foreground truncate">{resolution.title}</p>
            <p className="text-2xs text-muted-foreground mt-1">
              {resolution.issueSignature.type}
              {resolution.issueSignature.resourceKind && ` · ${resolution.issueSignature.resourceKind}`}
              {' · '}{resolution.resolution.steps.length} steps
            </p>
          </div>

          {/* Mission Class */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Mission Type
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
                  <span className="text-sm font-medium block">Fixer</span>
                  <span className="text-2xs opacity-70">Troubleshooting fix</span>
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
                  <span className="text-sm font-medium block">Install Mission</span>
                  <span className="text-2xs opacity-70">Setup / deploy guide</span>
                </div>
              </button>
            </div>
          </div>

          {/* CNCF Project (optional) */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              CNCF Project <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={cncfProject}
              onChange={(e) => setCncfProject(e.target.value)}
              placeholder="e.g., Istio, Argo CD, Prometheus..."
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Filename */}
          <div>
            <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
              <FileJson className="w-4 h-4 text-muted-foreground" />
              Filename
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{targetDir}/</span>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="flex-1 px-3 py-2 text-sm font-mono bg-secondary/50 border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Security scan */}
          <div className="px-3 py-2.5 rounded-lg border border-border bg-secondary/30">
            {scanning ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Scanning for sensitive data...
              </div>
            ) : scanResult ? (
              <div className={cn('flex items-center gap-2 text-xs', hasWarnings ? 'text-yellow-400' : 'text-green-400')}>
                {hasWarnings ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                {hasWarnings
                  ? `${scanResult.findings.filter(f => f.severity !== 'info').length} finding(s) — review before submitting`
                  : 'No sensitive data detected'}
              </div>
            ) : (
              <button
                onClick={runScan}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Shield className="w-3 h-3" />
                Run security scan
              </button>
            )}
          </div>

          {/* JSON preview */}
          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              Preview JSON ({jsonString.length} chars)
            </summary>
            <pre className="mt-2 p-3 rounded-lg bg-secondary/50 border border-border text-2xs font-mono text-foreground overflow-x-auto max-h-48 overflow-y-auto">
              {jsonString}
            </pre>
          </details>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <p className="text-2xs text-muted-foreground">
          Opens a PR on {CONSOLE_KB_REPO}
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!filename.trim()}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            <ExternalLink className="w-4 h-4" />
            Submit to KB
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
