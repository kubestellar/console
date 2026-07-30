import { Search, Layers, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

type GroupByMode = 'cluster' | 'type'

interface NamespaceFilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  groupBy: GroupByMode
  onGroupByChange: (mode: GroupByMode) => void
}

export function NamespaceFilterBar({
  searchQuery,
  onSearchChange,
  groupBy,
  onGroupByChange
}: NamespaceFilterBarProps) {
  const { t } = useTranslation()

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="w-full min-w-0 flex-1">
        <Input
          type="text"
          inputSize="lg"
          leadingIcon={<Search className="w-4 h-4" />}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('common.searchNamespaces')}
          className="min-w-0 focus:ring-blue-500/50"
        />
      </div>
      <div className="flex w-full flex-wrap items-center gap-1 rounded-lg bg-secondary/30 p-1 sm:w-auto sm:flex-nowrap sm:self-start">
        <Button
          onClick={() => onGroupByChange('cluster')}
          variant="ghost"
          size="md"
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors sm:flex-none ${groupBy === 'cluster'
            ? 'bg-blue-500/20 text-blue-400'
            : 'text-muted-foreground hover:text-foreground'
            }`}
          title="Group by cluster"
        >
          <Server className="w-4 h-4" />
          By Cluster
        </Button>
        <Button
          onClick={() => onGroupByChange('type')}
          variant="ghost"
          size="md"
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors sm:flex-none ${groupBy === 'type'
            ? 'bg-blue-500/20 text-blue-400'
            : 'text-muted-foreground hover:text-foreground'
            }`}
          title="Group by type (user/system)"
        >
          <Layers className="w-4 h-4" />
          By Type
        </Button>
      </div>
    </div>
  )
}
