import { Calendar, Plus, Settings2, TrendingUp, FlaskConical, Trash2, Loader2, Server, User, Filter, LayoutDashboard } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { cn } from '../../lib/cn'
import { Input } from '../ui/Input'
import { StatusBadge } from '../ui/StatusBadge'
import { AddCardModal } from '../dashboard/AddCardModal'
import { ReservationFormModal, type GPUClusterInfo } from './ReservationFormModal'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import type { GPUNode } from '../../hooks/useMCP'
import type { ViewTab, TranslateFn } from './useGPUReservationsState'

export interface GPUReservationsHeaderProps {
  t: TranslateFn
  effectiveDemoMode: boolean
}

export function GPUReservationsHeader({ t, effectiveDemoMode }: GPUReservationsHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">{t('gpuReservations.title')}</h1>
        {effectiveDemoMode && (
          <StatusBadge color="yellow" variant="outline" rounded="full" icon={<FlaskConical className="w-3 h-3" />}>
            {t('gpuReservations.demo')}
          </StatusBadge>
        )}
      </div>
      <div className="text-muted-foreground">{t('gpuReservations.subtitle')}</div>
    </div>
  )
}

export interface GPUReservationsTabBarProps {
  t: TranslateFn
  activeTab: ViewTab
  setActiveTab: (tab: ViewTab) => void
  filteredReservationsCount: number
  user: { github_login?: string } | null
  showOnlyMine: boolean
  toggleShowOnlyMine: () => void
  openCreateForm: () => void
}

const TAB_ORDER = ['overview', 'calendar', 'quotas', 'inventory', 'dashboard'] as const

export function GPUReservationsTabBar({
  t,
  activeTab,
  setActiveTab,
  filteredReservationsCount,
  user,
  showOnlyMine,
  toggleShowOnlyMine,
  openCreateForm,
}: GPUReservationsTabBarProps) {
  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-1 mb-6 border-b border-border"
      onKeyDown={(e) => {
        const idx = TAB_ORDER.indexOf(activeTab)
        if (e.key === 'ArrowRight') setActiveTab(TAB_ORDER[Math.min(idx + 1, TAB_ORDER.length - 1)])
        else if (e.key === 'ArrowLeft') setActiveTab(TAB_ORDER[Math.max(idx - 1, 0)])
      }}
    >
      {[
        { id: 'overview' as const, label: t('gpuReservations.tabs.overview'), icon: TrendingUp },
        { id: 'calendar' as const, label: t('gpuReservations.tabs.calendar'), icon: Calendar },
        { id: 'quotas' as const, label: t('gpuReservations.tabs.reservations'), icon: Settings2, count: filteredReservationsCount },
        { id: 'inventory' as const, label: t('gpuReservations.tabs.inventory'), icon: Server },
        { id: 'dashboard' as const, label: t('gpuReservations.tabs.dashboard'), icon: LayoutDashboard },
      ].map(tab => {
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 mb-[-2px] transition-colors',
              activeTab === tab.id
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <StatusBadge color="purple" rounded="full">
                {tab.count}
              </StatusBadge>
            )}
          </button>
        )
      })}

      <div className="ml-auto pb-2 flex flex-wrap items-center gap-3">
        {/* My Reservations filter */}
        {user && (
          <label
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border cursor-pointer',
              showOnlyMine
                ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            <Input
              type="checkbox"
              checked={showOnlyMine}
              onChange={toggleShowOnlyMine}
              className="sr-only"
            />
            {showOnlyMine ? <User className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
            {t('gpuReservations.myReservations')}
          </label>
        )}
        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('gpuReservations.createReservation')}
        </button>
      </div>
    </div>
  )
}

