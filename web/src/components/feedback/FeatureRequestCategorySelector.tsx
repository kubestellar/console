import type { TabType } from './FeatureRequestTypes'

interface FeatureRequestCategorySelectorProps {
  activeTab: TabType
  draftCount: number
  requestCount: number
  onTabChange: (tab: TabType) => void
  submitLabel: string
  updatesLabel: string
}

export function FeatureRequestCategorySelector({
  activeTab,
  draftCount,
  requestCount,
  onTabChange,
  submitLabel,
  updatesLabel,
}: FeatureRequestCategorySelectorProps) {
  return (
    <div className="flex border-b border-border shrink-0">
      <button
        onClick={() => onTabChange('submit')}
        className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
          activeTab === 'submit'
            ? 'text-foreground border-b-2 border-purple-500'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {submitLabel}
      </button>
      <button
        onClick={() => onTabChange('drafts')}
        className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          activeTab === 'drafts'
            ? 'text-foreground border-b-2 border-purple-500'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Drafts
        {draftCount > 0 && (
          <span className="min-w-5 h-5 px-1 text-xs rounded-full bg-orange-500 text-white flex items-center justify-center">
            {draftCount}
          </span>
        )}
      </button>
      <button
        onClick={() => onTabChange('updates')}
        className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          activeTab === 'updates'
            ? 'text-foreground border-b-2 border-purple-500'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {updatesLabel}
        {requestCount > 0 && (
          <span className="min-w-5 h-5 px-1 text-xs rounded-full bg-purple-500 text-white flex items-center justify-center">
            {requestCount}
          </span>
        )}
      </button>
    </div>
  )
}
