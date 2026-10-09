import { Users, Key, Lock, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Select } from '../ui/Select'
import type { RBACItem } from './NamespaceRBAC.utils'

interface RBACSelectorsProps {
  clusters: Array<{ name: string }>
  namespaces: string[]
  selectedCluster: string
  selectedNamespace: string
  onClusterChange: (cluster: string) => void
  onNamespaceChange: (namespace: string) => void
}

export function RBACSelectors({
  clusters,
  namespaces,
  selectedCluster,
  selectedNamespace,
  onClusterChange,
  onNamespaceChange,
}: RBACSelectorsProps) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div className="flex gap-2 mb-4">
      <div className="flex-1">
        <Select
          value={selectedCluster}
          onChange={(e) => onClusterChange(e.target.value)}
        >
          <option value="">{t('namespaceRBAC.selectCluster')}</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </Select>
      </div>
      <div className="flex-1">
        <Select
          value={selectedNamespace}
          onChange={(e) => onNamespaceChange(e.target.value)}
          disabled={!selectedCluster}
        >
          <option value="">{t('namespaceRBAC.selectNamespace')}</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </Select>
      </div>
    </div>
  )
}

interface RBACListItemProps {
  item: RBACItem
  activeTab: 'roles' | 'bindings' | 'serviceaccounts'
  isFetching: boolean
  onClick: () => void
}

export function RBACListItem({ item, activeTab, isFetching, onClick }: RBACListItemProps) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors group ${isFetching ? 'opacity-50' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-2">
          {activeTab === 'roles' && <Key className="w-4 h-4 text-yellow-400" />}
          {activeTab === 'bindings' && <Lock className="w-4 h-4 text-green-400" />}
          {activeTab === 'serviceaccounts' && <Users className="w-4 h-4 text-blue-400" />}
          <span className="text-sm text-foreground group-hover:text-purple-400">{item.name}</span>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      {item.rules && (
        <p className="text-xs text-muted-foreground mt-1 ml-6">
          {t('namespaceRBAC.nRulesCount', { count: item.rules })}
        </p>
      )}
      {item.subjects && (
        <p className="text-xs text-muted-foreground mt-1 ml-6">
          {t('namespaceRBAC.subjects')}: {(item.subjects || []).join(', ')}
        </p>
      )}
    </div>
  )
}
