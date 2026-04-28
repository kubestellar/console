/**
 * WorkloadImportDialog - Modal dialog for importing workloads from multiple sources
 *
 * Supports 4 import methods:
 * 1. YAML  - Paste raw Kubernetes YAML (Deployment, StatefulSet, DaemonSet, Job, CronJob)
 * 2. Helm  - Specify chart repo URL, chart name, release name, namespace, values
 * 3. GitHub - Provide a GitHub repo URL + path to manifests
 * 4. Kustomize - Provide a kustomization directory URL or path
 *
 * Each tab provides:
 * - Input fields appropriate to the source type
 * - A "Preview" button that parses/validates input and shows discoverable resources
 * - An "Import" button that adds the workload(s) to local state
 */

import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileCode2,
  Package,
  FolderGit2,
  Eye,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react'
import { Github } from '@/lib/icons'
import { load as yamlLoad, loadAll as yamlLoadAll } from 'js-yaml'
import { BaseModal } from '../../lib/modals'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import type { Workload } from './WorkloadDeployment'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid top-level Kubernetes workload kinds we accept */
const VALID_WORKLOAD_KINDS = new Set([
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Job',
  'CronJob',
])

/** Default replica count when kind doesn't specify one */
const DEFAULT_REPLICA_COUNT = 1

/** Tab identifiers */
type ImportTab = 'yaml' | 'helm' | 'github' | 'kustomize'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedResource {
  kind: string
  name: string
  namespace: string
  image: string
}

/**
 * Parse a YAML document string into an array of valid K8s workload resources.
 * Supports multi-document YAML (separated by `---`).
 */
