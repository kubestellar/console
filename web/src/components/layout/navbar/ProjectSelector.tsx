/**
 * ProjectSelector — a multi-select dropdown in the navbar that lets users
 * filter the entire dashboard by one or more projects.
 *
 * Projects are user-defined cluster groupings managed via useProjectFilter.
 */

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderKanban, Check, Plus, Trash2, ChevronDown } from 'lucide-react'
import { useProjectFilter } from '../../../hooks/useProjectFilter'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { ALL_PROJECTS_ID, isBuiltInProject } from '../../../lib/projects'
import { cn } from '../../../lib/cn'

/** Maximum visible project items before the list scrolls */
const MAX_VISIBLE_ITEMS = 8
/** Line height (px) per project item used for max-height calculation */
const ITEM_HEIGHT_PX = 36

export function ProjectSelector() {
  const { t } = useTranslation()
  const {
    projects,
    selectedProjectIds,
    toggleProject,
    setSelectedProjectIds,
    isAllSelected,
    isProjectFiltered,
    addProject,
    deleteProject,
  } = useProjectFilter()

  const { availableClusters } = useGlobalFilters()

  const [isOpen, setIsOpen] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newClusters, setNewClusters] = useState<string[]>([])
  const [newColor, setNewColor] = useState('#8B5CF6') // purple default
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Count of selected user projects (excludes "All")
  const activeCount = isAllSelected ? 0 : selectedProjectIds.length
  // User-defined projects only (no built-ins except All)
  const userProjects = projects.filter(p => !isBuiltInProject(p.id))

  const handleCreate = () => {
    if (!newName.trim() || newClusters.length === 0) return
    addProject({
      name: newName.trim(),
      clusters: newClusters,
      namespaces: [],
      color: newColor,
    })
    setNewName('')
    setNewClusters([])
    setShowCreateForm(false)
  }

  const handleCancel = () => {
    setShowCreateForm(false)
    setNewName('')
    setNewClusters([])
  }

  const label = isAllSelected
    ? t('projects.allProjects', 'All Projects')
    : activeCount === 1
      ? projects.find(p => p.id === selectedProjectIds[0])?.name ?? 'Project'
      : `${activeCount} Projects`

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
          isProjectFiltered
            ? 'bg-purple-500/20 text-purple-400'
            : 'bg-secondary/50 text-muted-foreground hover:text-foreground',
        )}
        title={isProjectFiltered ? `Filtering by: ${label}` : 'Select projects to filter dashboard'}
      >
        <FolderKanban className="w-4 h-4" />
        <span className="hidden sm:inline max-w-[120px] truncate">{label}</span>
        {isProjectFiltered && (
          <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-purple-500 text-white rounded-full">
            {activeCount}
          </span>
        )}
        <ChevronDown className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header with "All" toggle */}
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {t('projects.title', 'Projects')}
            </span>
            <button
              onClick={() => setSelectedProjectIds([ALL_PROJECTS_ID])}
              className={cn(
                'text-xs px-2 py-0.5 rounded transition-colors',
                isAllSelected
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('projects.showAll', 'Show All')}
            </button>
          </div>

          {/* Project list */}
          <div
            className="overflow-y-auto"
            style={{ maxHeight: MAX_VISIBLE_ITEMS * ITEM_HEIGHT_PX }}
          >
            {userProjects.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {t('projects.noProjects', 'No projects defined. Create one below.')}
              </div>
            ) : (
              userProjects.map(proj => {
                const isSelected =
                  !isAllSelected && selectedProjectIds.includes(proj.id)
                return (
                  <div
                    key={proj.id}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-secondary/40 transition-colors group"
                  >
                    <button
                      onClick={() => toggleProject(proj.id)}
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                    >
                      {/* Checkbox */}
                      <div
                        className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                          isSelected
                            ? 'bg-purple-500 border-purple-500'
                            : 'border-muted-foreground',
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      {/* Color dot */}
                      {proj.color && (
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: proj.color }}
                        />
                      )}
                      {/* Name + cluster count */}
                      <span className="text-sm truncate text-foreground">
                        {proj.name}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        ({proj.clusters.length})
                      </span>
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => deleteProject(proj.id)}
                      className="p-1 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                      title={t('projects.delete', 'Delete project')}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Create form / button */}
          <div className="border-t border-border p-3">
            {showCreateForm ? (
              <div className="space-y-2">
                {/* Project name */}
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={t('projects.namePlaceholder', 'Project name...')}
                  className="w-full px-2 py-1.5 text-sm bg-secondary/50 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                  autoFocus
                />

                {/* Colour picker */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Color:</span>
                  {['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'].map(c => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className={cn(
                        'w-5 h-5 rounded-full border-2 transition-all',
                        newColor === c ? 'border-foreground scale-110' : 'border-transparent',
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                {/* Cluster multi-select */}
                <div className="text-xs text-muted-foreground">
                  {t('projects.selectClusters', 'Select clusters:')}
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {(availableClusters || []).map(cluster => {
                    const checked = newClusters.includes(cluster)
                    return (
                      <button
                        key={cluster}
                        onClick={() => {
                          if (checked) {
                            setNewClusters(prev => prev.filter(c => c !== cluster))
                          } else {
                            setNewClusters(prev => [...prev, cluster])
                          }
                        }}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs transition-colors',
                          checked
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'text-muted-foreground hover:bg-secondary/50',
                        )}
                      >
                        <div
                          className={cn(
                            'w-3 h-3 rounded border flex items-center justify-center flex-shrink-0',
                            checked
                              ? 'bg-purple-500 border-purple-500'
                              : 'border-muted-foreground',
                          )}
                        >
                          {checked && <Check className="w-2 h-2 text-white" />}
                        </div>
                        <span className="truncate">{cluster}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || newClusters.length === 0}
                    className="flex-1 px-2 py-1 text-xs font-medium bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('projects.create', 'Create')}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('projects.cancel', 'Cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/50 rounded transition-colors"
              >
                <Plus className="w-3 h-3" />
                {t('projects.createProject', 'Create Project')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
