import { useTranslation } from 'react-i18next'
import { SearchInput } from './SearchInput'
import { SearchResultsPanel } from './SearchResultsPanel'
import { RecentSearchesList } from './RecentSearchesList'
import { useSearchDropdownState } from './useSearchDropdownState'

interface SearchDropdownProps {
  autoFocusOnMount?: boolean
}

export function SearchDropdown({ autoFocusOnMount = false }: SearchDropdownProps) {
  const { t } = useTranslation()
  const {
    searchQuery,
    setSearchQuery,
    isSearchOpen,
    openSearch,
    selectedIndex,
    searchRef,
    inputRef,
    resultsRef,
    isResultsPanelActive,
    handleSelect,
    handleAskAI,
    handleResultsChange,
    handleInputFocus,
    handleInputBlur,
  } = useSearchDropdownState()

  return (
    <div data-tour="search" data-testid="global-search" className="flex-1 min-w-0" ref={searchRef}>
      <div className="relative">
        <SearchInput
          inputRef={inputRef}
          autoFocusOnMount={autoFocusOnMount}
          value={searchQuery}
          placeholder={t('layout.navbar.searchPlaceholder')}
          isSearchOpen={isSearchOpen}
          onChange={setSearchQuery}
          onOpenSearch={openSearch}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
        />

        {isResultsPanelActive && (
          <SearchResultsPanel
            searchQuery={searchQuery}
            selectedIndex={selectedIndex}
            onSelect={handleSelect}
            onAskAI={handleAskAI}
            resultsRef={resultsRef}
            onResultsChange={handleResultsChange}
          />
        )}

        <RecentSearchesList isOpen={isSearchOpen} query={searchQuery} />
      </div>
    </div>
  )
}
