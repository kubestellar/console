import { ReactNode, useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/cn'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  className?: string
  delayMs?: number
}

export function Tooltip({ content, children, className, delayMs = 300 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = () => {
    timeoutRef.current = window.setTimeout(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const tooltipWidth = 240 // approximate width
        const tooltipHeight = 100 // approximate height
        
        // Calculate position (try to center above the element)
        let left = rect.left + rect.width / 2 - tooltipWidth / 2
        let top = rect.top - tooltipHeight - 8
        
        // Adjust if tooltip would go off-screen
        if (left < 8) left = 8
        if (left + tooltipWidth > window.innerWidth - 8) {
          left = window.innerWidth - tooltipWidth - 8
        }
        if (top < 8) {
          // If no room above, show below
          top = rect.bottom + 8
        }
        
        setPosition({ top, left })
        setIsVisible(true)
      }
    }, delayMs)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      <div
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-block"
      >
        {children}
      </div>
      {isVisible && position && (
        <div
          ref={tooltipRef}
          className={cn(
            'fixed z-50 rounded-lg border border-border bg-secondary/95 backdrop-blur-sm px-3 py-2 text-sm shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-200',
            className
          )}
          style={{ top: position.top, left: position.left }}
        >
          {content}
        </div>
      )}
    </>
  )
}
