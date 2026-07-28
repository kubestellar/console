import { Search, Command } from 'lucide-react'
import { useFeatureHints } from '../../../hooks/useFeatureHints'
import { FeatureHintTooltip } from '../../ui/FeatureHintTooltip'
import { Input } from '../../ui/Input'

interface SearchInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>
  autoFocusOnMount: boolean
  value: string
  placeholder: string
  isSearchOpen: boolean
  onChange: (value: string) => void
  onOpenSearch: () => void
  onFocus: () => void
  onBlur: () => void
}

export function SearchInput({
  inputRef,
  autoFocusOnMount,
  value,
  placeholder,
  isSearchOpen,
  onChange,
  onOpenSearch,
  onFocus,
  onBlur,
}: SearchInputProps) {
  const cmdKHint = useFeatureHints('cmd-k')
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || '')
  const searchShortcut = isMac ? '⌘K' : 'Ctrl+K'

  return (
    <>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        ref={inputRef as React.Ref<HTMLInputElement>}
        type="text"
        id="global-search"
        name="global-search"
        data-testid="global-search-input"
        autoComplete="off"
        autoFocus={autoFocusOnMount}
        value={value}
        onChange={e => {
          onChange(e.target.value)
          onOpenSearch()
        }}
        onFocus={() => {
          onOpenSearch()
          cmdKHint.action()
          onFocus()
        }}
        onBlur={onBlur}
        placeholder={placeholder}
        className="pl-10 pr-16 py-2 bg-secondary rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50"
      />
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 px-1.5 py-0.5 text-xs text-muted-foreground bg-secondary rounded" aria-hidden="true">
        <Command className="w-3 h-3" /><span>K</span>
      </kbd>

      {cmdKHint.isVisible && !isSearchOpen && (
        <FeatureHintTooltip
          message={`Press ${searchShortcut} to search dashboards, cards, clusters, and more`}
          onDismiss={cmdKHint.dismiss}
          placement="bottom"
        />
      )}
    </>
  )
}
