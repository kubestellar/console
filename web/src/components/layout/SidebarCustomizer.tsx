import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { LayoutDashboard } from 'lucide-react'
import { useSidebarConfig, type SidebarConfig, type SidebarItem } from '../../hooks/useSidebarConfig'
import { useDashboards } from '../../hooks/useDashboards'
import type { DashboardTemplate } from '../dashboard/templates'
import { CreateDashboardModal } from '../dashboard/CreateDashboardModal'
import { getCustomDashboardRoute } from '../../config/routes'
import { STORAGE_KEY_NAV_HISTORY } from '../../lib/constants'
import { NAV_AFTER_ANIMATION_MS } from '../../lib/constants/network'
import { suggestDashboardIcon, suggestIconSync } from '../../lib/iconSuggester'
import { BaseModal, useModalState } from '../../lib/modals'
import {
  AUTO_DISMISS_APPLIED_MS,
  AUTO_DISMISS_MS,
  DND_ACTIVATION_DISTANCE,
  LOCAL_DASHBOARD_ID_PREFIX,
  MAX_PREVIEW_ROUTES,
} from './sidebar-customizer/constants'
import { buildKnownRoutes } from './sidebar-customizer/knownRoutes'
import { ClusterStatusPanel } from './sidebar-customizer/ClusterStatusPanel'
import { GenerationActionButtons } from './sidebar-customizer/GenerationActionButtons'
import { GenerationResultBanner } from './sidebar-customizer/GenerationResultBanner'
import { PendingChangesPanel } from './sidebar-customizer/PendingChangesPanel'
import { RouteSearchPanel } from './sidebar-customizer/RouteSearchPanel'
import { renderIcon } from './sidebar-customizer/renderIcon'
import { SidebarItemsPanel } from './sidebar-customizer/SidebarItemsPanel'
import { SortableItem } from './sidebar-customizer/SortableItem'

const createLocalDashboardId = () => `${LOCAL_DASHBOARD_ID_PREFIX}${crypto.randomUUID()}`

interface SidebarCustomizerProps {
  isOpen: boolean
  onClose: () => void
  embedded?: boolean
}

type GenerationResultType = 'success' | 'warning' | null

type PendingChanges = {
  proposed: SidebarConfig
  changes: string[]
}

