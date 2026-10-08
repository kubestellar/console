/**
 * Shared dialog wrapper used by the Drasi Reactive Graph modals.
 */
import React, { useEffect } from 'react'
import { motion } from 'framer-motion'

/** Shared dialog wrapper — ESC to close, aria-modal, backdrop click. Modals
 *  are scoped inside the card container (absolute inset-0), not portaled to
 *  body (#7872). */
export function ModalShell({
  labelledBy,
  onClose,
  panelClassName,
  children,
  closeOnBackdrop = true,
}: {
  labelledBy: string
  onClose: () => void
  panelClassName: string
  children: React.ReactNode
  /** When false, clicking the backdrop does not close the modal. Defaults to true. */
  closeOnBackdrop?: boolean
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) onClose()
  }

  return (
    <motion.div
      className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleBackdropClick}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={panelClassName}
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}
