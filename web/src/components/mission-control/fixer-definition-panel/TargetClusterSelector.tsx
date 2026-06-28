import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { ChevronDown, Server, X as XIcon } from 'lucide-react'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useModalState } from '../../../lib/modals'
import { cn } from '../../../lib/cn'

const CLUSTER_CHIP_MIN_HEIGHT_PX = 40
const ENTER_KEY = 'Enter'
const ESCAPE_KEY = 'Escape'
const SPACE_KEY = ' '

interface TargetClusterSelectorProps {
  selected: string[]
  onChange: (clusters: string[]) => void
}

export function TargetClusterSelector({ selected, onChange }: TargetClusterSelectorProps) {
  const { availableClusters, clusterInfoMap } = useGlobalFilters()
  const { isOpen, close: closeDropdown, toggle: toggleDropdown } = useModalState()
  const dropdownId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const closeDropdownAndFocusTrigger = () => {
    closeDropdown()
    triggerRef.current?.focus()
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ENTER_KEY || event.key === SPACE_KEY) {
      event.preventDefault()
      toggleDropdown()
      return
    }

    if (event.key === ESCAPE_KEY && isOpen) {
      event.preventDefault()
      closeDropdownAndFocusTrigger()
    }
  }

  const handleDropdownKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === ESCAPE_KEY) {
      event.preventDefault()
      closeDropdownAndFocusTrigger()
    }
  }

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        closeDropdown()
      }
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [closeDropdown])

  useEffect(() => {
    const handler = (event: Event) => {
      if ((event as unknown as KeyboardEvent).key === ESCAPE_KEY && isOpen) {
        closeDropdown()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [closeDropdown, isOpen])

  const toggleCluster = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((clusterName) => clusterName !== name))
      return
    }

    onChange([...selected, name])
  }

  const isAllSelected = selected.length === 0 || selected.length === availableClusters.length
  const triggerLabel = isAllSelected
    ? 'Select target clusters'
    : `Edit target clusters, ${selected.length} selected`

  return (
    <div ref={ref} className="relative z-dropdown">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Target Clusters
      </label>
      <p className="text-xs text-muted-foreground/60 mt-0.5 mb-1">
        {isAllSelected
          ? 'All clusters — AI will analyze your full fleet'
          : `${selected.length} cluster${selected.length === 1 ? '' : 's'} selected — AI analysis scoped to these`}
      </p>

      <div
        className="relative mt-1 flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-secondary/30 hover:border-primary/30 transition-colors"
        style={{ minHeight: CLUSTER_CHIP_MIN_HEIGHT_PX }}
      >
        {selected.length === 0 ? (
          <button
            ref={triggerRef}
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-md text-left text-sm text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={toggleDropdown}
            onKeyDown={handleTriggerKeyDown}
            aria-controls={dropdownId}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label={triggerLabel}
          >
            <span className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              All clusters (click to scope)
            </span>
            <ChevronDown className={cn('w-4 h-4 shrink-0 transition-transform', isOpen && 'rotate-180')} />
          </button>
        ) : (
          <>
            {selected.map((name) => {
              const info = clusterInfoMap[name]
              const isHealthy = info?.healthy !== false && info?.reachable !== false

              return (
                <button
                  type="button"
                  key={name}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium',
                    isHealthy
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
                  )}
                  onClick={() => toggleCluster(name)}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', isHealthy ? 'bg-green-400' : 'bg-yellow-400')} />
                  {name}
                  <XIcon className="w-3 h-3 opacity-50 hover:opacity-100" />
                </button>
              )
            })}
            <button
              type="button"
              className="text-[10px] text-muted-foreground/50 hover:text-foreground"
              onClick={() => onChange([])}
            >
              Clear
            </button>
            <button
              ref={triggerRef}
              type="button"
              className="ml-auto inline-flex items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={toggleDropdown}
              onKeyDown={handleTriggerKeyDown}
              aria-controls={dropdownId}
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              aria-label={triggerLabel}
            >
              Edit selection
              <ChevronDown className={cn('w-4 h-4 shrink-0 transition-transform', isOpen && 'rotate-180')} />
            </button>
          </>
        )}
      </div>

      {isOpen && (
        <div
          id={dropdownId}
          role="listbox"
          aria-label="Target clusters"
          aria-multiselectable="true"
          className="absolute z-dropdown mt-1 w-64 max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
          onKeyDown={handleDropdownKeyDown}
        >
          <button
            type="button"
            role="option"
            aria-selected={isAllSelected}
            className={cn(
              'w-full px-3 py-2 text-left text-sm hover:bg-secondary/50 flex items-center gap-2 border-b border-border/50',
              isAllSelected && 'text-primary font-medium',
            )}
            onClick={() => {
              onChange([])
              closeDropdownAndFocusTrigger()
            }}
          >
            <Server className="w-3.5 h-3.5" />
            All clusters
            {isAllSelected && <span className="ml-auto text-primary">✓</span>}
          </button>

          {availableClusters.map((name) => {
            const info = clusterInfoMap[name]
            const isHealthy = info?.healthy !== false && info?.reachable !== false
            const isSelected = selected.includes(name)

            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                key={name}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-sm hover:bg-secondary/50 flex items-center gap-2',
                  isSelected && 'bg-primary/5',
                )}
                onClick={() => toggleCluster(name)}
              >
                <span className={cn('w-2 h-2 rounded-full shrink-0', isHealthy ? 'bg-green-400' : 'bg-yellow-400')} />
                <span className="truncate">{name}</span>
                {isSelected && <span className="ml-auto text-primary text-xs">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
