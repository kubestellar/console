import {
  Folder, FolderOpen, FileJson, ChevronRight, ChevronDown,
  Loader2, Globe, Github, HardDrive,
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { TreeNode } from './types'

export function TreeNodeItem({
  node,
  depth,
  expandedNodes,
  selectedPath,
  onToggle,
  onSelect,
}: {
  node: TreeNode
  depth: number
  expandedNodes: Set<string>
  selectedPath: string | null
  onToggle: (node: TreeNode) => void
  onSelect: (node: TreeNode) => void
}) {
  const isExpanded = expandedNodes.has(node.id)
  const isSelected = selectedPath === node.id
  const isDir = node.type === 'directory'

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

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) onToggle(node)
          onSelect(node)
        }}
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
          isSelected
            ? 'bg-purple-500/15 text-purple-400'
            : 'text-foreground hover:bg-secondary/50'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
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
            />
          ))}
          {node.children.length === 0 && node.loaded && (
            <div
              className="text-xs text-muted-foreground italic py-1"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  )
}
