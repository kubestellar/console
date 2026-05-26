/**
 * MissionBrowserSidebar
 *
 * The left-hand file-tree sidebar of the Mission Browser. Renders the tree of
 * community / GitHub / local source nodes with inline "add repo" and "add path"
 * forms, plus a drag-and-drop / click-to-upload drop zone at the bottom.
 *
 * Extracted from MissionBrowser.tsx (issue #8624).
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, CheckCircle, X } from 'lucide-react'
import { ConfirmDialog } from '../../lib/modals'
import { cn } from '../../lib/cn'
import { SIDEBAR_WIDTH, MISSION_FILE_ACCEPT } from './missionBrowserConstants'
import { TreeNodeItem } from './browser'
import type { TreeNode } from './browser'

const REVEAL_HIGHLIGHT_TIMEOUT_MS = 2_000

type PendingRemoval = {
  kind: 'repo' | 'path'
  path: string
} | null

interface MissionBrowserSidebarProps {
  treeNodes: TreeNode[]
  expandedNodes: Set<string>
  selectedPath: string | null
  revealPath: string | null
  revealNonce: number
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
}

export function MissionBrowserSidebar({
  treeNodes,
  expandedNodes,
  selectedPath,
  revealPath,
  revealNonce,
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
}: MissionBrowserSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const treeNodeRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const { showToast } = useToast()
  const { t } = useTranslation('common')
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval>(null)

  useEffect(() => {
    if (!revealPath) return

    const nodeElement = treeNodeRefs.current.get(revealPath)
    if (!nodeElement) return

    const revealClasses = ['ring-1', 'ring-purple-400/80', 'bg-purple-500/20']
    nodeElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
    nodeElement.classList.add(...revealClasses)

    const timeoutId = window.setTimeout(() => {
      nodeElement.classList.remove(...revealClasses)
    }, REVEAL_HIGHLIGHT_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeoutId)
      nodeElement.classList.remove(...revealClasses)
    }
  }, [revealNonce, revealPath])

  const handleConfirmRemoval = () => {
    if (!pendingRemoval) return

    if (pendingRemoval.kind === 'repo') {
      onRemoveRepo(pendingRemoval.path)
    } else {
      onRemovePath(pendingRemoval.path)
    }

    setPendingRemoval(null)
  }

  return (
    <>
      <div
        data-testid="mission-tree"
        className="hidden md:flex flex-col border-r border-border bg-card overflow-y-auto"
        style={{ width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH }}
      >
        <div className="p-3 space-y-1">
          {(treeNodes || []).map((node) => (
            <div key={node.id}>
              <div>
                <TreeNodeItem
                  node={node}
                  depth={0}
                  expandedNodes={expandedNodes}
                  selectedPath={selectedPath}
                  nodeRefs={treeNodeRefs}
                  onToggle={onToggleNode}
                  onSelect={onSelectNode}
                  onRemove={
                    node.id === 'github'
                      ? (child) => setPendingRemoval({ kind: 'repo', path: child.path })
                      : node.id === 'local'
                        ? (child) => setPendingRemoval({ kind: 'path', path: child.path })
                        : undefined
                  }
                  onRefresh={
                    node.id === 'github' || node.id === 'local'
                      ? onRefreshNode
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

              {node.id === 'github' && addingRepo && (
                <div className="ml-6 mt-1 mb-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const val = newRepoValue.trim()
                      if (val && !watchedRepos.includes(val)) {
                        onAddRepo(val)
                        showToast(t('missionBrowser.repoAddedToast', { value: val }), 'success')
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
                      placeholder={t('missionBrowser.repoPlaceholder')}
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

              {node.id === 'local' && addingPath && (
                <div className="ml-6 mt-1 mb-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const val = newPathValue.trim()
                      if (val && !watchedPaths.includes(val)) {
                        onAddPath(val)
                        showToast(t('missionBrowser.pathAddedToast', { value: val }), 'success')
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
                      placeholder={t('missionBrowser.pathPlaceholder')}
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
              {t('missionBrowser.dropZone')}
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

      <ConfirmDialog
        isOpen={pendingRemoval !== null}
        onClose={() => setPendingRemoval(null)}
        onConfirm={handleConfirmRemoval}
        title={pendingRemoval?.kind === 'repo' ? t('missionBrowser.removeWatchedRepoTitle') : t('missionBrowser.removeWatchedPathTitle')}
        message={pendingRemoval?.kind === 'repo'
          ? t('missionBrowser.removeWatchedRepoMessage', { path: pendingRemoval?.path })
          : t('missionBrowser.removeWatchedPathMessage', { path: pendingRemoval?.path })}
        confirmLabel={t('actions.remove')}
        cancelLabel={t('actions.cancel')}
        variant="danger"
      />
    </>
  )
}
