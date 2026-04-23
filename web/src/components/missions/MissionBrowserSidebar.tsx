/**
 * MissionBrowserSidebar
 *
 * The left-hand file-tree sidebar of the Mission Browser. Renders the tree of
 * community / GitHub / local source nodes with inline "add repo" and "add path"
 * forms, plus a drag-and-drop / click-to-upload drop zone at the bottom.
 *
 * Extracted from MissionBrowser.tsx (issue #8624).
 */

import { useRef } from 'react'
import { Upload, CheckCircle, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SIDEBAR_WIDTH, MISSION_FILE_ACCEPT } from './missionBrowserConstants'
import { TreeNodeItem, updateNodeInTree } from './browser'
import type { TreeNode } from './browser'
import { useToast } from '../ui/Toast'

interface MissionBrowserSidebarProps {
  treeNodes: TreeNode[]
  expandedNodes: Set<string>
  selectedPath: string | null
  onToggleNode: (node: TreeNode) => void
  onSelectNode: (node: TreeNode) => void

  isDragging: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void

  watchedRepos: string[]
  onRemoveRepo: (path: string) => void
  onRefreshNode: (child: TreeNode) => void

  watchedPaths: string[]
  onRemovePath: (path: string) => void

  addingRepo: boolean
  setAddingRepo: (value: boolean) => void
  newRepoValue: string
  setNewRepoValue: (value: string) => void
  onAddRepo: (val: string) => void

  addingPath: boolean
  setAddingPath: (value: boolean) => void
  newPathValue: string
  setNewPathValue: (value: string) => void
  onAddPath: (val: string) => void

  setTreeNodes: React.Dispatch<React.SetStateAction<TreeNode[]>>
  setExpandedNodes: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function MissionBrowserSidebar({
  treeNodes,
  expandedNodes,
  selectedPath,
  onToggleNode,
  onSelectNode,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  watchedRepos,
  onRemoveRepo,
  onRefreshNode,
  watchedPaths,
  onRemovePath,
  addingRepo,
  setAddingRepo,
  newRepoValue,
  setNewRepoValue,
  onAddRepo,
  addingPath,
  setAddingPath,
  newPathValue,
  setNewPathValue,
  onAddPath,
  setTreeNodes,
  setExpandedNodes,
}: MissionBrowserSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  return (
    <div
      data-testid="mission-tree"
      className="hidden md:flex flex-col border-r border-border bg-card overflow-y-auto"
      style={{ width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH }}
    >
      <div className="p-3 space-y-1">
        {treeNodes.map((node) => (
          <div key={node.id}>
            <div>
              <TreeNodeItem
                node={node}
                depth={0}
                expandedNodes={expandedNodes}
                selectedPath={selectedPath}
                onToggle={onToggleNode}
                onSelect={onSelectNode}
                onRemove={
                  node.id === 'github'
                    ? (child) => onRemoveRepo(child.path)
                    : node.id === 'local'
                      ? (child) => onRemovePath(child.path)
                      : undefined
                }
                onRefresh={
                  node.id === 'github' || node.id === 'local'
                    ? (child) => {
                        // Mark node as unloaded to force re-fetch
                        setTreeNodes((prev) =>
                          updateNodeInTree(prev, child.id, {
                            loaded: false,
                            loading: false,
                            children: [],
                          }),
                        )
                        // Collapse so re-expand triggers load
                        setExpandedNodes((prev) => {
                          const next = new Set(prev)
                          next.delete(child.id)
                          return next
                        })
                        onRefreshNode(child)
                      }
                    : undefined
                }
                onAdd={
                  node.id === 'github'
                    ? () => setAddingRepo(!addingRepo)
                    : node.id === 'local'
                      ? () => setAddingPath(!addingPath)
                      : undefined
                }
              />
            </div>

            {/* Inline add-repo form */}
            {node.id === 'github' && addingRepo && (
              <div className="ml-6 mt-1 mb-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const val = newRepoValue.trim()
                    if (val && !watchedRepos.includes(val)) {
                      onAddRepo(val)
                      showToast(`Repository "${val}" added`, 'success')
                    }
                    setNewRepoValue('')
                    setAddingRepo(false)
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    type="text"
                    value={newRepoValue}
                    onChange={(e) => setNewRepoValue(e.target.value)}
                    placeholder="owner/repo (e.g., kubara-io/kubara or your-org/runbooks)"
                    className="flex-1 px-2 py-1 text-xs bg-secondary border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/40"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setAddingRepo(false)
                        setNewRepoValue('')
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="p-1 text-xs text-green-400 hover:text-green-300 min-h-11 min-w-11 flex items-center justify-center"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingRepo(false)
                      setNewRepoValue('')
                    }}
                    className="p-1 text-xs text-muted-foreground hover:text-foreground min-h-11 min-w-11 flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}

            {/* Inline add-path form */}
            {node.id === 'local' && addingPath && (
              <div className="ml-6 mt-1 mb-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const val = newPathValue.trim()
                    if (val && !watchedPaths.includes(val)) {
                      onAddPath(val)
                      showToast(`Path "${val}" added`, 'success')
                    }
                    setNewPathValue('')
                    setAddingPath(false)
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    type="text"
                    value={newPathValue}
                    onChange={(e) => setNewPathValue(e.target.value)}
                    placeholder="/path/to/missions"
                    className="flex-1 px-2 py-1 text-xs bg-secondary border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/40"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setAddingPath(false)
                        setNewPathValue('')
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="p-1 text-xs text-green-400 hover:text-green-300 min-h-11 min-w-11 flex items-center justify-center"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingPath(false)
                      setNewPathValue('')
                    }}
                    className="p-1 text-xs text-muted-foreground hover:text-foreground min-h-11 min-w-11 flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Drop zone for local files */}
      <div className="mt-auto p-3 border-t border-border">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            onDragOver()
          }}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
            isDragging
              ? 'border-purple-400 bg-purple-500/10'
              : 'border-border hover:border-muted-foreground',
          )}
        >
          <Upload className="w-5 h-5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground text-center">
            Drop mission file (JSON, YAML, MD) or click to browse
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={MISSION_FILE_ACCEPT}
          onChange={onFileSelect}
          className="hidden"
        />
      </div>
    </div>
  )
}
