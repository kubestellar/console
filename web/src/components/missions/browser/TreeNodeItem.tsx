import { memo, useState, useRef, useEffect } from 'react'
import {
  Folder, FolderOpen, FileJson, FileCode, FileText, ChevronRight, ChevronDown,
  Loader2, Globe, HardDrive, Trash2, Plus, RefreshCw, Info } from 'lucide-react'
import { Github } from '@/lib/icons'
import { cn } from '../../../lib/cn'
import type { TreeNode } from './types'

/**
 * Detect a CNCF project's GitHub org from a filename.
 * Returns the GitHub org name for avatar URL, or null if no match.
 */
const FILENAME_TO_ORG: Array<[RegExp, string]> = [
  [/argo/, 'argoproj'],
  [/flux/, 'fluxcd'],
  [/karmada/, 'karmada-io'],
  [/prometheus|servicemonitor|alertmanager/, 'prometheus'],
  [/cert.?manager/, 'cert-manager'],
  [/istio/, 'istio'],
  [/ray|kuberay/, 'ray-project'],
  [/keda/, 'kedacore'],
  [/crossplane/, 'crossplane'],
  [/velero/, 'vmware-tanzu'],
  [/falco/, 'falcosecurity'],
  [/harbor/, 'goharbor'],
  [/knative/, 'knative'],
  [/strimzi|kafka/, 'strimzi'],
  [/nats/, 'nats-io'],
  [/longhorn/, 'longhorn'],
  [/kubevirt/, 'kubevirt'],
  [/tekton/, 'tektoncd'],
  [/kubeedge/, 'kubeedge'],
  [/chaos.?mesh/, 'chaos-mesh'],
  [/litmus/, 'litmuschaos'],
  [/linkerd/, 'linkerd'],
  [/contour/, 'projectcontour'],
  [/kyverno/, 'kyverno'],
  [/opentelemetry|otel/, 'open-telemetry'],
  [/jaeger/, 'jaegertracing'],
  [/trivy/, 'aquasecurity'],
  [/gitops/, 'fluxcd'],
]

function detectProjectOrg(filename: string): string | null {
  for (const [pattern, org] of FILENAME_TO_ORG) {
    if (pattern.test(filename)) return org
  }
  return null
}

/** Hover + click popover for the info (i) icon. */
function InfoPopover({ tooltip }: { tooltip: string }) {
  const [show, setShow] = useState(false)
  const [pinned, setPinned] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pinned) return
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setPinned(false)
        setShow(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [pinned])

  return (
    <div
      ref={ref}
      className="relative flex-shrink-0"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => { if (!pinned) setShow(false) }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); setPinned(p => !p); setShow(true) }}
        className="p-2 min-h-11 min-w-11 rounded text-muted-foreground hover:text-foreground transition-colors"
        aria-label="More information"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {show && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-border bg-background shadow-lg p-3 text-xs text-muted-foreground leading-relaxed">
          {tooltip}
        </div>
      )}
    </div>
  )
}

export const TreeNodeItem = memo(function TreeNodeItem({
  node,
  depth,
  expandedNodes,
  selectedPath,
  onToggle,
  onSelect,
  onRemove,
  onRefresh,
  onAdd }: {
  node: TreeNode
  depth: number
  expandedNodes: Set<string>
  selectedPath: string | null
  onToggle: (node: TreeNode) => void
  onSelect: (node: TreeNode) => void
  /** Optional callback to remove a watched path/repo. When provided and the node is a watched child (source is 'local' or 'github'), a delete button is rendered. */
  onRemove?: (node: TreeNode) => void
  /** Optional callback to refresh a node's contents (re-fetch from GitHub or re-scan local dir). */
  onRefresh?: (node: TreeNode) => void
  /** Optional callback for the root-level add (+) button. Rendered in the header row when depth===0. */
  onAdd?: () => void
}) {
  const isExpanded = expandedNodes.has(node.id)
  const isSelected = selectedPath === node.id
  const isDir = node.type === 'directory'
  const showRemoveButton = onRemove && depth > 0 && (node.source === 'local' || node.source === 'github')
  const showRefreshButton = onRefresh && depth > 0 && isDir && (node.source === 'local' || node.source === 'github')

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

  const showHeaderActions = showRemoveButton || showRefreshButton || (depth === 0 && !!onAdd) || (depth === 0 && !!node.infoTooltip)

  // Memoize inline style objects to avoid creating new references on each render
  const paddingStyle = { paddingLeft: `${depth * 16 + 8}px` }
  const emptyPaddingStyle = { paddingLeft: `${(depth + 1) * 16 + 8}px` }

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
          ) : (() => {
            const lower = node.name.toLowerCase()
            const projectOrg = detectProjectOrg(lower)
            if (projectOrg) {
              // Show CNCF project avatar
              return (
                <>
                  <span className="w-3.5 flex-shrink-0" />
                  <img
                    src={`https://github.com/${projectOrg}.png?size=32`}
                    alt={projectOrg}
                    className="w-4 h-4 rounded-sm flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </>
              )
            }
            const isYaml = lower.endsWith('.yaml') || lower.endsWith('.yml')
            const isMd = lower.endsWith('.md')
            const Icon = isYaml ? FileCode : isMd ? FileText : FileJson
            const color = isYaml ? 'text-orange-400' : isMd ? 'text-emerald-400' : 'text-blue-400'
            return (
              <>
                <span className="w-3.5 flex-shrink-0" />
                <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
              </>
            )
          })()}
          <span className="truncate flex-1" title={node.name}>{node.name}</span>
          {depth === 0 && sourceIcon()}
        </button>
        {/* Root-level info button — shown when the node has an infoTooltip */}
        {depth === 0 && node.infoTooltip && (
          <InfoPopover tooltip={node.infoTooltip} />
        )}
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
        {showRefreshButton && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRefresh(node)
            }}
            className="p-1.5 min-h-8 min-w-8 rounded hover:bg-blue-500/20 text-muted-foreground hover:text-blue-400 transition-colors flex-shrink-0"
            title="Refresh contents"
          >
            <RefreshCw className={`w-3 h-3 ${node.loading ? 'animate-spin' : ''}`} />
          </button>
        )}
        {showRemoveButton && isDir && (
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
              onRefresh={onRefresh}
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
