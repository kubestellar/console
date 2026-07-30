import { useEffect, useRef, useState } from 'react'

export interface CardContainerSize {
  width: number
  height: number
}

export function useResizeHandle(isExpanded: boolean) {
  const [containerSize, setContainerSize] = useState<CardContainerSize>({ width: 0, height: 0 })
  const expandedContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isExpanded) {
      setContainerSize({ width: 0, height: 0 })
      return
    }

    const el = expandedContentRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.round(entry.contentRect.width)
        const height = Math.round(entry.contentRect.height)
        setContainerSize((prev) => (
          prev.width === width && prev.height === height
            ? prev
            : { width, height }
        ))
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [isExpanded])

  return { containerSize, expandedContentRef }
}
