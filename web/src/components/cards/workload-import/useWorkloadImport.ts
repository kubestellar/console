/**
 * useWorkloadImport - encapsulates all state and handlers for the
 * WorkloadImportDialog's four import tabs (YAML, Helm, GitHub, Kustomize).
 */
import { useCallback, useState } from 'react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import type { Workload } from '../WorkloadDeployment'
import type { ImportTab } from './workloadImportDialog.constants'
import { isValidYaml, parseYamlDocuments, resourceToWorkload, type ParsedResource } from './workloadImportDialog.utils'

export interface UseWorkloadImportOptions {
  onImport: (workloads: Workload[]) => void
  onClose: () => void
}

export function useWorkloadImport({ onImport, onClose }: UseWorkloadImportOptions) {
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

  const dismissImportSuccess = useCallback(() => setImportSuccess(false), [])

  const handleTabChange = useCallback((id: string) => {
    setActiveTab(id as ImportTab)
    setImportSuccess(false)
  }, [])

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
  const handleYamlChange = useCallback((text: string) => {
    setYamlText(text)
    setYamlPreview([])
    setYamlErrors([])
    setImportSuccess(false)
  }, [])

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

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      handleYamlChange(text)
    }
    reader.readAsText(file)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }, [handleYamlChange])

  // -----------------------------------------------------------------------
  // Helm handlers
  // -----------------------------------------------------------------------
  const handleHelmFieldChange = useCallback(() => {
    setHelmPreview(null)
    setHelmErrors([])
    setImportSuccess(false)
  }, [])

  const handleHelmPreview = useCallback(() => {
    const errors: string[] = []
    if (!helmRepoUrl.trim()) errors.push(t('workloadImport.helmRepoRequired'))
    if (!helmChartName.trim()) errors.push(t('workloadImport.helmChartRequired'))
    if (!helmReleaseName.trim()) errors.push(t('workloadImport.helmReleaseRequired'))

    if (helmValues.trim() && !isValidYaml(helmValues)) {
      errors.push(t('workloadImport.helmValuesInvalid'))
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
  const handleGithubFieldChange = useCallback(() => {
    setGithubPreview(null)
    setGithubErrors([])
    setImportSuccess(false)
  }, [])

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
  const handleKustomizeFieldChange = useCallback(() => {
    setKustomizePreview(null)
    setKustomizeErrors([])
    setImportSuccess(false)
  }, [])

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

  return {
    t,
    activeTab,
    handleTabChange,
    importSuccess,
    dismissImportSuccess,
    handleClose,
    yaml: {
      text: yamlText,
      preview: yamlPreview,
      errors: yamlErrors,
      onChange: handleYamlChange,
      onPreview: handleYamlPreview,
      onImport: handleYamlImport,
      onFileUpload: handleFileUpload,
    },
    helm: {
      repoUrl: helmRepoUrl,
      setRepoUrl: setHelmRepoUrl,
      chartName: helmChartName,
      setChartName: setHelmChartName,
      releaseName: helmReleaseName,
      setReleaseName: setHelmReleaseName,
      namespace: helmNamespace,
      setNamespace: setHelmNamespace,
      values: helmValues,
      setValues: setHelmValues,
      preview: helmPreview,
      errors: helmErrors,
      onFieldChange: handleHelmFieldChange,
      onPreview: handleHelmPreview,
      onImport: handleHelmImport,
    },
    github: {
      url: githubUrl,
      setUrl: setGithubUrl,
      path: githubPath,
      setPath: setGithubPath,
      preview: githubPreview,
      errors: githubErrors,
      onFieldChange: handleGithubFieldChange,
      onPreview: handleGithubPreview,
      onImport: handleGithubImport,
    },
    kustomize: {
      url: kustomizeUrl,
      setUrl: setKustomizeUrl,
      preview: kustomizePreview,
      errors: kustomizeErrors,
      onFieldChange: handleKustomizeFieldChange,
      onPreview: handleKustomizePreview,
      onImport: handleKustomizeImport,
    },
  }
}
