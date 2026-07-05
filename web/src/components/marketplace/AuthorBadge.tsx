import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Coins } from 'lucide-react'
import { useAuthorProfile } from '../../hooks/useMarketplace'

export function AuthorBadge({ author, github, compact }: { author: string; github?: string; compact?: boolean }) {
  const [hovered, setHovered] = useState(false)
  const triggerRef = useRef<HTMLAnchorElement | HTMLSpanElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const profile = useAuthorProfile(github, hovered)

  const updatePos = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ x: rect.left + rect.width / 2, y: rect.top - 8 })
  }

  const handleEnter = () => {
    updatePos()
    setHovered(true)
  }

  // Dismiss tooltip on scroll (fix #6007).
  // The tooltip captures its position once on mouse enter and does not
  // track the trigger on scroll, so it detaches visually. Dismissing on
  // scroll matches user expectation (the cursor has left the trigger anyway).
  // Capture phase is used to catch scrolls in any nested container.
  useEffect(() => {
    if (!hovered) return
    const dismiss = () => setHovered(false)
    window.addEventListener('scroll', dismiss, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', dismiss, { capture: true })
  }, [hovered])

  if (!github) {
    return <span>{author}</span>
  }

  const link = (
    <a
      ref={triggerRef as React.RefObject<HTMLAnchorElement | null>}
      href={`https://github.com/${github}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary/80 hover:text-primary transition-colors hover:underline"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      @{github}
    </a>
  )

  if (compact) return link

  return (
    <>
      {link}
      {createPortal(
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15 }}
              className="fixed z-dropdown pointer-events-none"
              style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -100%)' }}
            >
              <div className="px-4 py-3 bg-background border border-border rounded-lg shadow-xl backdrop-blur-xs min-w-[200px]">
                <div className="flex items-center gap-3 mb-2">
                  <img
                    src={`https://github.com/${github}.png?size=80`}
                    alt={github}
                    className="w-10 h-10 rounded-full border border-border"
                    loading="lazy"
                    width={40}
                    height={40}
                  />
                  <div>
                    <div className="text-sm font-semibold text-white">@{github}</div>
                    <div className="text-2xs text-muted-foreground">Contributor</div>
                  </div>
                </div>
                {profile.loading ? (
                  <div className="text-xs text-muted-foreground">Loading stats...</div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Coins className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-yellow-300 font-medium">{profile.coins.toLocaleString()} coins</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {profile.consolePRs} PR{profile.consolePRs !== 1 ? 's' : ''} to console
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {profile.marketplacePRs} PR{profile.marketplacePRs !== 1 ? 's' : ''} to marketplace
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
