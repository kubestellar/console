import { Calendar, Loader2 } from 'lucide-react'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import type { GPUNode } from '../../hooks/useMCP'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import { useReservationFormState } from './useReservationFormState'
import { ClusterPicker } from './ClusterPicker'
import { ResourceRequestFields } from './ResourceRequestFields'
import { ScheduleSelector } from './ScheduleSelector'

// GPU cluster info for dropdown
export interface GPUClusterInfo {
  name: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  gpuTypes: string[]
}

export function ReservationFormModal({
  isOpen,
  onClose,
  editingReservation,
  gpuClusters,
  allNodes,
  user,
  prefillDate,
  forceLive,
  knownNamespacesByCluster,
  onSave,
  onActivate,
  onSaved,
  onError }: {
  isOpen: boolean
  onClose: () => void
  editingReservation: GPUReservation | null
  gpuClusters: GPUClusterInfo[]
  allNodes: GPUNode[]
  user: { github_login: string; email?: string } | null
  prefillDate?: string | null
  /** When true, skip demo mode fallback for namespace list */
  forceLive?: boolean
  /**
   * Map of cluster name → namespaces known to have existing reservations.
   * Union'd with the `useNamespaces()` result as a fallback when the fetch
   * tiers don't return them (e.g. user lacks cluster-wide list RBAC and the
   * namespace has no running pods). System namespaces (default, kube-system,
   * kube-*, openshift-*, etc.) are still filtered out of the dropdown
   * regardless of what this prop contains.
   */
  knownNamespacesByCluster?: Record<string, string[]>
  onSave: (input: CreateGPUReservationInput | UpdateGPUReservationInput) => Promise<string | void>
  onActivate: (id: string) => Promise<void>
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const {
    t,
    cluster, setCluster,
    namespace, isNewNamespace, setNsField,
    title, setTitle,
    description, setDescription,
    gpuCount, setGpuCount,
    gpuPreferences, setGpuPreferences,
    startDate, setStartDate,
    durationHours, setDurationHours,
    notes, setNotes,
    enforceQuota,
    extraResources, setExtraResources,
    isSaving,
    error,
    showDiscardConfirm, setShowDiscardConfirm,
    forceClose,
    handleClose,
    handleSave,
    namespacesLoading,
    namespacesError,
    refetchNamespaces,
    clusterNamespaces,
    selectedClusterInfo,
    maxGPUs,
    gpuResourceKey,
    clusterGPUTypes,
    quotaName,
    GPU_KEYS,
  } = useReservationFormState({
    editingReservation,
    gpuClusters,
    allNodes,
    prefillDate,
    forceLive,
    knownNamespacesByCluster,
    onSave,
    onActivate,
    onSaved,
    onError,
    onClose,
  })

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="lg" closeOnBackdrop={false} closeOnEscape={true}>
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={forceClose}
        title={t('common:common.discardUnsavedChanges', 'Discard unsaved changes?')}
        message={t('common:common.discardUnsavedChangesMessage', 'You have unsaved changes that will be lost.')}
        confirmLabel={t('common:common.discard', 'Discard')}
        cancelLabel={t('common:common.keepEditing', 'Keep editing')}
        variant="warning"
      />
      <BaseModal.Header
        title={editingReservation ? t('gpuReservations.form.editTitle') : t('gpuReservations.form.createTitle')}
        icon={Calendar}
        onClose={handleClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[70vh]">
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.titleLabel')}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder={t('gpuReservations.form.fields.titlePlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* User info (read-only from auth) */}
          {user && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.userName')}</label>
                <input type="text" value={user.email || user.github_login} readOnly
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.githubHandle')}</label>
                <input type="text" value={user.github_login} readOnly
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common:common.description')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder={t('gpuReservations.form.fields.descriptionPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          <ClusterPicker
            t={t}
            cluster={cluster}
            setCluster={setCluster}
            namespace={namespace}
            isNewNamespace={isNewNamespace}
            setNsField={setNsField}
            setGpuPreferences={setGpuPreferences}
            gpuClusters={gpuClusters}
            clusterNamespaces={clusterNamespaces}
            editingReservation={editingReservation}
            namespacesLoading={namespacesLoading}
            namespacesError={namespacesError}
            refetchNamespaces={refetchNamespaces}
          />

          <ResourceRequestFields
            t={t}
            gpuCount={gpuCount}
            setGpuCount={setGpuCount}
            maxGPUs={maxGPUs}
            selectedClusterInfo={selectedClusterInfo}
            clusterGPUTypes={clusterGPUTypes}
            gpuPreferences={gpuPreferences}
            setGpuPreferences={setGpuPreferences}
            enforceQuota={enforceQuota}
            extraResources={extraResources}
            setExtraResources={setExtraResources}
            gpuKeys={GPU_KEYS}
          />

          <ScheduleSelector
            t={t}
            startDate={startDate}
            setStartDate={setStartDate}
            durationHours={durationHours}
            setDurationHours={setDurationHours}
          />

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.notesLabel')}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder={t('gpuReservations.form.fields.notesPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* Preview */}
          <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <div className="text-xs font-medium text-purple-400 mb-1">{t('gpuReservations.form.fields.preview')}</div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>{t('gpuReservations.form.fields.previewFields.title')} <span className="text-foreground">{title || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.cluster')} <span className="text-foreground">{cluster || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.namespace')} <span className="text-foreground">{namespace || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.gpus')} <span className="text-foreground">{gpuCount || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.start')} <span className="text-foreground">{startDate || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.duration')} <span className="text-foreground">{durationHours || '24'}h</span></div>
              {enforceQuota && (
                <div>{t('gpuReservations.form.fields.previewFields.k8sQuota')} <span className="text-foreground">{quotaName || '...'} ({gpuResourceKey})</span></div>
              )}
            </div>
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex gap-3">
          {([
            { key: 'cancel', label: t('gpuReservations.form.buttons.cancel'), onClick: handleClose, disabled: false, className: 'px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors' },
            { key: 'save', label: editingReservation ? t('gpuReservations.form.buttons.update') : t('gpuReservations.form.buttons.create'), onClick: handleSave, disabled: isSaving, className: 'flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors' },
          ] as const).map(({ key, label, onClick, disabled, className }) => (
            <button key={key} onClick={onClick} disabled={disabled} className={className}>
              {key === 'save' && isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {label}
            </button>
          ))}
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
