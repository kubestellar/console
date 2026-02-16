import { useState, useEffect } from 'react'
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
  ChevronDown,
  ChevronRight,
  Loader2,
  LayoutDashboard,
  Square,
  Search,
  FolderPlus,
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
import { useDashboards, Dashboard } from '../../hooks/useDashboards'
import { DASHBOARD_TEMPLATES, TEMPLATE_CATEGORIES, DashboardTemplate } from '../dashboard/templates'
import { CreateDashboardModal } from '../dashboard/CreateDashboardModal'
import { cn } from '../../lib/cn'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { suggestDashboardIcon, suggestIconSync } from '../../lib/iconSuggester'
import { BaseModal } from '../../lib/modals'
// NOTE: Wildcard import is required for dynamic icon resolution
// Sidebar customizer allows users to add/edit items with configurable icons
// The renderIcon() function resolves icon names dynamically via Icons[iconName]
import * as Icons from 'lucide-react'

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
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg bg-secondary/30',
        item.isCustom && 'border border-purple-500/20',
        isDragging && 'shadow-lg'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      {renderIcon(item.icon, 'w-4 h-4 text-muted-foreground')}
      <span className="flex-1 text-sm text-foreground">{item.name}</span>
      <span className="text-xs text-muted-foreground">{item.href}</span>
      {/* Allow removing any item except the main Dashboard (/) */}
      {item.href !== '/' && (
        <button
          onClick={() => onRemove(item.id)}
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
  { href: '/storage', name: 'Storage', description: 'Persistent volumes, storage classes, and capacity management', icon: 'HardDrive', category: 'Core Dashboards' },
  { href: '/network', name: 'Network', description: 'Network policies, ingress, and service mesh configuration', icon: 'Network', category: 'Core Dashboards' },
  { href: '/arcade', name: 'Arcade', description: 'Kubernetes-themed arcade games for taking a break', icon: 'Gamepad2', category: 'Core Dashboards' },
  { href: '/deploy', name: 'KubeStellar Deploy', description: 'Deployment monitoring, GitOps, Helm releases, and ArgoCD', icon: 'Rocket', category: 'Core Dashboards' },
  { href: '/ai-ml', name: 'AI/ML', description: 'AI and machine learning workloads, GPU utilization, and model serving', icon: 'Brain', category: 'Core Dashboards' },
  { href: '/ci-cd', name: 'CI/CD', description: 'Continuous integration and deployment pipelines, Prow jobs, and GitHub workflows', icon: 'GitPullRequest', category: 'Core Dashboards' },
  { href: '/ai-agents', name: 'AI Agents', description: 'Kagenti agent platform — deploy, secure, and manage AI agents across clusters', icon: 'Bot', category: 'Core Dashboards' },
  { href: '/llm-d-benchmarks', name: 'llm-d Benchmarks', description: 'LLM inference benchmarks — throughput, latency, and GPU utilization across clouds and accelerators', icon: 'TrendingUp', category: 'Core Dashboards' },
  { href: '/compliance', name: 'Compliance', description: 'Regulatory compliance, audit logs, and policy enforcement', icon: 'ClipboardCheck', category: 'Core Dashboards' },
  { href: '/cluster-admin', name: 'Cluster Admin', description: 'Multi-cluster operations, control plane health, node debugging, and infrastructure management', icon: 'ShieldAlert', category: 'Core Dashboards' },
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
const ROUTE_CATEGORIES = [...new Set(KNOWN_ROUTES.map(r => r.category))]

function formatCardType(type: string): string {
  return formatCardTitle(type)
}

interface SidebarCustomizerProps {
  isOpen: boolean
  onClose: () => void
}

export function SidebarCustomizer({ isOpen, onClose }: SidebarCustomizerProps) {
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
    generateFromBehavior,
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

  const { getAllDashboardsWithCards, createDashboard, dashboards } = useDashboards()

  const [isGenerating, setIsGenerating] = useState(false)
  const [isCreateDashboardOpen, setIsCreateDashboardOpen] = useState(false)
  const [generationResult, setGenerationResult] = useState<string | null>(null)
  const [newItemTarget, setNewItemTarget] = useState<'primary' | 'secondary'>('primary')
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedKnownRoutes, setSelectedKnownRoutes] = useState<Set<string>>(new Set())
  const [routeSearch, setRouteSearch] = useState('')
  const [expandedSection, setExpandedSection] = useState<string | null>('primary')
  const [dashboardsWithCards, setDashboardsWithCards] = useState<Dashboard[]>([])
  const [isLoadingDashboards, setIsLoadingDashboards] = useState(false)

  // Load dashboards with cards when customizer opens
  useEffect(() => {
    if (isOpen) {
      setIsLoadingDashboards(true)
      getAllDashboardsWithCards()
        .then(setDashboardsWithCards)
        .finally(() => setIsLoadingDashboards(false))
    }
  }, [isOpen, getAllDashboardsWithCards])

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

  // Toggle selection of a known route
  const toggleKnownRoute = (routeHref: string) => {
    const newSelected = new Set(selectedKnownRoutes)
    if (newSelected.has(routeHref)) {
      newSelected.delete(routeHref)
    } else {
      newSelected.add(routeHref)
    }
    setSelectedKnownRoutes(newSelected)
  }

  const handleGenerateFromBehavior = async () => {
    setIsGenerating(true)
    setGenerationResult(null)

    // Simulate analyzing behavior
    await new Promise(resolve => setTimeout(resolve, 1500))

    // Get navigation history from localStorage
    const navHistory = JSON.parse(localStorage.getItem('kubestellar-nav-history') || '[]')

    // Count page visits
    const visitCounts: Record<string, number> = {}
    navHistory.forEach((path: string) => {
      visitCounts[path] = (visitCounts[path] || 0) + 1
    })

    // Sort by frequency
    const sortedPaths = Object.entries(visitCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([path]) => path)

    if (sortedPaths.length > 0) {
      generateFromBehavior(sortedPaths)
      setGenerationResult(t('sidebar.customizer.analyzed', { count: navHistory.length }))
    } else {
      setGenerationResult(t('sidebar.customizer.notEnoughData'))
    }

    setIsGenerating(false)
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

    setIsCreateDashboardOpen(false)
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
    })
  }

  const renderIcon = (iconName: string, className?: string) => {
    const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName]
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
          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
            >
              <Plus className="w-4 h-4" />
              {t('sidebar.customizer.addItem')}
            </button>
            <button
              onClick={() => setIsCreateDashboardOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30"
            >
              <FolderPlus className="w-4 h-4" />
              {t('sidebar.customizer.newDashboard')}
            </button>
            <button
              onClick={resetToDefault}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-4 h-4" />
              {t('sidebar.customizer.reset')}
            </button>
            <button
              onClick={handleGenerateFromBehavior}
              disabled={isGenerating}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {isGenerating ? t('sidebar.customizer.analyzing') : t('sidebar.customizer.generateFromBehavior')}
            </button>
          </div>

          {/* Generation Result */}
          {generationResult && (
            <div className={cn(
              'mb-4 p-3 rounded-lg text-sm',
              generationResult.includes('Not enough')
                ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-300'
                : 'bg-green-500/10 border border-green-500/20 text-green-300'
            )}>
              {generationResult}
            </div>
          )}

          {/* Add Item Form - Inline checklist (no dropdown) */}
          {showAddForm && (
            <div className="mb-6 p-4 rounded-lg bg-secondary/30 border border-border/50">
              <h3 className="text-sm font-medium text-foreground mb-3">{t('sidebar.customizer.addDashboards')}</h3>

              {/* Search filter */}
              <div className="mb-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={routeSearch}
                    onChange={(e) => setRouteSearch(e.target.value)}
                    placeholder={t('sidebar.customizer.filterDashboards')}
                    className="w-full pl-8 pr-3 py-2 text-sm bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 border border-border"
                  />
                </div>
              </div>

              {/* Inline checklist grouped by category */}
              <div className="space-y-1">
                {(() => {
                  const searchLower = routeSearch.toLowerCase()
                  const filteredCategories = ROUTE_CATEGORIES.filter(category => {
                    const routes = KNOWN_ROUTES.filter(r => r.category === category)
                    if (!searchLower) return true
                    return routes.some(r =>
                      r.name.toLowerCase().includes(searchLower) ||
                      r.description.toLowerCase().includes(searchLower) ||
                      r.href.toLowerCase().includes(searchLower)
                    )
                  })

                  if (filteredCategories.length === 0) {
                    return (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        {t('sidebar.customizer.noDashboardsFound', { query: routeSearch })}
                      </div>
                    )
                  }

                  return filteredCategories.map(category => {
                    const routes = KNOWN_ROUTES.filter(r => r.category === category)
                    const filteredRoutes = searchLower
                      ? routes.filter(r =>
                          r.name.toLowerCase().includes(searchLower) ||
                          r.description.toLowerCase().includes(searchLower) ||
                          r.href.toLowerCase().includes(searchLower)
                        )
                      : routes

                    if (filteredRoutes.length === 0) return null

                    // Get available routes in category (not already added)
                    const availableRoutes = filteredRoutes.filter(r =>
                      !config.primaryNav.some(item => item.href === r.href) &&
                      !config.secondaryNav.some(item => item.href === r.href)
                    )
                    const allCategorySelected = availableRoutes.length > 0 &&
                      availableRoutes.every(r => selectedKnownRoutes.has(r.href))

                    return (
                      <div key={category} className="rounded-lg border border-border/50 overflow-hidden">
                        {/* Category header */}
                        <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider bg-secondary/80 flex items-center justify-between text-muted-foreground">
                          <span>{category}</span>
                          {availableRoutes.length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                const newSelected = new Set(selectedKnownRoutes)
                                if (allCategorySelected) {
                                  availableRoutes.forEach(r => newSelected.delete(r.href))
                                } else {
                                  availableRoutes.forEach(r => newSelected.add(r.href))
                                }
                                setSelectedKnownRoutes(newSelected)
                              }}
                              className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded transition-colors',
                                allCategorySelected
                                  ? 'bg-purple-500/30 text-purple-300 hover:bg-purple-500/40'
                                  : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                              )}
                            >
                              {allCategorySelected ? t('sidebar.customizer.deselectAll') : t('sidebar.customizer.selectAll')}
                            </button>
                          )}
                        </div>
                        {/* Routes in this category */}
                        <div className="divide-y divide-border/30">
                          {filteredRoutes.map(route => {
                            const isAlreadyAdded = config.primaryNav.some(item => item.href === route.href) ||
                                                    config.secondaryNav.some(item => item.href === route.href)
                            const isSelected = selectedKnownRoutes.has(route.href)
                            return (
                              <button
                                key={route.href}
                                onClick={() => !isAlreadyAdded && toggleKnownRoute(route.href)}
                                disabled={isAlreadyAdded}
                                className={cn(
                                  'w-full px-3 py-2 text-left transition-colors',
                                  isAlreadyAdded
                                    ? 'opacity-50 cursor-not-allowed bg-secondary/20'
                                    : 'hover:bg-secondary/50',
                                  isSelected && !isAlreadyAdded && 'bg-purple-500/10'
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  {/* Checkbox */}
                                  <div className={cn(
                                    'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                                    isAlreadyAdded ? 'border-green-500/50 bg-green-500/20' :
                                    isSelected ? 'border-purple-500 bg-purple-500' : 'border-border bg-secondary'
                                  )}>
                                    {(isSelected || isAlreadyAdded) && (
                                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                        <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                    )}
                                  </div>
                                  {renderIcon(route.icon, 'w-4 h-4 text-muted-foreground flex-shrink-0')}
                                  <span className={cn(
                                    'text-sm font-medium truncate',
                                    isSelected && !isAlreadyAdded ? 'text-purple-400' : 'text-foreground'
                                  )}>
                                    {route.name}
                                  </span>
                                  {isAlreadyAdded && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 flex-shrink-0 ml-auto">{t('sidebar.customizer.added')}</span>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>

              {/* Selection summary */}
              {selectedKnownRoutes.size > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('sidebar.customizer.dashboardsSelected', { count: selectedKnownRoutes.size, plural: selectedKnownRoutes.size !== 1 ? 's' : '' })}
                  </span>
                  <button
                    onClick={() => setSelectedKnownRoutes(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t('sidebar.customizer.clearSelection')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Primary Navigation */}
          <div className="mb-4">
            <button
              onClick={() => setExpandedSection(expandedSection === 'primary' ? null : 'primary')}
              className="flex items-center gap-2 w-full text-left mb-2"
            >
              {expandedSection === 'primary' ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium text-foreground">{t('sidebar.customizer.primaryNavigation')}</span>
              <span className="text-xs text-muted-foreground">({t('sidebar.customizer.itemsCount', { count: config.primaryNav.length })})</span>
            </button>
            {expandedSection === 'primary' && renderItemList(config.primaryNav, 'primary')}
          </div>

          {/* Secondary Navigation */}
          <div className="mb-4">
            <button
              onClick={() => setExpandedSection(expandedSection === 'secondary' ? null : 'secondary')}
              className="flex items-center gap-2 w-full text-left mb-2"
            >
              {expandedSection === 'secondary' ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium text-foreground">{t('sidebar.customizer.secondaryNavigation')}</span>
              <span className="text-xs text-muted-foreground">({t('sidebar.customizer.itemsCount', { count: config.secondaryNav.length })})</span>
            </button>
            {expandedSection === 'secondary' && renderItemList(config.secondaryNav, 'secondary')}
          </div>

          {/* Dashboard Cards */}
          <div className="mb-4">
            <button
              onClick={() => setExpandedSection(expandedSection === 'dashboards' ? null : 'dashboards')}
              className="flex items-center gap-2 w-full text-left mb-2"
            >
              {expandedSection === 'dashboards' ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <LayoutDashboard className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-foreground">{t('sidebar.customizer.dashboardCards')}</span>
              <span className="text-xs text-muted-foreground">
                ({t('sidebar.customizer.cardsCount', { count: dashboardsWithCards.reduce((sum, d) => sum + (d.cards?.length || 0), 0) })})
              </span>
            </button>
            {expandedSection === 'dashboards' && (
              <div className="space-y-3 pl-2">
                {isLoadingDashboards ? (
                  <div className="flex items-center gap-2 p-3 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">{t('sidebar.customizer.loadingDashboards')}</span>
                  </div>
                ) : dashboardsWithCards.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    {t('sidebar.customizer.noDashboards')}
                  </div>
                ) : (
                  dashboardsWithCards.map((dashboard) => (
                    <div key={dashboard.id} className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-foreground/80 font-medium">
                        <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" />
                        {dashboard.name}
                        {dashboard.is_default && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                            {t('sidebar.customizer.default')}
                          </span>
                        )}
                      </div>
                      {dashboard.cards && dashboard.cards.length > 0 ? (
                        <div className="space-y-1 pl-5">
                          {dashboard.cards.map((card) => (
                            <div
                              key={card.id}
                              className="flex items-center gap-2 p-2 rounded-lg bg-secondary/20 text-sm"
                            >
                              <Square className="w-3 h-3 text-muted-foreground" />
                              <span className="text-foreground/70">
                                {card.title || formatCardType(card.card_type)}
                              </span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {formatCardType(card.card_type)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="pl-5 text-xs text-muted-foreground">
                          {t('sidebar.customizer.noCardsInDashboard')}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Available Dashboard Templates */}
          <div className="mb-4">
            <button
              onClick={() => setExpandedSection(expandedSection === 'templates' ? null : 'templates')}
              className="flex items-center gap-2 w-full text-left mb-2"
            >
              {expandedSection === 'templates' ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-foreground">{t('sidebar.customizer.availableTemplates')}</span>
              <span className="text-xs text-muted-foreground">({t('sidebar.customizer.templates', { count: DASHBOARD_TEMPLATES.length })})</span>
            </button>
            {expandedSection === 'templates' && (
              <div className="space-y-2 pl-2">
                {TEMPLATE_CATEGORIES.map((category) => {
                  const templatesInCategory = DASHBOARD_TEMPLATES.filter(t => t.category === category.id)
                  if (templatesInCategory.length === 0) return null

                  return (
                    <div key={category.id} className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider py-1">
                        <span>{category.icon}</span>
                        <span>{category.name}</span>
                      </div>
                      {templatesInCategory.map((template) => {
                        const isInSidebar = config.primaryNav.some(item =>
                          item.href === `/dashboard/${template.id}` || item.id === template.id
                        )

                        return (
                          <div
                            key={template.id}
                            className="flex items-center gap-2 p-2 rounded-lg bg-secondary/20"
                          >
                            <span className="text-lg">{template.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-foreground truncate">{template.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{template.description}</div>
                            </div>
                            {isInSidebar ? (
                              <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 whitespace-nowrap">
                                {t('sidebar.customizer.added')}
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  addItem({
                                    name: template.name,
                                    icon: 'LayoutDashboard',
                                    href: `/dashboard/${template.id}`,
                                    type: 'link',
                                  }, 'primary')
                                }}
                                className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 whitespace-nowrap"
                              >
                                {t('sidebar.customizer.add')}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Cluster Status Toggle */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border/50">
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
      </BaseModal.Content>

      <BaseModal.Footer>
        {/* Add controls - only show when form is open and items are selected */}
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
        ) : (
          <>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
            >
              {t('common.close')}
            </button>
          </>
        )}
      </BaseModal.Footer>
    </BaseModal>

    {/* Create Dashboard Modal */}
    <CreateDashboardModal
      isOpen={isCreateDashboardOpen}
      onClose={() => setIsCreateDashboardOpen(false)}
      onCreate={handleCreateDashboard}
      existingNames={dashboards.map(d => d.name)}
    />
    </>
  )
}
