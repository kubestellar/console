import { memo, useMemo } from 'react'
import {
  Folder, FolderOpen, FileJson, ChevronRight, ChevronDown,
  Loader2, Globe, Github, HardDrive, Trash2, Plus,
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { TreeNode } from './types'

export const TreeNodeItem = memo(function TreeNodeItem({
  node,
  depth,
  expandedNodes,
  selectedPath,
  onToggle,
  onSelect,
  onRemove,
  onAdd,
}: {
  node: TreeNode
  depth: number
  expandedNodes: Set<string>
  selectedPath: string | null
  onToggle: (node: TreeNode) => void
  onSelect: (node: TreeNode) => void
  /** Optional callback to remove a watched path/repo. When provided and the node is a watched child (source is 'local' or 'github'), a delete button is rendered. */
  onRemove?: (node: TreeNode) => void
  /** Optional callback for the root-level add (+) button. Rendered in the header row when depth===0. */
  onAdd?: () => void
}) {
  const isExpanded = expandedNodes.has(node.id)
  const isSelected = selectedPath === node.id
  const isDir = node.type === 'directory'
  const showRemoveButton = onRemove && depth > 0 && (node.source === 'local' || node.source === 'github')

  const sourceIcon = () => {
    switch (node.source) {
      case 'community':
        return <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
      case 'github':
        return <Github className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      case 'local':
        return <HardDrive className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
    }
  }

  const showHeaderActions = showRemoveButton || (depth === 0 && !!onAdd)

  // Memoize inline style objects to avoid creating new references on each render
  const paddingStyle = useMemo(() => ({ paddingLeft: `${depth * 16 + 8}px` }), [depth])
  const emptyPaddingStyle = useMemo(() => ({ paddingLeft: `${(depth + 1) * 16 + 8}px` }), [depth])

  return (
    <div>
      <div className={showHeaderActions ? 'flex items-center' : undefined}>
        <button
          onClick={() => {
            if (isDir) onToggle(node)
            onSelect(node)
          }}
          className={cn(
            'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
            isSelected
              ? 'bg-purple-500/15 text-purple-400'
              : 'text-foreground hover:bg-secondary/50',
            showHeaderActions && 'flex-1 min-w-0'
          )}
          style={paddingStyle}
        >
          {isDir ? (
            <>
              {node.loading ? (
                <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin flex-shrink-0" />
              ) : isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              )}
            </>
          ) : (
            <>
              <span className="w-3.5 flex-shrink-0" />
              <FileJson className="w-4 h-4 text-blue-400 flex-shrink-0" />
            </>
          )}
          <span className="truncate flex-1">{node.name}</span>
          {depth === 0 && sourceIcon()}
        </button>
        {/* Root-level add button — rendered in the header row so it stays anchored to the header */}
        {depth === 0 && onAdd && (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd() }}
            className="p-2 min-h-11 min-w-11 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            title="Add"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
        {showRemoveButton && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(node)
            }}
            className="p-2 min-h-11 min-w-11 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
            title="Remove from watched"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {isDir && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelect={onSelect}
              onRemove={onRemove}
            />
          ))}
          {node.children.length === 0 && node.loaded && (
            <div
              className="text-xs text-muted-foreground italic py-1"
              style={emptyPaddingStyle}
            >
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  )
})
