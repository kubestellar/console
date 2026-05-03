import { useTranslation } from 'react-i18next'
import { useChaosMeshStatus } from './useChaosMeshStatus'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { Activity, CheckCircle2, XCircle } from 'lucide-react'

export function ChaosMeshStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState, isDemoData } = useChaosMeshStatus()

  if (showSkeleton) {
    return (
      <>
        <SkeletonStats />
        <SkeletonList />
      </>
    )
  }

  if (showEmptyState || error) {
    return (
      <div className="card-empty-state">
        <p>{error ? t('chaosMeshStatus.fetchError') : t('chaosMeshStatus.notInstalled')}</p>
        <p className="hint">{t('chaosMeshStatus.notInstalledHint')}</p>
      </div>
    )
  }

  return (
    <div className="card-container relative">
      {isDemoData && <span className="demo-badge">Demo</span>}
      {isRefreshing && <span className="refresh-spinner" />}

      {/* Summary metrics */}
      <div className="card-metrics-row mb-6 mt-2 flex gap-4">
        <MetricTile label={t('chaosMeshStatus.totalExperiments')} value={data?.summary.totalExperiments} colorClass="text-foreground" icon={<Activity size={16} />} />
        <MetricTile label={t('chaosMeshStatus.running')} value={data?.summary.running} colorClass="text-blue-500" icon={<Activity size={16} />} />
        <MetricTile label={t('chaosMeshStatus.finished')} value={data?.summary.finished} colorClass="text-green-500" icon={<CheckCircle2 size={16} />} />
        <MetricTile label={t('chaosMeshStatus.failed')} value={data?.summary.failed} colorClass="text-red-500" icon={<XCircle size={16} />} />
      </div>

      {/* Experiments list */}
      <h3 className="card-section-title text-sm font-semibold mb-2">{t('chaosMeshStatus.sectionExperiments')}</h3>
      {data.experiments.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-4">{t('chaosMeshStatus.noExperiments')}</p>
      ) : (
        <div className="overflow-x-auto mb-6">
          <table className="card-table w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Namespace</th>
                <th className="pb-2 font-medium">Kind</th>
                <th className="pb-2 font-medium">Phase</th>
              </tr>
            </thead>
            <tbody>
              {(data.experiments || []).map(exp => (
                <tr key={`${exp.namespace}/${exp.name}`} className="border-b border-border/20 last:border-0">
                  <td className="py-2">{exp.name}</td>
                  <td className="py-2 text-muted-foreground">{exp.namespace}</td>
                  <td className="py-2 text-muted-foreground">{exp.kind}</td>
                  <td className="py-2">
                    <span className={`status-badge status-${exp.phase.toLowerCase()}`}>
                      {exp.phase}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Workflows list */}
      {data.workflows.length > 0 && (
        <>
          <h3 className="card-section-title text-sm font-semibold mb-2">{t('chaosMeshStatus.sectionWorkflows')}</h3>
          <div className="overflow-x-auto">
            <table className="card-table w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Namespace</th>
                  <th className="pb-2 font-medium">Phase</th>
                  <th className="pb-2 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {(data.workflows || []).map(wf => (
                  <tr key={`${wf.namespace}/${wf.name}`} className="border-b border-border/20 last:border-0">
                    <td className="py-2">{wf.name}</td>
                    <td className="py-2 text-muted-foreground">{wf.namespace}</td>
                    <td className="py-2">
                      <span className={`status-badge status-${wf.phase.toLowerCase()}`}>
                        {wf.phase}
                      </span>
                    </td>
                    <td className="py-2">{wf.progress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default ChaosMeshStatus
