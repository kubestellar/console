import { useTranslation } from 'react-i18next'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'

interface ClusterFilterBarProps {
  sortBy: string
  onSortByChange: (sort: string) => void
  searchTerm: string
  onSearchTermChange: (term: string) => void
  filterByStatus: string
  onFilterByStatusChange: (status: string) => void
}

export function ClusterFilterBar({
  sortBy,
  onSortByChange,
  searchTerm,
  onSearchTermChange,
  filterByStatus,
  onFilterByStatusChange,
}: ClusterFilterBarProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="flex gap-3 flex-wrap mb-4">
      <Input
        type="text"
        placeholder={t('common.search')}
        value={searchTerm}
        onChange={(e) => onSearchTermChange(e.target.value)}
        className="flex-1 min-w-[200px]"
      />

      <Select value={sortBy} onValueChange={onSortByChange}>
        <option value="name">{t('clusters.sortBy.name')}</option>
        <option value="gpuCount">{t('clusters.sortBy.gpuCount')}</option>
        <option value="allocated">{t('clusters.sortBy.allocated')}</option>
      </Select>

      <Select value={filterByStatus} onValueChange={onFilterByStatusChange}>
        <option value="">{t('common.all')}</option>
        <option value="healthy">{t('clusters.status.healthy')}</option>
        <option value="degraded">{t('clusters.status.degraded')}</option>
      </Select>
    </div>
  )
}
