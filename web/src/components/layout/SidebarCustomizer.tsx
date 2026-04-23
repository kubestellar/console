import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  Trash2,
  GripVertical,
  RotateCcw,
  Sparkles,
  Eye,
  EyeOff,
  Loader2,
  LayoutDashboard,
  Search,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSidebarConfig, SidebarItem } from '../../hooks/useSidebarConfig'
import { useDashboards } from '../../hooks/useDashboards'
import { DashboardTemplate } from '../dashboard/templates'
import { CreateDashboardModal } from '../dashboard/CreateDashboardModal'
// StatusBadge and Button removed — no longer needed after Dashboards section cleanup

/** Auto-dismiss delay for generation result messages */
const AUTO_DISMISS_MS = 5000
/** Shorter dismiss for "applied" confirmations */
const AUTO_DISMISS_APPLIED_MS = 3000
import { cn } from '../../lib/cn'
// formatCardTitle removed — no longer needed
import { STORAGE_KEY_NAV_HISTORY } from '../../lib/constants'
import { NAV_AFTER_ANIMATION_MS } from '../../lib/constants/network'
import { suggestDashboardIcon, suggestIconSync } from '../../lib/iconSuggester'
import { BaseModal, useModalState } from '../../lib/modals'
import { iconRegistry } from '../../lib/icons'

// Sortable sidebar item component
interface SortableItemProps {
  item: SidebarItem
  onRemove: (id: string) => void
  renderIcon: (iconName: string, className?: string) => React.ReactNode
}