export function SidebarCustomizer({ isOpen, onClose, embedded = false }: SidebarCustomizerProps) {
  const { t } = useTranslation(['common', 'cards'])
  const navigate = useNavigate()
  const {
    config,
    addItem,
    removeItem,
    updateItem,
    reorderItems,
    toggleClusterStatus,
    resetToDefault,
    generateFromBehavior: _generateFromBehavior,
    previewGenerateFromBehavior,
    applyGeneratedConfig,
  } = useSidebarConfig()
  const { createDashboard, dashboards } = useDashboards()
  const { isOpen: isCreateDashboardOpen, close: closeCreateDashboard } = useModalState()
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationResult, setGenerationResult] = useState<string | null>(null)
  const [generationResultType, setGenerationResultType] = useState<GenerationResultType>(null)
  const [routeSearch, setRouteSearch] = useState('')
  const [pendingChanges, setPendingChanges] = useState<PendingChanges | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DND_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const knownRoutes = useMemo(() => buildKnownRoutes(t as (key: string) => string), [t])
  const availableRoutes = useMemo(() => {
    const configuredRoutes = new Set([...config.primaryNav, ...config.secondaryNav].map((item) => item.href))
    return knownRoutes.filter((route) => !configuredRoutes.has(route.href))
  }, [config.primaryNav, config.secondaryNav, knownRoutes])

  useEffect(() => () => dismissTimerRef.current && clearTimeout(dismissTimerRef.current), [])

  const setGenerationFeedback = (message: string, type: Exclude<GenerationResultType, null>, timeout: number) => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
    }

    setGenerationResult(message)
    setGenerationResultType(type)
    dismissTimerRef.current = setTimeout(() => {
      setGenerationResult(null)
      setGenerationResultType(null)
    }, timeout)
  }

  const handleDragEnd = (event: DragEndEvent, items: SidebarItem[], target: 'primary' | 'secondary') => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)

    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(items, oldIndex, newIndex).map((item, index) => ({ ...item, order: index }))
      reorderItems(reordered, target)
    }
  }

  const handleGenerateFromBehavior = async () => {
    setIsGenerating(true)
    setGenerationResult(null)
    setGenerationResultType(null)
    setPendingChanges(null)
    await new Promise((resolve) => setTimeout(resolve, NAV_AFTER_ANIMATION_MS))

    let navHistory: string[] = []
    try {
      navHistory = JSON.parse(localStorage.getItem(STORAGE_KEY_NAV_HISTORY) || '[]')
    } catch {
      navHistory = []
    }

    const visitCounts: Record<string, number> = {}
    navHistory.forEach((path) => {
      visitCounts[path] = (visitCounts[path] || 0) + 1
    })

    const sortedPaths = Object.entries(visitCounts)
      .sort(([, left], [, right]) => right - left)
      .slice(0, MAX_PREVIEW_ROUTES)
      .map(([path]) => path)

    if (sortedPaths.length === 0) {
      setGenerationFeedback(t('sidebar.customizer.notEnoughData'), 'warning', AUTO_DISMISS_MS)
      setIsGenerating(false)
      return
    }

    const preview = previewGenerateFromBehavior(sortedPaths)
    if (preview.changes.length === 1 && preview.changes[0] === 'No changes needed') {
      setGenerationFeedback(t('sidebar.customizer.noChangesNeeded'), 'warning', AUTO_DISMISS_MS)
    } else {
      setPendingChanges(preview)
    }
    setIsGenerating(false)
  }

  const handleApplyPendingChanges = () => {
    if (!pendingChanges) return
    applyGeneratedConfig(pendingChanges.proposed)
    setPendingChanges(null)
    setGenerationFeedback(
      t('sidebar.customizer.appliedChanges', { count: pendingChanges.changes.length }),
      'success',
      AUTO_DISMISS_APPLIED_MS
    )
  }

  const handleCreateDashboard = async (name: string, _template?: DashboardTemplate, description?: string) => {
    let href = getCustomDashboardRoute(createLocalDashboardId())
    const quickIcon = suggestIconSync(name)

    try {
      const createdDashboard = await createDashboard(name)
      href = getCustomDashboardRoute(createdDashboard.id)
    } catch (error: unknown) {
      console.error('[SidebarCustomizer] backend create failed, falling back to local dashboard:', error)
    }

    addItem({ name, icon: quickIcon, href, type: 'link', description }, 'primary')
    closeCreateDashboard()
    onClose()
    navigate(href)

    suggestDashboardIcon(name)
      .then((aiIcon) => {
        if (!aiIcon || aiIcon === quickIcon) return
        const item = [...config.primaryNav, ...config.secondaryNav].find(
          (sidebarItem) => sidebarItem.href === href && sidebarItem.isCustom
        )
        if (item) updateItem(item.id, { icon: aiIcon })
      })
      .catch(() => {})
  }

  const renderItemList = (items: SidebarItem[], target: 'primary' | 'secondary') => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => handleDragEnd(event, items, target)}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {items.map((item) => (
            <SortableItem key={item.id} item={item} onRemove={removeItem} renderIcon={renderIcon} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )

  const sidebarContent = (
    <>
      <RouteSearchPanel
        availableRoutes={availableRoutes}
        routeSearch={routeSearch}
        onSearchChange={setRouteSearch}
        onAdd={(route) => addItem({ name: route.name, icon: route.icon, href: route.href, type: 'link' }, 'primary')}
        renderIcon={renderIcon}
      />
      <GenerationActionButtons isGenerating={isGenerating} onGenerate={handleGenerateFromBehavior} onReset={resetToDefault} />
      {pendingChanges && (
        <PendingChangesPanel pendingChanges={pendingChanges.changes} onApply={handleApplyPendingChanges} onReject={() => setPendingChanges(null)} />
      )}
      {generationResult && !pendingChanges && generationResultType && (
        <GenerationResultBanner message={generationResult} type={generationResultType} />
      )}
      <SidebarItemsPanel primaryNav={config.primaryNav} secondaryNav={config.secondaryNav} renderItemList={renderItemList} />
      <ClusterStatusPanel showClusterStatus={config.showClusterStatus} onToggle={toggleClusterStatus} />
    </>
  )

  const createDashboardModal = (
    <CreateDashboardModal
      isOpen={isCreateDashboardOpen}
      onClose={closeCreateDashboard}
      onCreate={handleCreateDashboard}
      existingNames={dashboards.map((dashboard) => dashboard.name)}
    />
  )

  if (embedded) {
    return (
      <>
        <div className="overflow-y-auto flex-1 p-4">{sidebarContent}</div>
        {createDashboardModal}
      </>
    )
  }

  return (
    <>
      <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
        <BaseModal.Header
          title={t('sidebar.customizer.title')}
          description={t('sidebar.customizer.description')}
          icon={LayoutDashboard}
          onClose={onClose}
          showBack={false}
        />
        <BaseModal.Content className="max-h-[60vh]">{sidebarContent}</BaseModal.Content>
        <BaseModal.Footer>
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600">
            {t('common.close')}
          </button>
        </BaseModal.Footer>
      </BaseModal>
      {createDashboardModal}
    </>
  )
}
