import { useState, useEffect } from 'react'
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
import { useSidebarConfig, AVAILABLE_ICONS, SidebarItem } from '../../hooks/useSidebarConfig'
import { useDashboards, Dashboard } from '../../hooks/useDashboards'
import { DASHBOARD_TEMPLATES, TEMPLATE_CATEGORIES } from '../dashboard/templates'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals'
import * as Icons from 'lucide-react'

const CARD_TYPE_LABELS: Record<string, string> = {
  cluster_health: 'Cluster Health',
  event_stream: 'Event Stream',
  pod_issues: 'Pod Issues',
  top_pods: 'Top Pods',
  app_status: 'Workload Status',
  resource_usage: 'Resource Usage',
  cluster_metrics: 'Cluster Metrics',
  deployment_status: 'Deployment Status',
  deployment_progress: 'Deployment Progress',
  deployment_issues: 'Deployment Issues',
  gitops_drift: 'GitOps Drift',
  upgrade_status: 'Upgrade Status',
  resource_capacity: 'Resource Capacity',
  gpu_inventory: 'GPU Inventory',
  gpu_status: 'GPU Status',
  gpu_overview: 'GPU Overview',
  security_issues: 'Security Issues',
}

// Sortable sidebar item component
interface SortableItemProps {
  item: SidebarItem
  onRemove: (id: string) => void
  renderIcon: (iconName: string, className?: string) => React.ReactNode
}

