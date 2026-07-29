import { useEffect, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDrillDown } from '../../hooks/useDrillDown'
import { useMobile } from '../../hooks/useMobile'
import { Button } from '../ui/Button'
import { useEscapeLayer } from '../../lib/modals'
import { renderDrillDownView } from './DrillDownModal.views'
import { DrillDownLoading, DrillDownErrorBoundary, DrillDownBreadcrumbs, DrillDownFooterHints } from './DrillDownModal.parts'

export function DrillDownModal() {
  const { t } = useTranslation()
  const { state, pop, goTo, close } = useDrillDown()
  const { isMobile } = useMobile()
  const isTopEscapeLayer = useEscapeLayer(state.isOpen)

  // Disable body scroll when modal is open
  useEffect(() => {
    if (state.isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [state.isOpen])

  // Keyboard shortcuts
  useEffect(() => {
    if (!state.isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const isNavigationKey = e.key === 'Escape' || e.key === 'Backspace' || e.key === ' '
      if (isNavigationKey && !isTopEscapeLayer()) return

      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          close()
          break
        case 'Backspace':
        case ' ': // Space
          e.preventDefault()
          if (state.stack.length > 1) {
            pop()
          } else {
            close()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.isOpen, state.stack.length, close, pop, isTopEscapeLayer])

  if (!state.isOpen || !state.currentView) return null

  // Get current view - we've already checked it's not null above
  const currentView = state.currentView

  // Render the modal at document.body so it sits after the Layout sidebar
  // in DOM order. Both the sidebar and drill-down use z-modal; with equal
  // z-index the later sibling paints on top. Without the portal, the
  // sidebar (rendered inside Layout, which mounts after DrillDownModal in
  // the React tree) visually overlaps the drill-down's left edge — e.g.
  // hiding the back button and the start of the breadcrumb on a narrow
  // window. The portal guarantees drill-downs always render after the
  // chrome regardless of where the component is mounted in the tree.
  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-modal p-2 md:p-4"
      onClick={close}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          close()
        }
      }}
      aria-hidden="true"
    >
      <div
        data-testid="drilldown-modal"
        className="glass w-full md:w-[90vw] max-w-[1200px] h-[95vh] md:h-[80vh] rounded-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={currentView.title}
      >
        {/* Header with breadcrumbs */}
        <div className="flex items-center justify-between p-3 md:p-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Back button - always visible; closes modal at root level */}
            <Button
              data-testid="drilldown-back"
              variant="ghost"
              size="sm"
              onClick={state.stack.length > 1 ? pop : close}
              className="p-2 hover:bg-card/50"
              title={state.stack.length > 1 ? t('drilldown.goBack') : t('drilldown.close')}
              aria-label={state.stack.length > 1 ? t('drilldown.goBack') : t('drilldown.close')}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>

            {/* Breadcrumbs */}
            <DrillDownBreadcrumbs
              stack={state.stack}
              goTo={goTo}
              navigationHistoryLabel={t('drilldown.navigationHistory', 'Navigation history')}
              navigateToLabel={(title) => t('drilldown.navigateTo', 'Navigate to {{title}}', { title })}
            />
          </div>

          {/* Close button */}
          <Button
            data-testid="drilldown-close"
            variant="ghost"
            size="sm"
            onClick={close}
            className="p-2 hover:bg-card/50"
            aria-label={t('drilldown.close')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        {/* Content */}
        <div id={`drilldown-panel-${state.stack.length - 1}`} role="tabpanel" tabIndex={0} aria-labelledby={`drilldown-tab-${state.stack.length - 1}`} className="flex-1 overflow-y-auto p-4 md:p-6">
          <DrillDownErrorBoundary onClose={close}>
            <Suspense fallback={<DrillDownLoading />}>
              {renderDrillDownView(currentView, t('drilldown.unknownViewType'), t('drilldown.customView'))}
            </Suspense>
          </DrillDownErrorBoundary>
        </div>

        {/* Footer with keyboard hints - hidden on mobile */}
        {!isMobile && <DrillDownFooterHints showBackHint={state.stack.length > 1} />}
      </div>
    </div>,
    document.body
  )
}
