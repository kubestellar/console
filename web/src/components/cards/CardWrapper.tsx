import { memo, Suspense } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { Maximize2 } from 'lucide-react'
import { CARD_TITLES } from './cardMetadata'
import { BaseModal } from '../../lib/modals'
import { cn } from '@/lib/cn'
import { CardDataReportContext, ForceLiveContext } from './CardDataContext'
import { CardFailureBanner } from './CardErrorFallback'
import { CardLoadingState } from './CardLoadingState'
import { CardHeader } from './CardHeader'
import { CardFooter } from './CardFooter'
import { CardErrorBoundary } from './CardErrorBoundary'
import type { CardWrapperProps } from './CardWrapper.types'
import {
  CONTAINER_QUERY_STYLE,
  DEFAULT_SNOOZE_MS,
  LARGE_EXPANDED_CARDS,
  FULLSCREEN_EXPANDED_CARDS,
} from './CardWrapper.constants'
import { CardExpandedContext, CardTypeContext } from './CardWrapper.contexts'
import { CardDemoBrackets } from './CardDemoBrackets'
import { useCardWrapperState } from './useCardWrapperState'

// Re-exports for backwards compatibility — implementations now live in
// CardWrapper.contexts.ts, CardWrapper.useLazyMount.ts and CardWrapper.types.ts
export { useCardExpanded, useCardType } from './CardWrapper.contexts'
export { useLazyMount } from './CardWrapper.useLazyMount'
export type { CardFlashType, PendingSwap, CardWrapperProps } from './CardWrapper.types'
// Lazy-load the widget export modal (~42 KB + code generator ~30 KB) — only when user exports
const WidgetExportModal = safeLazy(() => import('../widgets/WidgetExportModal'), 'WidgetExportModal')
// Lazy-load the feedback modal (~67 KB) — only loaded when user clicks bug report
const FeatureRequestModal = safeLazy(() => import('../feedback/FeatureRequestModal'), 'FeatureRequestModal')


// Re-export for backwards compatibility — data now lives in cardMetadata.ts and cardIcons.ts
export { CARD_TITLES, CARD_DESCRIPTIONS } from './cardMetadata'

