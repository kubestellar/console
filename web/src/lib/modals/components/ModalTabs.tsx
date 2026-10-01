/**
 * ModalTabs — tab bar sub-component for BaseModal.
 *
 * Renders a horizontal role="tablist" with arrow-key navigation.
 */

import { ModalTabsProps } from '../types'
import { moveFocusByKey } from '../../a11y/rovingFocus'

export function ModalTabs({
  tabs,
  activeTab,
  onTabChange,
  className = '',
}: ModalTabsProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const nextTab = moveFocusByKey(e, { selector: '[role="tab"]:not([disabled])', orientation: 'horizontal' })
    const nextTabId = nextTab?.dataset.tabId
    if (nextTabId) onTabChange(nextTabId)
  }
  return (
    <div role="tablist" onKeyDown={handleKeyDown} className={`flex border-b border-border ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        const Icon = tab.icon

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab-id={tab.id}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              isActive
                ? 'text-purple-400 border-purple-400 bg-purple-500/5'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            }`}
          >
            {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded text-xs ${
                  isActive
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
