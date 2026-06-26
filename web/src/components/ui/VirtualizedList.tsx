import { useCallback, useRef, type CSSProperties, type MutableRefObject, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '../../lib/cn'

const DEFAULT_VIRTUALIZED_LIST_OVERSCAN = 6

interface VirtualizedListProps<T> {
  items: T[]
  estimateSize: () => number
  renderItem: (item: T, index: number) => ReactNode
  getItemKey?: (item: T, index: number) => string | number
  className?: string
  innerClassName?: string
  style?: CSSProperties
  scrollRef?: ((node: HTMLDivElement | null) => void) | MutableRefObject<HTMLDivElement | null>
  overscan?: number
  itemGap?: number
}

export function VirtualizedList<T>({
  items,
  estimateSize,
  renderItem,
  getItemKey,
  className,
  innerClassName,
  style,
  scrollRef,
  overscan = DEFAULT_VIRTUALIZED_LIST_OVERSCAN,
  itemGap = 0,
}: VirtualizedListProps<T>) {
  const scrollElementRef = useRef<HTMLDivElement | null>(null)

  const setScrollElement = useCallback((node: HTMLDivElement | null) => {
    scrollElementRef.current = node
    if (typeof scrollRef === 'function') {
      scrollRef(node)
      return
    }
    if (scrollRef) {
      scrollRef.current = node
    }
  }, [scrollRef])

  // TanStack Virtual manages its own measurement lifecycle; React Compiler skips memoizing this hook safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize,
    overscan,
  })

  return (
    <div ref={setScrollElement} className={cn('overflow-y-auto', className)} style={style}>
      <div
        className={cn('relative w-full', innerClassName)}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index]
          if (!item) return null

          return (
            <div
              key={String(getItemKey?.(item, virtualItem.index) ?? virtualItem.key)}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
                paddingBottom: itemGap,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
