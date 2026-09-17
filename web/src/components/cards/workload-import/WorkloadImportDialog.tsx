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
 *
 * This container composes the `useWorkloadImport` hook with the per-tab
 * presentational components in this directory.
 */
import { Download, FileCode2, Package, FolderGit2, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { Github } from '@/lib/icons'
import { BaseModal } from '../../../lib/modals'
import { Button } from '../../ui/Button'
import type { Workload } from '../WorkloadDeployment'
import { useWorkloadImport } from './useWorkloadImport'
import { WorkloadImportYamlTab } from './WorkloadImportYamlTab'
import { WorkloadImportHelmTab } from './WorkloadImportHelmTab'
import { WorkloadImportGithubTab } from './WorkloadImportGithubTab'
import { WorkloadImportKustomizeTab } from './WorkloadImportKustomizeTab'

export interface WorkloadImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onImport: (workloads: Workload[]) => void
  isDemoData?: boolean
  isLoading?: boolean
}

export function WorkloadImportDialog({
  isOpen,
  onClose,
  onImport,
  isDemoData = false,
  isLoading = false,
}: WorkloadImportDialogProps) {
  const {
    t,
    activeTab,
    handleTabChange,
    importSuccess,
    dismissImportSuccess,
    handleClose,
    yaml,
    helm,
    github,
    kustomize,
  } = useWorkloadImport({ onImport, onClose })

  const tabs = [
    { id: 'yaml' as const, label: t('workloadImport.tabYaml'), icon: FileCode2 },
    { id: 'helm' as const, label: t('workloadImport.tabHelm'), icon: Package },
    { id: 'github' as const, label: t('workloadImport.tabGithub'), icon: Github },
    { id: 'kustomize' as const, label: t('workloadImport.tabKustomize'), icon: FolderGit2 },
  ]

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'yaml':
        return (
          <WorkloadImportYamlTab
            {...yaml}
            importSuccess={importSuccess}
            isDemoData={isDemoData}
            isLoading={isLoading}
          />
        )
      case 'helm':
        return (
          <WorkloadImportHelmTab
            {...helm}
            importSuccess={importSuccess}
            isDemoData={isDemoData}
            isLoading={isLoading}
          />
        )
      case 'github':
        return (
          <WorkloadImportGithubTab
            {...github}
            importSuccess={importSuccess}
            isDemoData={isDemoData}
            isLoading={isLoading}
          />
        )
      case 'kustomize':
        return (
          <WorkloadImportKustomizeTab
            {...kustomize}
            importSuccess={importSuccess}
            isDemoData={isDemoData}
            isLoading={isLoading}
          />
        )
      default:
        return null
    }
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      enableBackspace={false}
      closeOnBackdrop={false}
      closeOnEscape={true}
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
        onTabChange={handleTabChange}
      />

      <BaseModal.Content className="min-h-[520px]">
        {isDemoData && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20" data-testid="demo-warning-banner">
            <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
            <span className="text-sm text-yellow-400">
              {t('workloadImport.demoModeWarning', {
                defaultValue: 'Demo Mode: Workload import is simulated or disabled.',
              })}
            </span>
          </div>
        )}
        {importSuccess && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span className="text-sm text-green-400">{t('workloadImport.importSuccess')}</span>
            <button
              className="ml-auto p-0.5 rounded hover:bg-green-500/20 text-green-400"
              onClick={dismissImportSuccess}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {renderActiveTab()}
      </BaseModal.Content>

      <BaseModal.Footer>
        {importSuccess && (
          <div className="flex-1 flex justify-end">
            <Button
              variant="primary"
              size="md"
              onClick={handleClose}
            >
              {t('workloadImport.done')}
            </Button>
          </div>
        )}
      </BaseModal.Footer>
    </BaseModal>
  )
}