function SortableItem({ item, onRemove, renderIcon }: SortableItemProps) {
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
          title="Remove from sidebar"
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
  { href: '/clusters', name: 'Clusters', description: 'Detailed cluster management, health monitoring, and node status', icon: 'Server', category: 'Core Dashboards' },
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
  return CARD_TYPE_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

interface SidebarCustomizerProps {
  isOpen: boolean
  onClose: () => void
}

export function SidebarCustomizer({ isOpen, onClose }: SidebarCustomizerProps) {
  const {
    config,
    addItem,
    removeItem,
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

  const { getAllDashboardsWithCards } = useDashboards()

  const [newItemName, setNewItemName] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationResult, setGenerationResult] = useState<string | null>(null)
  const [newItemIcon, setNewItemIcon] = useState('Zap')
  const [newItemHref, setNewItemHref] = useState('')
  const [newItemTarget, setNewItemTarget] = useState<'primary' | 'secondary'>('primary')
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedKnownRoute, setSelectedKnownRoute] = useState<string>('')
  const [showRouteDropdown, setShowRouteDropdown] = useState(false)
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

  const handleAddItem = () => {
    if (!newItemName || !newItemHref) return

    addItem(
      {
        name: newItemName,
        icon: newItemIcon,
        href: newItemHref.startsWith('/') ? newItemHref : `/${newItemHref}`,
        type: 'link',
      },
      newItemTarget
    )

    setNewItemName('')
    setNewItemHref('')
    setNewItemIcon('Zap')
    setSelectedKnownRoute('')
    setShowAddForm(false)
  }

  // Handle selecting a known route
  const handleSelectKnownRoute = (routeHref: string) => {
    const route = KNOWN_ROUTES.find(r => r.href === routeHref)
    if (route) {
      setSelectedKnownRoute(routeHref)
      setNewItemName(route.name)
      setNewItemHref(route.href)
      setNewItemIcon(route.icon)
    }
    setShowRouteDropdown(false)
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
      setGenerationResult(`Analyzed ${navHistory.length} page visits. Sidebar updated based on your most visited pages.`)
    } else {
      setGenerationResult('Not enough navigation data yet. Keep using the console and try again later!')
    }

    setIsGenerating(false)
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
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
      <BaseModal.Header
        title="Customize Sidebar"
        description="Add, remove, or reorder menu items"
        icon={LayoutDashboard}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[60vh]">
          {/* Quick Actions */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
            <button
              onClick={resetToDefault}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
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
              {isGenerating ? 'Analyzing...' : 'Generate from Behavior'}
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

          {/* Add Item Form */}
          {showAddForm && (
            <div className="mb-6 p-4 rounded-lg bg-secondary/30 border border-border/50">
              <h3 className="text-sm font-medium text-foreground mb-3">Add New Menu Item</h3>

              {/* Route Selection - Dropdown with descriptions */}
              <div className="mb-4">
                <label className="text-xs text-muted-foreground mb-1 block">Select a Dashboard Route</label>
                <div className="relative">
                  <button
                    onClick={() => setShowRouteDropdown(!showRouteDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-secondary border border-border text-sm text-left"
                  >
                    {selectedKnownRoute ? (
                      <span className="text-foreground">
                        {KNOWN_ROUTES.find(r => r.href === selectedKnownRoute)?.name}
                        <span className="text-muted-foreground ml-2">({selectedKnownRoute})</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Select a dashboard to add...</span>
                    )}
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', showRouteDropdown && 'rotate-180')} />
                  </button>

                  {showRouteDropdown && (
                    <div
                      className="absolute top-full left-0 right-0 mt-1 py-2 rounded-lg bg-card border border-border shadow-xl z-50 max-h-[300px] overflow-y-auto overscroll-contain"
                      onWheel={(e) => e.stopPropagation()}
                    >
                      {/* Known routes grouped by category */}
                      {ROUTE_CATEGORIES.map(category => (
                        <div key={category}>
                          <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider bg-card sticky top-0 z-10">
                            {category}
                          </div>
                          {KNOWN_ROUTES.filter(r => r.category === category).map(route => {
                            const isAlreadyAdded = config.primaryNav.some(item => item.href === route.href) ||
                                                    config.secondaryNav.some(item => item.href === route.href)
                            return (
                              <button
                                key={route.href}
                                onClick={() => handleSelectKnownRoute(route.href)}
                                disabled={isAlreadyAdded}
                                className={cn(
                                  'w-full px-3 py-2 text-left transition-colors',
                                  isAlreadyAdded
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'hover:bg-secondary/50',
                                  selectedKnownRoute === route.href && 'bg-purple-500/10'
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  {renderIcon(route.icon, 'w-4 h-4 text-muted-foreground')}
                                  <span className={cn(
                                    'text-sm font-medium',
                                    selectedKnownRoute === route.href ? 'text-purple-400' : 'text-foreground'
                                  )}>
                                    {route.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground ml-auto">{route.href}</span>
                                  {isAlreadyAdded && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Added</span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground pl-6 mt-0.5">{route.description}</p>
                              </button>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Name, Route (read-only), Icon, and Section fields */}
              {selectedKnownRoute && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Name</label>
                    <input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="Menu item name"
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Route</label>
                    <div className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground text-sm">
                      {newItemHref}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Icon</label>
                    <select
                      value={newItemIcon}
                      onChange={(e) => setNewItemIcon(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                    >
                      {AVAILABLE_ICONS.map((icon) => (
                        <option key={icon} value={icon}>{icon}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Section</label>
                    <select
                      value={newItemTarget}
                      onChange={(e) => setNewItemTarget(e.target.value as 'primary' | 'secondary')}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                    >
                      <option value="primary">Primary Navigation</option>
                      <option value="secondary">Secondary Navigation</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => {
                    setShowAddForm(false)
                    setSelectedKnownRoute('')
                    setNewItemName('')
                    setNewItemHref('')
                    setNewItemIcon('Zap')
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={!newItemName || !newItemHref}
                  className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Item
                </button>
              </div>

              {/* Note about adding custom dashboards */}
              <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
                Need a custom dashboard? See the <a href="https://github.com/kubestellar/console/blob/main/CONTRIBUTING.md#adding-a-new-dashboard" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">developer guide</a> for instructions on adding new dashboards to the source.
              </p>
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
              <span className="text-sm font-medium text-foreground">Primary Navigation</span>
              <span className="text-xs text-muted-foreground">({config.primaryNav.length} items)</span>
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
              <span className="text-sm font-medium text-foreground">Secondary Navigation</span>
              <span className="text-xs text-muted-foreground">({config.secondaryNav.length} items)</span>
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
              <span className="text-sm font-medium text-foreground">Dashboard Cards</span>
              <span className="text-xs text-muted-foreground">
                ({dashboardsWithCards.reduce((sum, d) => sum + (d.cards?.length || 0), 0)} cards)
              </span>
            </button>
            {expandedSection === 'dashboards' && (
              <div className="space-y-3 pl-2">
                {isLoadingDashboards ? (
                  <div className="flex items-center gap-2 p-3 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading dashboards...</span>
                  </div>
                ) : dashboardsWithCards.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    No dashboards found
                  </div>
                ) : (
                  dashboardsWithCards.map((dashboard) => (
                    <div key={dashboard.id} className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-foreground/80 font-medium">
                        <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" />
                        {dashboard.name}
                        {dashboard.is_default && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                            Default
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
                          No cards in this dashboard
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
              <span className="text-sm font-medium text-foreground">Available Templates</span>
              <span className="text-xs text-muted-foreground">({DASHBOARD_TEMPLATES.length} templates)</span>
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
                                Added
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
                                Add
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
                <h3 className="text-sm font-medium text-foreground">Cluster Status Panel</h3>
                <p className="text-xs text-muted-foreground">Show cluster health summary in sidebar</p>
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
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
        >
          Done
        </button>
      </BaseModal.Footer>
    </BaseModal>
  )
}
