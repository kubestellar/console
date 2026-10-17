import { Package, FileText, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { getConditionStyle, type CRDCondition, type CRDConditionStyle, type CRDInstance, type CRDVersion } from './CRDDrillDown.types'

interface OverviewTabProps {
  crdName: string
  crdKind: string
  crdGroup?: string
  crdScope: string
  statusStyle: CRDConditionStyle
  versions: CRDVersion[] | null
  instances: CRDInstance[] | null
  conditions: CRDCondition[] | null
}

export function CRDOverviewTab({
  crdName,
  crdKind,
  crdGroup,
  crdScope,
  statusStyle,
  versions,
  instances,
  conditions,
}: OverviewTabProps) {
  const { t } = useTranslation()
  const StatusIcon = statusStyle.icon

  return (
    <div className="space-y-6">
      {/* CRD Info Card */}
      <div className="p-4 rounded-lg bg-linear-to-r from-purple-500/10 to-purple-500/10 border border-purple-500/20">
        <div className="flex items-start gap-3">
          <Package className="w-8 h-8 text-purple-400 mt-1" />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">{crdKind}</h3>
            <p className="text-sm text-muted-foreground font-mono">{crdName}</p>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              {crdGroup && (
                <div className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  <span>Group: {crdGroup}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Database className="w-4 h-4" />
                <span>Scope: {crdScope}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className={cn('text-2xl font-bold', statusStyle.text)}>
            <StatusIcon className="w-8 h-8" />
          </div>
          <div className="text-xs text-muted-foreground mt-1">{t('common.status')}</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-2xl font-bold text-foreground">{versions?.length || '-'}</div>
          <div className="text-xs text-muted-foreground">Versions</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-2xl font-bold text-foreground">{instances?.length || '-'}</div>
          <div className="text-xs text-muted-foreground">Instances</div>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <div className="text-sm font-medium text-foreground">{crdScope}</div>
          <div className="text-xs text-muted-foreground">{t('common.scope')}</div>
        </div>
      </div>

      {/* Conditions */}
      {conditions && conditions.length > 0 && (
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <h4 className="text-sm font-medium text-foreground mb-3">{t('common.conditions')}</h4>
          <div className="space-y-2">
            {conditions.map((condition, i) => {
              const condStyle = getConditionStyle(condition.status)
              return (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-secondary/50">
                  <span className="text-sm text-foreground">{condition.type}</span>
                  <span className={cn('px-2 py-0.5 rounded text-xs', condStyle.bg, condStyle.text)}>
                    {condition.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
