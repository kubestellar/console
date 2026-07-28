import { Server, ArrowUpDown } from 'lucide-react'
import type { TFunction } from 'i18next'
import { cn } from '../../../lib/cn'
import { HIGH_USAGE_PCT, MEDIUM_USAGE_PCT, TABLE_PAGE_SIZE, type NodeTableRow } from '../GPUInventoryHistory.parts'

export interface UtilisationTableProps {
  t: TFunction
  paginatedRows: NodeTableRow[]
  tableRows: NodeTableRow[]
  tablePage: number
  totalTablePages: number
  onPageChange: (updater: (page: number) => number) => void
}

/**
 * Per-node, per-type GPU utilisation table (table view) with pagination.
 * Extracted from GPUInventoryHistory.tsx to keep that file under the
 * line/hook budget (#21650).
 */
export function UtilisationTable({ t, paginatedRows, tableRows, tablePage, totalTablePages, onPageChange }: UtilisationTableProps) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-1.5 px-1 text-muted-foreground font-medium">
              <span className="flex items-center gap-1">
                <Server className="w-3 h-3" />
                {t('cards:gpuInventoryHistory.node', 'Node')}
              </span>
            </th>
            <th className="text-left py-1.5 px-1 text-muted-foreground font-medium">{t('cards:gpuInventoryHistory.cluster', 'Cluster')}</th>
            <th className="text-left py-1.5 px-1 text-muted-foreground font-medium">{t('cards:gpuInventoryHistory.type', 'Type')}</th>
            <th className="text-right py-1.5 px-1 text-muted-foreground font-medium">
              <span className="flex items-center justify-end gap-1">
                <ArrowUpDown className="w-3 h-3" />
                {t('cards:gpuInventoryHistory.utilization', 'Util.')}
              </span>
            </th>
            <th className="text-right py-1.5 px-1 text-muted-foreground font-medium">{t('cards:gpuInventoryHistory.allocFree', 'Alloc/Free')}</th>
          </tr>
        </thead>
        <tbody>
          {(paginatedRows || []).map((row, idx) => (
            <tr key={`${row.name}-${row.cluster}-${idx}`} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
              <td className="py-1.5 px-1 text-foreground truncate max-w-[120px]" title={row.name}>{row.name}</td>
              <td className="py-1.5 px-1 text-muted-foreground truncate max-w-[80px]" title={row.cluster}>{row.cluster}</td>
              <td className="py-1.5 px-1 text-muted-foreground truncate max-w-[100px]" title={row.gpuType}>{row.gpuType}</td>
              <td className="py-1.5 px-1 text-right">
                <span className={cn(
                  'font-medium',
                  row.utilizationPct >= HIGH_USAGE_PCT ? 'text-red-400' :
                  row.utilizationPct >= MEDIUM_USAGE_PCT ? 'text-yellow-400' : 'text-green-400',
                )}>
                  {row.utilizationPct}%
                </span>
              </td>
              <td className="py-1.5 px-1 text-right text-muted-foreground">
                {row.allocated}/{row.free}
              </td>
            </tr>
          ))}
          {(paginatedRows || []).length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-muted-foreground">
                {t('cards:gpuInventoryHistory.noMatchingNodes', 'No matching nodes')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {totalTablePages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-y-2 mt-2 text-xs text-muted-foreground">
          <span>{t('cards:gpuInventoryHistory.showing', 'Showing')} {tablePage * TABLE_PAGE_SIZE + 1}-{Math.min((tablePage + 1) * TABLE_PAGE_SIZE, (tableRows || []).length)} {t('cards:gpuInventoryHistory.of', 'of')} {(tableRows || []).length}</span>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(p => Math.max(0, p - 1))}
              disabled={tablePage === 0}
              className="px-2 py-0.5 rounded border border-border disabled:opacity-40 hover:bg-secondary/80 transition-colors"
            >
              {t('common:common.prev', 'Prev')}
            </button>
            <button
              onClick={() => onPageChange(p => Math.min(totalTablePages - 1, p + 1))}
              disabled={tablePage >= totalTablePages - 1}
              className="px-2 py-0.5 rounded border border-border disabled:opacity-40 hover:bg-secondary/80 transition-colors"
            >
              {t('common:common.next', 'Next')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