export const CardWrapper = memo(function CardWrapper(props: CardWrapperProps) {
  const {
    cardId,
    cardType,
    dragHandle,
    isRefreshing,
    isLive,
    cardWidth,
    cardHeight,
    onConfigure,
    onRemove,
    onRefresh,
    onWidthChange,
    onHeightChange,
    onSwapCancel,
    pendingSwap,
    lastSummary,
    skeletonRows,
    children,
  } = props

  const {
    t,
    isExpanded,
    setIsExpanded,
    expandedContentRef,
    showBugReport,
    closeBugReport,
    showWidgetExport,
    openWidgetExport,
    closeWidgetExport,
    lazyRef,
    isVisible,
    flashKey,
    flashClass,
    isVisuallySpinning,
    childDataState,
    cardLoadingTimedOut,
    isCollapsed,
    showSummary,
    setShowSummary,
    reportCtx,
    effectiveIsFailed,
    effectiveConsecutiveFailures,
    effectiveErrorMessage,
    effectiveIsLoading,
    effectiveIsDemoData,
    showDemoIndicator,
    forceSkeletonForOffline,
    effectiveSkeletonType,
    shouldShowSkeleton,
    effectiveLastUpdated,
    showHeaderRefreshIndicator,
    showInstallCta,
    title,
    description,
    newTitle,
    ResolvedIcon,
    resolvedIconColor,
    handleSnooze,
    handleSwapNow,
    handleToggleCollapse,
    handleRefresh,
    handleLoadingTimeoutRetry,
    handleExpandFullscreen,
    handleOpenBugReport,
    cardExpandedValue,
    forceLiveValue,
    headerT,
  } = useCardWrapperState(props)

  return (
    <CardTypeContext.Provider value={cardType}>
    <CardExpandedContext.Provider value={cardExpandedValue}>
      <ForceLiveContext.Provider value={forceLiveValue}>
      <CardDataReportContext.Provider value={reportCtx}>
        <>
          {/* Outer wrapper for demo corner brackets (outside card border) */}
          <div className={cn('relative', isCollapsed ? 'h-auto' : 'h-full')}>
            {showDemoIndicator && <CardDemoBrackets />}
          {/* Main card */}
          <div
            ref={lazyRef}
            key={flashKey}
            data-tour="card"
            data-card-type={cardType}
            data-card-id={cardId}
            data-loading={shouldShowSkeleton ? 'true' : 'false'}
            data-effective-loading={effectiveIsLoading ? 'true' : 'false'}
            aria-label={title}
            aria-busy={effectiveIsLoading}
            className={cn(
              'glass rounded-xl overflow-hidden card-hover',
              'flex flex-col transition-all duration-200',
              isCollapsed ? 'h-auto' : 'h-full',
              // Only pulse during initial skeleton display, not background refreshes (prevents flicker)
              shouldShowSkeleton && !forceSkeletonForOffline && 'animate-card-refresh-pulse',
              flashClass
            )}
            onMouseEnter={() => setShowSummary(true)}
            onMouseLeave={() => setShowSummary(false)}
          >
            <CardHeader
              dragHandle={dragHandle}
              resolvedIcon={ResolvedIcon}
              resolvedIconColor={resolvedIconColor}
              title={title}
              description={description}
              t={headerT}
              showDemoIndicator={showDemoIndicator}
              effectiveIsDemoData={effectiveIsDemoData}
              isLive={isLive}
              effectiveIsFailed={effectiveIsFailed}
              effectiveConsecutiveFailures={effectiveConsecutiveFailures}
              showHeaderRefreshIndicator={showHeaderRefreshIndicator}
              effectiveIsLoading={effectiveIsLoading}
              isVisuallySpinning={isVisuallySpinning}
              effectiveLastUpdated={effectiveLastUpdated}
              isCollapsed={isCollapsed}
              onToggleCollapse={handleToggleCollapse}
              onRefresh={onRefresh ? handleRefresh : undefined}
              isRefreshDisabled={isRefreshing || isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline}
              isRefreshSpinning={isRefreshing || isVisuallySpinning || effectiveIsLoading || forceSkeletonForOffline}
              onExpandFullscreen={handleExpandFullscreen}
              onOpenBugReport={handleOpenBugReport}
              cardId={cardId}
              cardType={cardType}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              onConfigure={onConfigure}
              onRemove={onRemove}
              onWidthChange={onWidthChange}
              onHeightChange={onHeightChange}
              onShowWidgetExport={openWidgetExport}
            />

            <CardFailureBanner
              cardType={cardType}
              isFailed={effectiveIsFailed}
              isCollapsed={isCollapsed}
              consecutiveFailures={effectiveConsecutiveFailures}
              errorMessage={effectiveErrorMessage}
              onRefresh={onRefresh}
              onRemove={onRemove}
              isRefreshing={isRefreshing}
              isVisuallySpinning={isVisuallySpinning}
            />

            {/* Content - hidden when collapsed, lazy loaded when visible or expanded */}
            {!isCollapsed && (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden scroll-enhanced p-4">
                {/* Container query boundary — cards use @container breakpoints
                    instead of viewport breakpoints so layouts respond to actual
                    card width (which shrinks when side panels expand).
                    Must be INSIDE a non-visible overflow ancestor (CSS spec:
                    container-type requires overflow != visible on ancestor). */}
                <div className="@container flex min-h-0 flex-1 flex-col" style={CONTAINER_QUERY_STYLE}>
                  <CardLoadingState
                    cardId={cardId || cardType}
                    isVisible={isVisible}
                    isExpanded={isExpanded}
                    shouldShowSkeleton={shouldShowSkeleton}
                    skeletonType={effectiveSkeletonType}
                    skeletonRows={skeletonRows || 3}
                    cardLoadingTimedOut={cardLoadingTimedOut}
                    childDataState={childDataState}
                    onRefresh={onRefresh}
                    onRemove={onRemove}
                    onLoadingTimeoutRetry={onRefresh ? handleLoadingTimeoutRetry : undefined}
                    isRefreshing={isRefreshing}
                    isVisuallySpinning={isVisuallySpinning}
                  >
                    {children}
                  </CardLoadingState>
                </div>{/* Close @container query boundary */}

              </div>
            )}

            <CardFooter
              isCollapsed={isCollapsed}
              showInstallCta={showInstallCta}
              cardType={cardType}
              title={title}
              pendingSwap={pendingSwap}
              newTitle={newTitle}
              defaultSnoozeDurationMs={DEFAULT_SNOOZE_MS}
              onSnooze={handleSnooze}
              onSwapNow={handleSwapNow}
              onSwapCancel={onSwapCancel}
              showSummary={showSummary}
              lastSummary={lastSummary}
              summaryLabel={t('common:labels.sinceFocus')}
            />
          </div>
          </div>{/* Close outer wrapper for demo corner brackets */}

          {/* Expanded modal */}
          <BaseModal
            isOpen={isExpanded}
            onClose={() => setIsExpanded(false)}
            size={FULLSCREEN_EXPANDED_CARDS.has(cardType) ? 'full' : LARGE_EXPANDED_CARDS.has(cardType) ? 'xl' : 'lg'}
            testId="drilldown-modal"
          >
            <BaseModal.Header
              title={title}
              icon={Maximize2}
              onClose={() => setIsExpanded(false)}
              onBack={() => setIsExpanded(false)}
              showBack={true}
              closeTestId="drilldown-close"
              backTestId="drilldown-back"
              tabsTestId="drilldown-tabs"
            />
            <BaseModal.Content className={cn(
              'overflow-auto scroll-enhanced flex flex-col',
              FULLSCREEN_EXPANDED_CARDS.has(cardType)
                ? 'h-[calc(98vh-80px)]'
                : LARGE_EXPANDED_CARDS.has(cardType)
                  ? 'h-[calc(95vh-80px)]'
                  : 'max-h-[calc(80vh-80px)]'
            )}>
              {/* Wrapper ensures children fill available space in expanded mode */}
              <CardErrorBoundary containerRef={expandedContentRef} cardId={cardId || cardType}>
                {children}
              </CardErrorBoundary>
            </BaseModal.Content>
          </BaseModal>

          {/* Widget Export Modal */}
          {showWidgetExport && (
            <Suspense fallback={null}>
              <WidgetExportModal
                isOpen={showWidgetExport}
                onClose={closeWidgetExport}
                cardType={cardType}
              />
            </Suspense>
          )}

          {/* Per-card bug/feature report modal */}
          {showBugReport && (
            <Suspense fallback={null}>
              <FeatureRequestModal
                isOpen={showBugReport}
                onClose={closeBugReport}
                initialTab="submit"
                initialContext={{
                  cardType,
                  cardTitle: title || CARD_TITLES[cardType] || cardType }}
              />
            </Suspense>
          )}
        </>
      </CardDataReportContext.Provider>
      </ForceLiveContext.Provider>
    </CardExpandedContext.Provider>
    </CardTypeContext.Provider>
  )
})
