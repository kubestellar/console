import { useState } from 'react'
import { ExternalLink, AlertCircle } from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { CardControls } from '../../ui/CardControls'
import { usePagination, Pagination } from '../../ui/Pagination'
import { DEMO_NOTEBOOKS, useDemoData } from './shared'

interface MLNotebooksProps {
  config?: Record<string, unknown>
}

export function MLNotebooks({ config: _config }: MLNotebooksProps) {
  const { data: notebooks, isLoading } = useDemoData(DEMO_NOTEBOOKS)
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(notebooks, effectivePerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Active</span>
      case 'idle':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Idle</span>
      case 'stopped':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">Stopped</span>
      default:
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">{status}</span>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
          {notebooks.filter(n => n.status === 'running').length} active
        </span>
        <CardControls limit={limit} onLimitChange={setLimit} />
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-400 font-medium">Notebook Detection</p>
          <p className="text-muted-foreground">
            Scans for JupyterHub and standalone notebook servers.{' '}
            <a href="https://jupyterhub.readthedocs.io/en/stable/getting-started/index.html" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              JupyterHub docs <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Notebook list */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border/50">
              <th className="text-left py-2">Notebook</th>
              <th className="text-left py-2">User</th>
              <th className="text-right py-2">Resources</th>
              <th className="text-right py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((nb, idx) => (
              <tr key={idx} className="border-b border-border/30 hover:bg-secondary/30">
                <td className="py-2 font-medium text-foreground">{nb.name}</td>
                <td className="py-2 text-muted-foreground">{nb.user}</td>
                <td className="py-2 text-right text-xs text-muted-foreground">
                  {nb.cpu} / {nb.memory} {nb.gpu !== '-' && `/ ${nb.gpu}`}
                </td>
                <td className="py-2 text-right">{getStatusBadge(nb.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}
