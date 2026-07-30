import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { PodInfo } from './useReplicaSetDrillDown'
import { Tag, Box, Info, Activity, FileText, Code } from 'lucide-react'

export type ReplicaSetTab = 'overview' | 'events' | 'describe' | 'yaml'

interface TabBarProps {
  activeTab: ReplicaSetTab
  onTabChange: (tab: ReplicaSetTab) => void
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const { t } = useTranslation()

  const tabs = [
    { id: 'overview' as const, label: t('drilldown.overview', 'Overview'), icon: Info },
    { id: 'events' as const, label: t('drilldown.events', 'Events'), icon: Activity },
    { id: 'describe' as const, label: t('drilldown.describe', 'Describe'), icon: FileText },
    { id: 'yaml' as const, label: t('drilldown.yaml', 'YAML'), icon: Code },
  ]

  return (
    <div className="flex gap-1 border-b border-border pb-2 mb-4">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-t text-xs font-medium transition-colors',
            activeTab === tab.id
              ? 'bg-primary/10 text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          )}
        >
          <tab.icon className="w-3.5 h-3.5" />
          {tab.label}
        </button>
      ))}
    </div>
  )
}

interface HeaderProps {
  replicas: number
  readyReplicas: number
  replicasetName: string
}

export function Header({ replicas, readyReplicas, replicasetName }: HeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2.5 rounded-lg bg-cyan-500/20">
        <Box className="w-6 h-6 text-cyan-400" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{replicasetName}</h2>
        <p className="text-sm text-muted-foreground">
          ReplicaSet · {readyReplicas}/{replicas} ready
        </p>
      </div>
    </div>
  )
}

interface LabelsProps {
  labels: Record<string, string>
}

export function LabelsSection({ labels }: LabelsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Tag className="w-4 h-4 text-yellow-400" />
        {t('drilldown.labels', 'Labels')}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(labels).map(([key, value]) => (
          <span
            key={key}
            className="px-2 py-1 rounded bg-secondary/50 text-xs font-mono text-foreground"
          >
            {key}={value}
          </span>
        ))}
      </div>
    </div>
  )
}

interface PodListProps {
  pods: PodInfo[]
  onPodClick: (podName: string) => void
}

export function PodList({ pods, onPodClick }: PodListProps) {
  const { t } = useTranslation()

  if (pods.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Box className="w-4 h-4 text-blue-400" />
        {t('drilldown.pods', 'Pods')} ({pods.length})
      </h3>
      <div className="space-y-1">
        {pods.map(pod => (
          <button
            key={pod.name}
            onClick={() => onPodClick(pod.name)}
            className="w-full flex items-center justify-between p-2 rounded bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-mono text-foreground">{pod.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium',
                  pod.status === 'Running' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                )}
              >
                {pod.status}
              </span>
              {pod.restarts > 0 && (
                <span className="text-xs text-muted-foreground">
                  {pod.restarts} restart{pod.restarts !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

interface CopyButtonProps {
  text: string
  field: string
  copiedField: string | null
  onCopy: (field: string, value: string) => void
}

export function CopyButton({ text, field, copiedField, onCopy }: CopyButtonProps) {
  const { t } = useTranslation()

  return (
    <button
      onClick={() => onCopy(field, text)}
      className={cn(
        'absolute top-2 right-2 p-1.5 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors',
        copiedField === field && 'text-green-400'
      )}
      title={t('drilldown.copyToClipboard', 'Copy to clipboard')}
    >
      {copiedField === field ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  )
}
