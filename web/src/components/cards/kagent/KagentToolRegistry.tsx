import { useState } from 'react'
import { Wrench, Server, ChevronDown, ChevronUp } from 'lucide-react'
import { useKagentCRDTools } from '../../../hooks/mcp/kagent_crds'
import { useCardLoadingState } from '../CardDataContext'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { Skeleton } from '../../ui/Skeleton'
import { useTranslation } from 'react-i18next'

interface KagentToolRegistryProps {
  config?: { cluster?: string }
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === 'Ready'
      ? 'bg-green-500/15 text-green-400 border-green-500/20'
      : status === 'Pending'
        ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20'
        : status === 'Failed'
          ? 'bg-red-500/15 text-red-400 border-red-500/20'
          : 'bg-gray-500/15 text-muted-foreground border-gray-500/20'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-medium rounded border ${classes}`}>
      {status}
    </span>
  )
}

function KindBadge({ kind }: { kind: string }) {
  const classes = kind === 'ToolServer'
    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-medium rounded border ${classes}`}>
      {kind === 'RemoteMCPServer' ? 'Remote' : 'Local'}
    </span>
  )
}

function ProtocolBadge({ protocol }: { protocol: string }) {
  const colorMap: Record<string, string> = {
    stdio: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    sse: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    streamableHTTP: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  }
  const classes = colorMap[protocol] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-2xs font-medium rounded border ${classes}`}>
      {protocol}
    </span>
  )
}

type SortField = 'name' | 'kind' | 'status' | 'cluster'

export function KagentToolRegistry({ config }: KagentToolRegistryProps) {
  const { t: _t } = useTranslation()
  const [expandedTool, setExpandedTool] = useState<string | null>(null)

  const {
    data: tools,
    isLoading,
    isDemoFallback,
    consecutiveFailures,
  } = useKagentCRDTools({ cluster: config?.cluster })

  const hasAnyData = tools.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    hasAnyData,
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    isDemoData: isDemoFallback,
  })

  const {
    items: paginatedItems,
    filters,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    needsPagination,
    itemsPerPage,
    containerRef,
    containerStyle,
  } = useCardData(tools, {
    filter: {
      searchFields: ['name', 'namespace', 'kind', 'protocol', 'cluster'],
      clusterField: 'cluster',
    },
    sort: {
      defaultField: 'name' as SortField,
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string('name'),
        kind: commonComparators.string('kind'),
        status: (a, b) => {
          const order: Record<string, number> = { Failed: 0, Pending: 1, Ready: 2 }
          return (order[a.status] ?? 99) - (order[b.status] ?? 99)
        },
        cluster: commonComparators.string('cluster'),
      } as Record<SortField, (a: typeof tools[number], b: typeof tools[number]) => number>,
    },
    defaultLimit: 10,
  })

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Wrench className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">No Tool Servers</div>
        <div className="text-xs text-muted-foreground/60 mt-1">Deploy ToolServer or RemoteMCPServer CRDs</div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      <CardControlsRow
        extra={
          <CardSearchInput value={filters.search} onChange={filters.setSearch} placeholder="Search tool servers..." />
        }
      />

      <div ref={containerRef} className="space-y-1" style={containerStyle}>
        {paginatedItems.map(tool => {
          const toolKey = `${tool.cluster}-${tool.namespace}-${tool.name}`
          const isExpanded = expandedTool === toolKey
          const toolCount = tool.discoveredTools?.length || 0

          return (
            <div key={toolKey}>
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                onClick={() => setExpandedTool(isExpanded ? null : toolKey)}
              >
                <Wrench className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{tool.name}</div>
                  <div className="text-xs text-muted-foreground/60 flex items-center gap-1">
                    <Server className="w-2.5 h-2.5" />
                    {tool.cluster} / {tool.namespace}
                  </div>
                </div>
                <KindBadge kind={tool.kind} />
                <ProtocolBadge protocol={tool.protocol} />
                {toolCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {toolCount} tool{toolCount !== 1 ? 's' : ''}
                  </span>
                )}
                <StatusBadge status={tool.status} />
                {toolCount > 0 && (
                  isExpanded
                    ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                    : <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
              {isExpanded && toolCount > 0 && (
                <div className="ml-8 mr-2 mb-1 space-y-0.5">
                  {tool.discoveredTools.map(dt => (
                    <div key={dt.name} className="text-xs text-muted-foreground flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5">
                      <span className="text-cyan-400/80 font-mono">{dt.name}</span>
                      {dt.description && <span className="truncate">{dt.description}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />
    </div>
  )
}
