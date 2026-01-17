import { useState, useEffect } from 'react'
import {
  X,
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
import { useSidebarConfig, AVAILABLE_ICONS, SidebarItem } from '../../hooks/useSidebarConfig'
import { useDashboards, Dashboard } from '../../hooks/useDashboards'
import { DASHBOARD_TEMPLATES, TEMPLATE_CATEGORIES } from '../dashboard/templates'
import { cn } from '../../lib/cn'
import * as Icons from 'lucide-react'

const CARD_TYPE_LABELS: Record<string, string> = {
  cluster_health: 'Cluster Health',
  event_stream: 'Event Stream',
  pod_issues: 'Pod Issues',
  top_pods: 'Top Pods',
  app_status: 'App Status',
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
    toggleClusterStatus,
    resetToDefault,
    generateFromBehavior,
  } = useSidebarConfig()

  const { getAllDashboardsWithCards } = useDashboards()

  const [newItemName, setNewItemName] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationResult, setGenerationResult] = useState<string | null>(null)
  const [newItemIcon, setNewItemIcon] = useState('Zap')
  const [newItemHref, setNewItemHref] = useState('')
  const [newItemTarget, setNewItemTarget] = useState<'primary' | 'secondary'>('primary')
  const [showAddForm, setShowAddForm] = useState(false)
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

  // ESC to close
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

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
    setShowAddForm(false)
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

  const renderItemList = (items: SidebarItem[], canRemove = false) => (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'flex items-center gap-2 p-2 rounded-lg bg-secondary/30',
            item.isCustom && 'border border-purple-500/20'
          )}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
          {renderIcon(item.icon, 'w-4 h-4 text-muted-foreground')}
          <span className="flex-1 text-sm text-white">{item.name}</span>
          <span className="text-xs text-muted-foreground">{item.href}</span>
          {(canRemove || item.isCustom) && (
            <button
              onClick={() => removeItem(item.id)}
              className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-2xl max-h-[80vh] glass rounded-2xl overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div>
            <h2 className="text-lg font-medium text-white">Customize Sidebar</h2>
            <p className="text-sm text-muted-foreground">Add, remove, or reorder menu items</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
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
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 text-muted-foreground hover:text-white"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button
              onClick={handleGenerateFromBehavior}
              disabled={isGenerating}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 text-muted-foreground hover:text-white disabled:opacity-50"
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
              <h3 className="text-sm font-medium text-white mb-3">Add New Menu Item</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Name</label>
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Menu item name"
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">URL Path</label>
                  <input
                    type="text"
                    value={newItemHref}
                    onChange={(e) => setNewItemHref(e.target.value)}
                    placeholder="/my-page"
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Icon</label>
                  <select
                    value={newItemIcon}
                    onChange={(e) => setNewItemIcon(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm"
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
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm"
                  >
                    <option value="primary">Primary Navigation</option>
                    <option value="secondary">Secondary Navigation</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddItem}
                  className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600"
                >
                  Add Item
                </button>
              </div>
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
              <span className="text-sm font-medium text-white">Primary Navigation</span>
              <span className="text-xs text-muted-foreground">({config.primaryNav.length} items)</span>
            </button>
            {expandedSection === 'primary' && renderItemList(config.primaryNav)}
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
              <span className="text-sm font-medium text-white">Secondary Navigation</span>
              <span className="text-xs text-muted-foreground">({config.secondaryNav.length} items)</span>
            </button>
            {expandedSection === 'secondary' && renderItemList(config.secondaryNav)}
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
              <span className="text-sm font-medium text-white">Dashboard Cards</span>
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
                      <div className="flex items-center gap-2 text-sm text-white/80 font-medium">
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
                              <span className="text-white/70">
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
              <span className="text-sm font-medium text-white">Available Templates</span>
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
                              <div className="text-sm text-white truncate">{template.name}</div>
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
                <h3 className="text-sm font-medium text-white">Cluster Status Panel</h3>
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
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