function SortableItem({ item, onRemove, renderIcon }: SortableItemProps) {
  const { t } = useTranslation(['common', 'cards'])
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg bg-secondary/30 cursor-grab active:cursor-grabbing touch-none',
        item.isCustom && 'border border-purple-500/20',
        isDragging && 'shadow-lg'
      )}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
      {renderIcon(item.icon, 'w-4 h-4 text-muted-foreground')}
      <span className="text-sm text-foreground">{item.name}</span>
      <span className="text-xs text-muted-foreground/50">{item.href}</span>
      <span className="flex-1" />
      {/* Allow removing any item except the main Dashboard (/) */}
      {item.href !== '/' && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(item.id) }}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
          title={t('sidebar.removeFromSidebar')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// Known routes with descriptions
interface KnownRoute {
  href: string
  name: string
  description: string
  icon: string
  category: string
}

const KNOWN_ROUTES: KnownRoute[] = [
  // Core Dashboards
  { href: '/', name: 'Main Dashboard', description: 'Customizable overview with cluster health, workloads, and events', icon: 'LayoutDashboard', category: 'Core Dashboards' },
  { href: '/clusters', name: 'My Clusters', description: 'Detailed cluster management, health monitoring, and node status', icon: 'Server', category: 'Core Dashboards' },
  { href: '/workloads', name: 'Workloads', description: 'Deployments, pods, services, and application status across clusters', icon: 'Box', category: 'Core Dashboards' },
  { href: '/compute', name: 'Compute', description: 'CPU, memory, and GPU resource utilization and capacity', icon: 'Cpu', category: 'Core Dashboards' },
  { href: '/events', name: 'Events', description: 'Real-time cluster events, warnings, and audit logs', icon: 'Activity', category: 'Core Dashboards' },
  { href: '/security', name: 'Security', description: 'Security policies, RBAC, vulnerabilities, and compliance', icon: 'Shield', category: 'Core Dashboards' },
  { href: '/gitops', name: 'GitOps', description: 'ArgoCD, Flux, Helm releases, and deployment drift detection', icon: 'GitBranch', category: 'Core Dashboards' },
  { href: '/alerts', name: 'Alerts', description: 'Active alerts, rule management, and AI-powered diagnostics', icon: 'Bell', category: 'Core Dashboards' },
  { href: '/cost', name: 'Cost Management', description: 'Resource costs, allocation tracking, and optimization recommendations', icon: 'DollarSign', category: 'Core Dashboards' },
  { href: '/security-posture', name: 'Security Posture', description: 'Security scanning, vulnerability assessment, and policy enforcement', icon: 'ShieldCheck', category: 'Core Dashboards' },
  { href: '/data-compliance', name: 'Data Compliance', description: 'GDPR, HIPAA, PCI-DSS, and SOC 2 data protection compliance', icon: 'Database', category: 'Core Dashboards' },
  { href: '/gpu-reservations', name: 'GPU Reservations', description: 'Schedule and manage GPU reservations with calendar and quota management', icon: 'Zap', category: 'Core Dashboards' },
  { href: '/storage', name: 'Storage', description: 'PVCs, storage classes, and capacity management', icon: 'HardDrive', category: 'Core Dashboards' },
  { href: '/network', name: 'Network', description: 'Network policies, ingress, and service mesh configuration', icon: 'Network', category: 'Core Dashboards' },
  { href: '/arcade', name: 'Arcade', description: 'Kubernetes-themed arcade games for taking a break', icon: 'Gamepad2', category: 'Core Dashboards' },
  { href: '/deploy', name: 'KubeStellar Deploy', description: 'Deployment monitoring, GitOps, Helm releases, and ArgoCD', icon: 'Rocket', category: 'Core Dashboards' },
  { href: '/ai-ml', name: 'AI/ML', description: 'AI and machine learning workloads, GPU utilization, and model serving', icon: 'Brain', category: 'Core Dashboards' },
  { href: '/ci-cd', name: 'CI/CD', description: 'Continuous integration and deployment pipelines, Prow jobs, and GitHub workflows', icon: 'GitPullRequest', category: 'Core Dashboards' },
  { href: '/ai-agents', name: 'AI Agents', description: 'Kagenti agent platform — deploy, secure, and manage AI agents across clusters', icon: 'Bot', category: 'Core Dashboards' },
  { href: '/llm-d-benchmarks', name: 'llm-d Benchmarks', description: 'LLM inference benchmarks — throughput, latency, and GPU utilization across clouds and accelerators', icon: 'TrendingUp', category: 'Core Dashboards' },
  { href: '/compliance', name: 'Sec. Compliance', description: 'Security compliance, regulatory audits, and policy enforcement', icon: 'ClipboardCheck', category: 'Core Dashboards' },
  { href: '/enterprise', name: 'Enterprise', description: 'Unified GRC portal — FinTech, Healthcare, Government, SecOps, Supply Chain', icon: 'Building2', category: 'Core Dashboards' },
  { href: '/karmada-ops', name: 'Karmada Ops', description: 'Multi-cluster orchestration, AI inference, and data platform operations', icon: 'Globe', category: 'Core Dashboards' },
  { href: '/cluster-admin', name: 'Cluster Admin', description: 'Multi-cluster operations, control plane health, node debugging, and infrastructure management', icon: 'ShieldAlert', category: 'Core Dashboards' },
  { href: '/multi-tenancy', name: 'Multi-Tenancy', description: 'Tenant isolation with OVN-Kubernetes, KubeFlex, K3s, and KubeVirt', icon: 'Users', category: 'Core Dashboards' },
  { href: '/drasi', name: 'Drasi', description: 'Reactive data pipelines — sources, continuous queries, reactions, and live results', icon: 'GitBranch', category: 'Core Dashboards' },
  // Resource Pages
  { href: '/namespaces', name: 'Namespaces', description: 'Namespace management and resource allocation', icon: 'FolderTree', category: 'Resources' },
  { href: '/nodes', name: 'Nodes', description: 'Cluster node health and resource usage', icon: 'HardDrive', category: 'Resources' },
  { href: '/pods', name: 'Pods', description: 'Pod status and container details', icon: 'Package', category: 'Resources' },
  { href: '/deployments', name: 'Deployments', description: 'Deployment management and scaling', icon: 'Rocket', category: 'Resources' },
  { href: '/services', name: 'Services', description: 'Service discovery and networking', icon: 'Network', category: 'Resources' },
  // Operations
  { href: '/operators', name: 'Operators', description: 'OLM operators and subscriptions management', icon: 'Cog', category: 'Operations' },
  { href: '/helm', name: 'Helm Releases', description: 'Helm chart releases and versions', icon: 'Ship', category: 'Operations' },
  { href: '/logs', name: 'Logs', description: 'Aggregated container and cluster logs', icon: 'FileText', category: 'Operations' },
  // Settings
  { href: '/settings', name: 'Settings', description: 'Console configuration and preferences', icon: 'Settings', category: 'Settings' },
  { href: '/users', name: 'Users', description: 'User management and access control', icon: 'Users', category: 'Settings' },
]

// Group routes by category
// ROUTE_CATEGORIES removed — search-to-add replaces category browsing

// formatCardType removed — no longer needed after section cleanup

interface SidebarCustomizerProps {
  isOpen: boolean
  onClose: () => void
  /** When true, renders content inline without a BaseModal wrapper (used by DashboardCustomizer) */
  embedded?: boolean
}

export function SidebarCustomizer({ isOpen, onClose, embedded = false }: SidebarCustomizerProps) {
  const { t } = useTranslation(['common', 'cards'])
  const navigate = useNavigate()
  const {
    config,
    addItem,
    addItems,
    removeItem,
    updateItem,
    reorderItems,
    toggleClusterStatus,
    resetToDefault,
    // generateFromBehavior not used — replaced by preview/confirm flow
    generateFromBehavior: _generateFromBehavior,
    previewGenerateFromBehavior,
    applyGeneratedConfig,
  } = useSidebarConfig()

  // DnD sensors for both mouse and keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Handle drag end for reordering
  const handleDragEnd = (event: DragEndEvent, items: SidebarItem[], target: 'primary' | 'secondary') => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex(item => item.id === active.id)
    const newIndex = items.findIndex(item => item.id === over.id)

    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({
        ...item,
        order: idx,
      }))
      reorderItems(reordered, target)
    }
  }

  const { createDashboard, dashboards } = useDashboards()

  const [isGenerating, setIsGenerating] = useState(false)
  const { isOpen: isCreateDashboardOpen, close: closeCreateDashboard } = useModalState()
  const [generationResult, setGenerationResult] = useState<string | null>(null)
  const [newItemTarget, setNewItemTarget] = useState<'primary' | 'secondary'>('primary')
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedKnownRoutes, setSelectedKnownRoutes] = useState<Set<string>>(new Set())
  const [routeSearch, setRouteSearch] = useState('')
  // expandedSection removed — all sections now always visible
  // Dashboard cards section removed — cards are managed via Console Studio's Cards tab

  // Handle adding all selected routes
  const handleAddSelectedRoutes = () => {
    if (selectedKnownRoutes.size === 0) return

    // Collect all items to add in a single batch to avoid React state batching issues
    const itemsToAdd: Array<{ item: { name: string; icon: string; href: string; type: 'link' }, target: 'primary' | 'secondary' }> = []

    selectedKnownRoutes.forEach(routeHref => {
      const route = KNOWN_ROUTES.find(r => r.href === routeHref)
      if (route) {
        itemsToAdd.push({
          item: {
            name: route.name,
            icon: route.icon,
            href: route.href,
            type: 'link',
          },
          target: newItemTarget,
        })
      }
    })

    // Add all items at once
    if (itemsToAdd.length > 0) {
      addItems(itemsToAdd)
    }

    setSelectedKnownRoutes(new Set())
    setShowAddForm(false)
  }

  // toggleKnownRoute removed — search-to-add replaces checkbox selection

  // Preview state for generate-from-behavior
  const [pendingChanges, setPendingChanges] = useState<{ proposed: ReturnType<typeof previewGenerateFromBehavior>['proposed']; changes: string[] } | null>(null)

  // Timer ref for auto-dismiss — prevents memory leak on unmount
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current) }, [])

  const handleGenerateFromBehavior = async () => {
    setIsGenerating(true)
    setGenerationResult(null)
    setPendingChanges(null)

    await new Promise(resolve => setTimeout(resolve, NAV_AFTER_ANIMATION_MS))

    let navHistory: string[] = []
    try {
      navHistory = JSON.parse(localStorage.getItem(STORAGE_KEY_NAV_HISTORY) || '[]')
    } catch { /* corrupted */ }

    const visitCounts: Record<string, number> = {}
    navHistory.forEach((path: string) => {
      visitCounts[path] = (visitCounts[path] || 0) + 1
    })

    const sortedPaths = Object.entries(visitCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([path]) => path)

    if (sortedPaths.length > 0) {
      const preview = previewGenerateFromBehavior(sortedPaths)
      if (preview.changes.length === 1 && preview.changes[0] === 'No changes needed') {
        setGenerationResult('No changes needed — your sidebar already matches your usage.')
        dismissTimerRef.current = setTimeout(() => setGenerationResult(null), AUTO_DISMISS_MS)
      } else {
        setPendingChanges(preview)
      }
    } else {
      setGenerationResult(t('sidebar.customizer.notEnoughData'))
      const AUTO_DISMISS_MS = 5000
      dismissTimerRef.current = setTimeout(() => setGenerationResult(null), AUTO_DISMISS_MS)
    }

    setIsGenerating(false)
  }

  const handleApplyPendingChanges = () => {
    if (pendingChanges) {
      applyGeneratedConfig(pendingChanges.proposed)
      setGenerationResult(`Applied ${pendingChanges.changes.length} changes`)
      setPendingChanges(null)
      dismissTimerRef.current = setTimeout(() => setGenerationResult(null), AUTO_DISMISS_APPLIED_MS)
    }
  }

  const handleRejectPendingChanges = () => {
    setPendingChanges(null)
  }

  // Handle creating a new custom dashboard
  const handleCreateDashboard = (name: string, _template?: DashboardTemplate, description?: string) => {
    // Generate a local ID so we don't depend on the backend API
    const localId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const href = `/custom-dashboard/${localId}`

    // Use keyword-based icon immediately, then upgrade via AI
    const quickIcon = suggestIconSync(name)

    // Add sidebar item, close modals, and navigate — all synchronous
    addItem({
      name: name,
      icon: quickIcon,
      href,
      type: 'link',
      description,
    }, 'primary')

    closeCreateDashboard()
    onClose()
    navigate(href)

    // Try to persist to backend in the background (optional, may fail offline)
    createDashboard(name).catch(() => {
      // Dashboard works purely from localStorage — backend persistence is optional
    })

    // Ask AI agent for a better icon in the background
    suggestDashboardIcon(name).then((aiIcon) => {
      if (aiIcon && aiIcon !== quickIcon) {
        const items = [...config.primaryNav, ...config.secondaryNav]
        const item = items.find(i => i.href === href && i.isCustom)
        if (item) {
          updateItem(item.id, { icon: aiIcon })
        }
      }
    }).catch(() => { /* suggestDashboardIcon always resolves — defensive catch */ })
  }

  const renderIcon = (iconName: string, className?: string) => {
    const IconComponent = iconRegistry[iconName] as React.ComponentType<{ className?: string }> | undefined
    return IconComponent ? <IconComponent className={className} /> : null
  }

  const renderItemList = (items: SidebarItem[], target: 'primary' | 'secondary') => (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => handleDragEnd(event, items, target)}
    >
      <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              onRemove={removeItem}
              renderIcon={renderIcon}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )

  // Shared content rendered in both modal and embedded modes
  const sidebarContent = (
    <>
          {/* Search to add dashboards — always visible */}
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">
              Search for a dashboard to add to your sidebar
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={routeSearch}
                onChange={(e) => setRouteSearch(e.target.value)}
                placeholder="Search dashboards..."
                className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
          </div>

          {/* Available dashboards — always visible, filtered by search */}
          {(() => {
            const searchLower = routeSearch.toLowerCase()
            const availableRoutes = KNOWN_ROUTES.filter(r =>
              !config.primaryNav.some(item => item.href === r.href) &&
              !config.secondaryNav.some(item => item.href === r.href)
            )
            const matchingRoutes = searchLower
              ? availableRoutes.filter(r =>
                  r.name.toLowerCase().includes(searchLower) ||
                  r.description.toLowerCase().includes(searchLower)
                )
              : availableRoutes
            if (availableRoutes.length === 0) return null
            if (matchingRoutes.length === 0) {
              return <div className="mb-4 text-sm text-muted-foreground text-center py-2">No matching dashboards found</div>
            }
            return (
              <div className="mb-4">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Available to Add ({matchingRoutes.length})
                </h3>
                <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-border">
                  {matchingRoutes.map(route => (
                    <button
                      key={route.href}
                      onClick={() => {
                        addItem({ name: route.name, icon: route.icon, href: route.href, type: 'link' }, 'primary')
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50 transition-colors"
                    >
                      {renderIcon(route.icon, 'w-4 h-4 text-muted-foreground')}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">{route.name}</span>
                        <span className="text-xs text-muted-foreground/50 ml-1.5">{route.description}</span>
                      </div>
                      <Plus className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Action buttons */}
          {/* Create Custom Dashboard moved to Console Studio nav */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={handleGenerateFromBehavior}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors text-sm font-medium disabled:opacity-50"
              title="Reorders your dashboards by most visited and adds any missing ones you use frequently"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGenerating ? 'Analyzing...' : 'Auto-organize'}
            </button>
            <button
              onClick={resetToDefault}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Restore the default sidebar navigation items"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Sidebar
            </button>
          </div>

          {/* Pending changes preview — approve/reject before applying */}
          {pendingChanges && (
            <div className="mb-4 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
              <p className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-2">Proposed Changes</p>
              <ul className="space-y-1 mb-3">
                {pendingChanges.changes.map((change, i) => (
                  <li key={i} className="text-xs text-foreground">{change}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button onClick={handleApplyPendingChanges} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg text-xs font-medium transition-colors">
                  Apply Changes
                </button>
                <button onClick={handleRejectPendingChanges} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Generation Result (after applying or for errors) */}
          {generationResult && !pendingChanges && (
            <div className={cn(
              'mb-4 p-3 rounded-lg text-sm',
              generationResult.includes('Not enough') || generationResult.includes('No changes')
                ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-300'
                : 'bg-green-500/10 border border-green-500/20 text-green-300'
            )}>
              {generationResult}
            </div>
          )}

          {/* Your Dashboards — flat list, always visible */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-foreground mb-2">Your Dashboards ({config.primaryNav.length + config.secondaryNav.length})</h3>
            {renderItemList(config.primaryNav, 'primary')}
            {config.secondaryNav.length > 0 && (
              <>
                <div className="my-2 border-t border-border/30" />
                {renderItemList(config.secondaryNav, 'secondary')}
              </>
            )}
          </div>

          {/* Cluster Status Toggle */}
          <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-foreground">{t('sidebar.customizer.clusterStatusPanel')}</h3>
                <p className="text-xs text-muted-foreground">{t('sidebar.customizer.showClusterHealth')}</p>
              </div>
              <button
                onClick={toggleClusterStatus}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  config.showClusterStatus
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-secondary text-muted-foreground'
                )}
              >
                {config.showClusterStatus ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </button>
            </div>
          </div>
    </>
  )

  const sidebarFooter = (
    <>
      {showAddForm && selectedKnownRoutes.size > 0 ? (
        <>
          <select
            value={newItemTarget}
            onChange={(e) => setNewItemTarget(e.target.value as 'primary' | 'secondary')}
            className="px-2 py-1.5 rounded-lg bg-secondary border border-border text-foreground text-sm"
          >
            <option value="primary">{t('sidebar.customizer.primaryNav')}</option>
            <option value="secondary">{t('sidebar.customizer.secondaryNav')}</option>
          </select>
          <div className="flex-1" />
          <button
            onClick={handleAddSelectedRoutes}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm hover:bg-purple-600 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('sidebar.customizer.addCount', { count: selectedKnownRoutes.size, plural: selectedKnownRoutes.size !== 1 ? 's' : '' })}
          </button>
        </>
      ) : !embedded ? (
        <>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
          >
            {t('common.close')}
          </button>
        </>
      ) : null}
    </>
  )

  // Embedded mode: render content inline without BaseModal wrapper
  if (embedded) {
    return (
      <>
        <div className="overflow-y-auto flex-1 p-4">
          {sidebarContent}
        </div>
        {showAddForm && selectedKnownRoutes.size > 0 && (
          <div className="border-t border-border px-4 py-3 flex items-center bg-background">
            {sidebarFooter}
          </div>
        )}
        <CreateDashboardModal
          isOpen={isCreateDashboardOpen}
          onClose={closeCreateDashboard}
          onCreate={handleCreateDashboard}
          existingNames={dashboards.map(d => d.name)}
        />
      </>
    )
  }

  // Standard modal mode
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

      <BaseModal.Content className="max-h-[60vh]">
        {sidebarContent}
      </BaseModal.Content>

      <BaseModal.Footer>
        {sidebarFooter}
      </BaseModal.Footer>
    </BaseModal>

    <CreateDashboardModal
      isOpen={isCreateDashboardOpen}
      onClose={closeCreateDashboard}
      onCreate={handleCreateDashboard}
      existingNames={dashboards.map(d => d.name)}
    />
    </>
  )
}