export interface GPUReservationsModalsProps {
  t: TranslateFn
  showAddCardModal: boolean
  closeAddCardModal: () => void
  handleAddDashboardCards: (suggestions: Array<{ type: string; title: string; visualization: string; config: Record<string, unknown> }>) => void
  dashboardCardTypes: string[]
  showReservationForm: boolean
  closeReservationForm: () => void
  editingReservation: GPUReservation | null
  gpuClusters: GPUClusterInfo[]
  rawNodes: GPUNode[] | null | undefined
  user: { github_login?: string } | null
  prefillDate: string | null
  gpuLiveMode: boolean
  knownNamespacesByCluster: Record<string, string[]>
  apiCreateReservation: (input: CreateGPUReservationInput) => Promise<GPUReservation>
  apiUpdateReservation: (id: string, input: UpdateGPUReservationInput) => Promise<GPUReservation>
  showToast: (msg: string, type: 'success' | 'error') => void
  deleteConfirmId: string | null
  setDeleteConfirmId: (id: string | null) => void
  deleteConfirmReservation: GPUReservation | null | undefined
  handleDeleteReservation: () => void
  isDeleting: boolean
}

export function GPUReservationsModals({
  t,
  showAddCardModal,
  closeAddCardModal,
  handleAddDashboardCards,
  dashboardCardTypes,
  showReservationForm,
  closeReservationForm,
  editingReservation,
  gpuClusters,
  rawNodes,
  user,
  prefillDate,
  gpuLiveMode,
  knownNamespacesByCluster,
  apiCreateReservation,
  apiUpdateReservation,
  showToast,
  deleteConfirmId,
  setDeleteConfirmId,
  deleteConfirmReservation,
  handleDeleteReservation,
  isDeleting,
}: GPUReservationsModalsProps) {
  return (
    <>
      {/* Add Card Modal */}
      <AddCardModal
        isOpen={showAddCardModal}
        onClose={closeAddCardModal}
        onAddCards={(suggestions) => { handleAddDashboardCards(suggestions); closeAddCardModal() }}
        existingCardTypes={dashboardCardTypes}
      />

      {/* Create/Edit Reservation Modal */}
      <ReservationFormModal
        isOpen={showReservationForm}
        onClose={closeReservationForm}
        editingReservation={editingReservation}
        gpuClusters={gpuClusters}
        allNodes={rawNodes}
        user={user}
        prefillDate={prefillDate}
        forceLive={gpuLiveMode}
        knownNamespacesByCluster={knownNamespacesByCluster}
        onSave={async (input) => {
          if (editingReservation) {
            await apiUpdateReservation(editingReservation.id, input as UpdateGPUReservationInput)
            return editingReservation.id
          } else {
            const created = await apiCreateReservation(input as CreateGPUReservationInput)
            return created.id
          }
        }}
        onActivate={async (id) => { await apiUpdateReservation(id, { status: 'active' }) }}
        onSaved={() => showToast(t('gpuReservations.form.success.saved'), 'success')}
        onError={(msg) => showToast(msg, 'error')}
      />

      {/* Delete Confirmation */}
      <BaseModal isOpen={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} size="sm" closeOnBackdrop={false} closeOnEscape={true}>
        <BaseModal.Header title={t('gpuReservations.delete.title')} icon={Trash2} onClose={() => setDeleteConfirmId(null)} showBack={false} />
        <BaseModal.Content>
          <div className="text-muted-foreground">
            {t('gpuReservations.delete.confirmMessage')} <strong className="text-foreground">{deleteConfirmReservation?.title}</strong>?
          </div>
          <div className="text-sm text-red-400 mt-2">
            {t('gpuReservations.delete.cannotUndo')}
          </div>
        </BaseModal.Content>
        <BaseModal.Footer>
          <div className="flex-1" />
          <div className="flex gap-3">
            {([
              { key: 'cancel', label: t('gpuReservations.delete.cancel'), onClick: () => setDeleteConfirmId(null), disabled: false, className: 'px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors' },
              { key: 'delete', label: t('gpuReservations.delete.delete'), onClick: handleDeleteReservation, disabled: isDeleting, className: 'flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors' },
            ] as const).map(({ key, label, onClick, disabled, className }) => (
              <button key={key} onClick={onClick} disabled={disabled} className={className}>
                {key === 'delete' && isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                {label}
              </button>
            ))}
          </div>
        </BaseModal.Footer>
      </BaseModal>
    </>
  )
}
