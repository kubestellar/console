import { useState } from 'react'
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
} from 'lucide-react'
import { useSidebarConfig, AVAILABLE_ICONS, SidebarItem } from '../../hooks/useSidebarConfig'
import { cn } from '../../lib/cn'
import * as Icons from 'lucide-react'

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
  } = useSidebarConfig()

  const [newItemName, setNewItemName] = useState('')
  const [newItemIcon, setNewItemIcon] = useState('Zap')
  const [newItemHref, setNewItemHref] = useState('')
  const [newItemTarget, setNewItemTarget] = useState<'primary' | 'secondary'>('primary')
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>('primary')

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
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 text-muted-foreground hover:text-white"
            >
              <Sparkles className="w-4 h-4" />
              Generate from Behavior
            </button>
          </div>

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
