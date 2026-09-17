/**
 * Shared presentational pieces used by every WorkloadImportDialog tab.
 */
import { AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ParsedResource } from './workloadImportDialog.utils'

export function ImportErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null
  return (
    <div className="mt-3 space-y-1">
      {errors.map((err, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{err}</span>
        </div>
      ))}
    </div>
  )
}

export function ImportPreviewTable({ resources }: { resources: ParsedResource[] }) {
  const { t } = useTranslation('cards')
  if (resources.length === 0) return null
  return (
    <div className="mt-3 border border-border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-secondary/50">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('workloadImport.previewKind')}</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('workloadImport.previewName')}</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('workloadImport.previewNamespace')}</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('workloadImport.previewImage')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {resources.map((r, i) => (
            <tr key={i} className="hover:bg-secondary/30">
              <td className="px-3 py-2 font-mono">{r.kind}</td>
              <td className="px-3 py-2 font-medium">{r.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.namespace}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[200px]">{r.image}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ImportSinglePreview({ resource }: { resource: ParsedResource | null }) {
  if (!resource) return null
  return <ImportPreviewTable resources={[resource]} />
}