function parseYamlDocuments(text: string): { resources: ParsedResource[]; errors: string[] } {
  const resources: ParsedResource[] = []
  const errors: string[] = []

  if (!text.trim()) {
    errors.push('YAML input is empty')
    return { resources, errors }
  }

  try {
    const docs = yamlLoadAll(text)
    for (const doc of docs) {
      if (!doc || typeof doc !== 'object') continue
      const obj = doc as Record<string, unknown>

      const kind = obj.kind as string | undefined
      if (!kind) {
        errors.push('Document missing "kind" field')
        continue
      }
      if (!VALID_WORKLOAD_KINDS.has(kind)) {
        errors.push(`Unsupported kind "${kind}" — expected one of: ${[...VALID_WORKLOAD_KINDS].join(', ')}`)
        continue
      }

      const metadata = obj.metadata as Record<string, unknown> | undefined
      const name = (metadata?.name as string) || 'unnamed'
      const namespace = (metadata?.namespace as string) || 'default'

      // Try to extract the first container image
      const spec = obj.spec as Record<string, unknown> | undefined
      const templateSpec = (
        (spec?.template as Record<string, unknown> | undefined)?.spec as Record<string, unknown> | undefined
      )
      const containers = (templateSpec?.containers as Array<Record<string, unknown>> | undefined) || []
      const image = (containers[0]?.image as string) || 'unknown'

      resources.push({ kind, name, namespace, image })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    errors.push(`YAML parse error: ${message}`)
  }

  return { resources, errors }
}

/**
 * Convert a ParsedResource into a full Workload object with sensible defaults.
 */
function resourceToWorkload(r: ParsedResource): Workload {
  return {
    name: r.name,
    namespace: r.namespace,
    type: r.kind as Workload['type'],
    status: 'Pending',
    replicas: DEFAULT_REPLICA_COUNT,
    readyReplicas: 0,
    image: r.image,
    labels: { 'app.kubernetes.io/name': r.name },
    targetClusters: [],
    deployments: [],
    createdAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkloadImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onImport: (workloads: Workload[]) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkloadImportDialog({ isOpen, onClose, onImport }: WorkloadImportDialogProps) {
  const { t } = useTranslation('cards')
  const [activeTab, setActiveTab] = useState<ImportTab>('yaml')

  // ---------- YAML tab state ----------
  const [yamlText, setYamlText] = useState('')
  const [yamlPreview, setYamlPreview] = useState<ParsedResource[]>([])
  const [yamlErrors, setYamlErrors] = useState<string[]>([])

  // ---------- Helm tab state ----------
  const [helmRepoUrl, setHelmRepoUrl] = useState('')
  const [helmChartName, setHelmChartName] = useState('')
  const [helmReleaseName, setHelmReleaseName] = useState('')
  const [helmNamespace, setHelmNamespace] = useState('default')
  const [helmValues, setHelmValues] = useState('')
  const [helmPreview, setHelmPreview] = useState<ParsedResource | null>(null)
  const [helmErrors, setHelmErrors] = useState<string[]>([])

  // ---------- GitHub tab state ----------
  const [githubUrl, setGithubUrl] = useState('')
  const [githubPath, setGithubPath] = useState('')
  const [githubPreview, setGithubPreview] = useState<ParsedResource | null>(null)
  const [githubErrors, setGithubErrors] = useState<string[]>([])

  // ---------- Kustomize tab state ----------
  const [kustomizeUrl, setKustomizeUrl] = useState('')
  const [kustomizePreview, setKustomizePreview] = useState<ParsedResource | null>(null)
  const [kustomizeErrors, setKustomizeErrors] = useState<string[]>([])

  // ---------- Shared ----------
  const [importSuccess, setImportSuccess] = useState(false)

  // Reset all state when closing
  const handleClose = useCallback(() => {
    setYamlText('')
    setYamlPreview([])
    setYamlErrors([])
    setHelmRepoUrl('')
    setHelmChartName('')
    setHelmReleaseName('')
    setHelmNamespace('default')
    setHelmValues('')
    setHelmPreview(null)
    setHelmErrors([])
    setGithubUrl('')
    setGithubPath('')
    setGithubPreview(null)
    setGithubErrors([])
    setKustomizeUrl('')
    setKustomizePreview(null)
    setKustomizeErrors([])
    setImportSuccess(false)
    setActiveTab('yaml')
    onClose()
  }, [onClose])

  // -----------------------------------------------------------------------
  // YAML handlers
  // -----------------------------------------------------------------------
  const handleYamlPreview = useCallback(() => {
    const { resources, errors } = parseYamlDocuments(yamlText)
    setYamlPreview(resources)
    setYamlErrors(errors)
  }, [yamlText])

  const handleYamlImport = useCallback(() => {
    const { resources, errors } = parseYamlDocuments(yamlText)
    if (errors.length > 0 && resources.length === 0) {
      setYamlErrors(errors)
      return
    }
    const workloads = resources.map(resourceToWorkload)
    onImport(workloads)
    setImportSuccess(true)
  }, [yamlText, onImport])

  // -----------------------------------------------------------------------
  // Helm handlers
  // -----------------------------------------------------------------------
  const handleHelmPreview = useCallback(() => {
    const errors: string[] = []
    if (!helmRepoUrl.trim()) errors.push(t('workloadImport.helmRepoRequired'))
    if (!helmChartName.trim()) errors.push(t('workloadImport.helmChartRequired'))
    if (!helmReleaseName.trim()) errors.push(t('workloadImport.helmReleaseRequired'))

    if (helmValues.trim()) {
      try {
        yamlLoad(helmValues)
      } catch {
        errors.push(t('workloadImport.helmValuesInvalid'))
      }
    }

    setHelmErrors(errors)
    if (errors.length === 0) {
      setHelmPreview({
        kind: 'Deployment',
        name: helmReleaseName,
        namespace: helmNamespace || 'default',
        image: `${helmChartName}:latest`,
      })
    }
  }, [helmRepoUrl, helmChartName, helmReleaseName, helmNamespace, helmValues, t])

  const handleHelmImport = useCallback(() => {
    if (!helmPreview) {
      handleHelmPreview()
      return
    }
    const workload = resourceToWorkload(helmPreview)
    workload.labels['helm.sh/chart'] = helmChartName
    workload.labels['helm.sh/repo'] = helmRepoUrl
    onImport([workload])
    setImportSuccess(true)
  }, [helmPreview, helmChartName, helmRepoUrl, onImport, handleHelmPreview])

  // -----------------------------------------------------------------------
  // GitHub handlers
  // -----------------------------------------------------------------------
  const handleGithubPreview = useCallback(() => {
    const errors: string[] = []
    if (!githubUrl.trim()) errors.push(t('workloadImport.githubUrlRequired'))

    setGithubErrors(errors)
    if (errors.length === 0) {
      // Extract repo name from URL for the summary entry
      const urlParts = githubUrl.replace(/\/+$/, '').split('/')
      const repoName = urlParts[urlParts.length - 1] || 'github-workload'
      const pathSuffix = githubPath.trim() ? ` (${githubPath.trim()})` : ''
      setGithubPreview({
        kind: 'Deployment',
        name: `${repoName}-manifests`,
        namespace: 'default',
        image: `github:${githubUrl}${pathSuffix}`,
      })
    }
  }, [githubUrl, githubPath, t])

  const handleGithubImport = useCallback(() => {
    if (!githubPreview) {
      handleGithubPreview()
      return
    }
    const workload = resourceToWorkload(githubPreview)
    workload.labels['source/type'] = 'github'
    workload.labels['source/url'] = githubUrl
    onImport([workload])
    setImportSuccess(true)
  }, [githubPreview, githubUrl, onImport, handleGithubPreview])

  // -----------------------------------------------------------------------
  // Kustomize handlers
  // -----------------------------------------------------------------------
  const handleKustomizePreview = useCallback(() => {
    const errors: string[] = []
    if (!kustomizeUrl.trim()) errors.push(t('workloadImport.kustomizeUrlRequired'))

    setKustomizeErrors(errors)
    if (errors.length === 0) {
      const pathParts = kustomizeUrl.replace(/\/+$/, '').split('/')
      const dirName = pathParts[pathParts.length - 1] || 'kustomize-workload'
      setKustomizePreview({
        kind: 'Deployment',
        name: `${dirName}-kustomize`,
        namespace: 'default',
        image: `kustomize:${kustomizeUrl}`,
      })
    }
  }, [kustomizeUrl, t])

  const handleKustomizeImport = useCallback(() => {
    if (!kustomizePreview) {
      handleKustomizePreview()
      return
    }
    const workload = resourceToWorkload(kustomizePreview)
    workload.labels['source/type'] = 'kustomize'
    workload.labels['source/url'] = kustomizeUrl
    onImport([workload])
    setImportSuccess(true)
  }, [kustomizePreview, kustomizeUrl, onImport, handleKustomizePreview])

  // -----------------------------------------------------------------------
  // Tab configuration
  // -----------------------------------------------------------------------

  const tabs = [
    { id: 'yaml' as const, label: t('workloadImport.tabYaml'), icon: FileCode2 },
    { id: 'helm' as const, label: t('workloadImport.tabHelm'), icon: Package },
    { id: 'github' as const, label: t('workloadImport.tabGithub'), icon: Github },
    { id: 'kustomize' as const, label: t('workloadImport.tabKustomize'), icon: FolderGit2 },
  ]

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderErrors = (errors: string[]) => {
    if (errors.length === 0) return null
    return (
      <div className="mt-3 space-y-1">
        {errors.map((err, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        ))}
      </div>
    )
  }

  const renderPreviewTable = (resources: ParsedResource[]) => {
    if (resources.length === 0) return null
    return (
      <div className="mt-3 border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-secondary/50">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('workloadImport.previewKind')}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('workloadImport.previewName')}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('workloadImport.previewNamespace')}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('workloadImport.previewImage')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {resources.map((r, i) => (
              <tr key={i} className="hover:bg-secondary/30">
                <td className="px-3 py-2 font-mono">{r.kind}</td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.namespace}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[200px]">{r.image}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderSinglePreview = (resource: ParsedResource | null) => {
    if (!resource) return null
    return renderPreviewTable([resource])
  }

  const inputClasses = 'w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50'
  const labelClasses = 'block text-xs font-medium text-muted-foreground mb-1'

  // -----------------------------------------------------------------------
  // Tab content
  // -----------------------------------------------------------------------

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setYamlText(text)
      setYamlPreview([])
      setYamlErrors([])
      setImportSuccess(false)
    }
    reader.readAsText(file)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  const renderYamlTab = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <p className="text-xs text-muted-foreground">
          {t('workloadImport.yamlDescription')}
        </p>
        <label className="flex items-center gap-1.5 px-2.5 py-1 text-2xs font-medium rounded-md bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
          <Download className="h-3 w-3" />
          Upload file
          <input type="file" accept=".yaml,.yml,.json" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>
      <textarea
        className={cn(inputClasses, 'h-48 font-mono text-xs resize-y')}
        placeholder={t('workloadImport.yamlPlaceholder')}
        value={yamlText}
        onChange={(e) => {
          setYamlText(e.target.value)
          setYamlPreview([])
          setYamlErrors([])
          setImportSuccess(false)
        }}
      />
      {renderErrors(yamlErrors)}
      {renderPreviewTable(yamlPreview)}
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="secondary"
          size="sm"
          icon={<Eye className="h-3.5 w-3.5" />}
          onClick={handleYamlPreview}
          disabled={!yamlText.trim()}
        >
          {t('workloadImport.preview')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={handleYamlImport}
          disabled={!yamlText.trim()}
        >
          {t('workloadImport.import')}
        </Button>
      </div>
    </div>
  )

  const renderHelmTab = () => (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t('workloadImport.helmDescription')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClasses}>{t('workloadImport.helmRepoUrl')}</label>
          <input
            className={inputClasses}
            placeholder="https://charts.example.com"
            value={helmRepoUrl}
            onChange={(e) => { setHelmRepoUrl(e.target.value); setHelmPreview(null); setHelmErrors([]); setImportSuccess(false) }}
          />
        </div>
        <div>
          <label className={labelClasses}>{t('workloadImport.helmChartName')}</label>
          <input
            className={inputClasses}
            placeholder="my-chart"
            value={helmChartName}
            onChange={(e) => { setHelmChartName(e.target.value); setHelmPreview(null); setHelmErrors([]); setImportSuccess(false) }}
          />
        </div>
        <div>
          <label className={labelClasses}>{t('workloadImport.helmReleaseName')}</label>
          <input
            className={inputClasses}
            placeholder="my-release"
            value={helmReleaseName}
            onChange={(e) => { setHelmReleaseName(e.target.value); setHelmPreview(null); setHelmErrors([]); setImportSuccess(false) }}
          />
        </div>
        <div>
          <label className={labelClasses}>{t('workloadImport.helmNamespaceLabel')}</label>
          <input
            className={inputClasses}
            placeholder="default"
            value={helmNamespace}
            onChange={(e) => { setHelmNamespace(e.target.value); setHelmPreview(null); setHelmErrors([]); setImportSuccess(false) }}
          />
        </div>
      </div>
      <div>
        <label className={labelClasses}>{t('workloadImport.helmValuesLabel')}</label>
        <textarea
          className={cn(inputClasses, 'h-24 font-mono text-xs resize-y')}
          placeholder={t('workloadImport.helmValuesPlaceholder')}
          value={helmValues}
          onChange={(e) => { setHelmValues(e.target.value); setHelmPreview(null); setHelmErrors([]); setImportSuccess(false) }}
        />
      </div>
      {renderErrors(helmErrors)}
      {renderSinglePreview(helmPreview)}
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="secondary"
          size="sm"
          icon={<Eye className="h-3.5 w-3.5" />}
          onClick={handleHelmPreview}
          disabled={!helmRepoUrl.trim() || !helmChartName.trim() || !helmReleaseName.trim()}
        >
          {t('workloadImport.preview')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={handleHelmImport}
          disabled={!helmRepoUrl.trim() || !helmChartName.trim() || !helmReleaseName.trim()}
        >
          {t('workloadImport.import')}
        </Button>
      </div>
    </div>
  )

  const renderGithubTab = () => (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t('workloadImport.githubDescription')}
      </p>
      <div>
        <label className={labelClasses}>{t('workloadImport.githubRepoUrl')}</label>
        <input
          className={inputClasses}
          placeholder="https://github.com/org/repo"
          value={githubUrl}
          onChange={(e) => { setGithubUrl(e.target.value); setGithubPreview(null); setGithubErrors([]); setImportSuccess(false) }}
        />
      </div>
      <div>
        <label className={labelClasses}>{t('workloadImport.githubManifestPath')}</label>
        <input
          className={inputClasses}
          placeholder="k8s/ or deploy/manifests/"
          value={githubPath}
          onChange={(e) => { setGithubPath(e.target.value); setGithubPreview(null); setGithubErrors([]); setImportSuccess(false) }}
        />
      </div>
      {renderErrors(githubErrors)}
      {renderSinglePreview(githubPreview)}
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="secondary"
          size="sm"
          icon={<Eye className="h-3.5 w-3.5" />}
          onClick={handleGithubPreview}
          disabled={!githubUrl.trim()}
        >
          {t('workloadImport.preview')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={handleGithubImport}
          disabled={!githubUrl.trim()}
        >
          {t('workloadImport.import')}
        </Button>
      </div>
    </div>
  )

  const renderKustomizeTab = () => (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t('workloadImport.kustomizeDescription')}
      </p>
      <div>
        <label className={labelClasses}>{t('workloadImport.kustomizeDirUrl')}</label>
        <input
          className={inputClasses}
          placeholder="https://github.com/org/repo/tree/main/overlays/prod"
          value={kustomizeUrl}
          onChange={(e) => { setKustomizeUrl(e.target.value); setKustomizePreview(null); setKustomizeErrors([]); setImportSuccess(false) }}
        />
      </div>
      {renderErrors(kustomizeErrors)}
      {renderSinglePreview(kustomizePreview)}
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="secondary"
          size="sm"
          icon={<Eye className="h-3.5 w-3.5" />}
          onClick={handleKustomizePreview}
          disabled={!kustomizeUrl.trim()}
        >
          {t('workloadImport.preview')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={handleKustomizeImport}
          disabled={!kustomizeUrl.trim()}
        >
          {t('workloadImport.import')}
        </Button>
      </div>
    </div>
  )

  const tabContent = {
    yaml: renderYamlTab,
    helm: renderHelmTab,
    github: renderGithubTab,
    kustomize: renderKustomizeTab,
  } satisfies Record<ImportTab, () => React.ReactNode>

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      enableBackspace={false}
      closeOnBackdrop={false}
    >
      <BaseModal.Header
        title={t('workloadImport.title')}
        description={t('workloadImport.description')}
        icon={Download}
        onClose={handleClose}
        showBack={false}
      />

      <BaseModal.Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => {
          setActiveTab(id as ImportTab)
          setImportSuccess(false)
        }}
      />

      <BaseModal.Content className="min-h-[520px]">
        {importSuccess && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span className="text-sm text-green-400">{t('workloadImport.importSuccess')}</span>
            <button
              className="ml-auto p-0.5 rounded hover:bg-green-500/20 text-green-400"
              onClick={() => setImportSuccess(false)}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {tabContent[activeTab]()}
      </BaseModal.Content>

      <BaseModal.Footer
        showKeyboardHints
        keyboardHints={[{ key: 'Esc', label: t('workloadImport.close') }]}
      />
    </BaseModal>
  )
}
