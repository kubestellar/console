import { ReactNode, memo, createContext, use, ComponentType, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { safeLazy } from '../../lib/safeLazy'
import { Maximize2 } from 'lucide-react'
import { CARD_TITLES, CARD_DESCRIPTIONS, DEMO_EXEMPT_CARDS } from './cardMetadata'
import { BaseModal } from '../../lib/modals'
import { cn } from '@/lib/cn'
import { CardDataReportContext, ForceLiveContext } from './CardDataContext'
import { ChatMessage } from './CardChat'
import type { CardSkeletonProps } from '@/lib/cards/CardComponents'
import { CardErrorFallback, CardFailureBanner } from './CardErrorFallback'
import { CardLoadingState } from './CardLoadingState'
import { InstallCTAFlow } from './card-wrapper/InstallCTAFlow'
import { CardMeta } from './CardMeta'
import { CardToolbar } from './CardToolbar'
import { InfoTooltip } from './card-wrapper/InfoTooltip'
import { PendingSwapNotification } from './card-wrapper/PendingSwapNotification'
import { useCardWrapperState, type CardContainerSize } from './useCardWrapperState'
// Lazy-load the widget export modal (~42 KB + code generator ~30 KB) — only when user exports
const WidgetExportModal = safeLazy(() => import('../widgets/WidgetExportModal'), 'WidgetExportModal')
// Lazy-load the feedback modal (~67 KB) — only loaded when user clicks bug report
const FeatureRequestModal = safeLazy(() => import('../feedback/FeatureRequestModal'), 'FeatureRequestModal')

/** CSS container query style for card content responsive breakpoints */
const CONTAINER_QUERY_STYLE = { containerType: 'inline-size' } as const

// Cards that need extra-large expanded modal
const LARGE_EXPANDED_CARDS = new Set([
  'cluster_comparison', 'cluster_resource_tree',
  'kvcache_monitor', 'pd_disaggregation', 'llmd_ai_insights',
])

// Cards that should be nearly fullscreen when expanded
const FULLSCREEN_EXPANDED_CARDS = new Set([
  'cluster_locations', 'mobile_browser',
  'llmd_flow', 'epp_routing',
  'sudoku_game', 'container_tetris', 'node_invaders', 'kube_snake',
  'flappy_pod', 'kube_pong', 'kube_kong', 'game_2048', 'kube_man',
  'kube_galaga', 'kube_chess', 'checkers', 'pod_crosser', 'pod_brothers',
  'pod_pitfall', 'match_game', 'solitaire', 'kubedle', 'pod_sweeper',
  'kube_doom', 'kube_kart',
])

export type { CardContainerSize }
export type CardFlashType = 'none' | 'info' | 'warning' | 'error'

interface CardExpandedContextType {
  isExpanded: boolean
  containerSize: CardContainerSize
}
const CardExpandedContext = createContext<CardExpandedContextType>({
  isExpanded: false,
  containerSize: { width: 0, height: 0 } })

/** Hook for child components to know if their parent card is expanded and get container size */
export function useCardExpanded() {
  return use(CardExpandedContext)
}

const CardTypeContext = createContext<string>('')

/** Hook for shared UI components to read the cardType of their parent CardWrapper */
export function useCardType() {
  return use(CardTypeContext)
}

interface PendingSwap {
  newType: string
  newTitle?: string
  reason: string
  swapAt: Date
}

interface CardWrapperProps {
  cardId?: string
  cardType: string
  title?: string
  icon?: ComponentType<{ className?: string }>
  iconColor?: string
  lastSummary?: string
  pendingSwap?: PendingSwap
  chatMessages?: ChatMessage[]
  dragHandle?: ReactNode
  isRefreshing?: boolean
  lastUpdated?: Date | null
  isDemoData?: boolean
  isLive?: boolean
  forceLive?: boolean
  isFailed?: boolean
  consecutiveFailures?: number
  cardWidth?: number
  isCollapsed?: boolean
  flashType?: CardFlashType
  onCollapsedChange?: (collapsed: boolean) => void
  onSwap?: (newType: string) => void
  onSwapCancel?: () => void
  onConfigure?: () => void
  onRemove?: () => void
  onRefresh?: () => void
  onWidthChange?: (newWidth: number) => void
  cardHeight?: number
  onHeightChange?: (newHeight: number) => void
  onChatMessage?: (message: string) => Promise<ChatMessage>
  onChatMessagesChange?: (messages: ChatMessage[]) => void
  skeletonType?: CardSkeletonProps['type']
  skeletonRows?: number
  registerExpandTrigger?: (expand: () => void) => void
  children: ReactNode
}

// Re-export for backwards compatibility
export { CARD_TITLES, CARD_DESCRIPTIONS } from './cardMetadata'

export const CardWrapper = memo(function CardWrapper({
  cardId,
  cardType,
  title: customTitle,
  icon: Icon,
  iconColor,
  lastSummary,
  pendingSwap,
  chatMessages: externalMessages,
  dragHandle,
  isRefreshing,
  lastUpdated,
  isDemoData,
  isLive,
  forceLive,
  isFailed,
  consecutiveFailures,
  cardWidth,
  isCollapsed: externalCollapsed,
  flashType = 'none',
  onCollapsedChange,
  onSwap,
  onSwapCancel,
  onConfigure,
  onRemove,
  onRefresh,
  onWidthChange,
  cardHeight,
  onHeightChange,
  onChatMessage,
  onChatMessagesChange,
  skeletonType,
  skeletonRows,
  registerExpandTrigger,
  children }: CardWrapperProps) {

  const { t } = useTranslation(['cards', 'common'])

  const state = useCardWrapperState({
    cardId,
    cardType,
    customTitle,
    icon: Icon,
    iconColor,
    forceLive,
    flashType,
    isRefreshing,
    lastUpdated,
    isDemoData,
    isFailed,
    consecutiveFailures,
    pendingSwap,
    externalMessages,
    onCollapsedChange,
    onSwap,
    onSwapCancel,
    onRefresh,
    onChatMessage,
    onChatMessagesChange,
    registerExpandTrigger,
    skeletonType,
    externalCollapsed,
  })

  const {
    isExpanded, setIsExpanded, containerSize, expandedContentRef,
    showBugReport, openBugReport, closeBugReport,
    showWidgetExport, openWidgetExport, closeWidgetExport,
    isCollapsed, title, description, newTitle,
    ResolvedIcon, resolvedIconColor,
    isVisuallySpinning, shouldShowSkeleton, effectiveSkeletonType,
    showDemoIndicator, showInstallCta,
    effectiveIsLoading, effectiveIsFailed, effectiveConsecutiveFailures,
    effectiveErrorMessage, effectiveIsDemoData, effectiveLastUpdated,
    showHeaderRefreshIndicator,
    handleToggleCollapse, handleRefresh, handleLoadingTimeoutRetry,
    handleExpandFullscreen, handleOpenBugReport, handleSnooze, handleSwapNow,
    reportCtx, cardExpandedValue, forceLiveValue,
    flashKey, showSummary, setShowSummary,
    lazyRef, isVisible, getFlashClass,
    childDataState,
    cardLoadingTimedOut,
  } = state


  return (
    <CardTypeContext.Provider value={cardType}>
    <CardExpandedContext.Provider value={cardExpandedValue}>
      <ForceLiveContext.Provider value={forceLiveValue}>
      <CardDataReportContext.Provider value={reportCtx}>
        <>
          {/* Outer wrapper for demo corner brackets (outside card border) */}
          <div className={cn('relative', isCollapsed ? 'h-auto' : 'h-full')}>
            {showDemoIndicator && (
              <>
                <svg className="absolute -top-px -left-px w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
                  <defs><filter id="demo-rough"><feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="4" result="noise" /><feDisplacementMap in="SourceGraphic" in2="noise" scale="1" /></filter></defs>
                  <path d="M2 17 V9 C2 4.5 4.5 2 9 2 H17" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
                </svg>
                <svg className="absolute -top-px -right-px w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
                  <path d="M18 17 V9 C18 4.5 15.5 2 11 2 H3" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
                </svg>
                <svg className="absolute -bottom-px -left-px w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
                  <path d="M2 3 V11 C2 15.5 4.5 18 9 18 H17" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
                </svg>
                <svg className="absolute -bottom-px -right-px w-5 h-5 pointer-events-none z-10" viewBox="0 0 20 20" fill="none">
                  <path d="M18 3 V11 C18 15.5 15.5 18 11 18 H3" stroke="rgb(234 179 8 / 0.4)" strokeWidth="2.5" strokeLinecap="round" fill="none" filter="url(#demo-rough)" />
                </svg>
              </>
            )}
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
              shouldShowSkeleton && 'animate-card-refresh-pulse',
              getFlashClass()
            )}
            onMouseEnter={() => setShowSummary(true)}
            onMouseLeave={() => setShowSummary(false)}
          >
            {/* Header */}
            <div data-tour="card-header" className="flex flex-wrap items-center justify-between gap-y-2 border-b border-border/50 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                {dragHandle}
                {ResolvedIcon && <ResolvedIcon className={cn('h-4 w-4 shrink-0', resolvedIconColor)} />}
                <h2 className="truncate text-sm font-medium text-foreground">{title}</h2>
                <InfoTooltip text={description || t('messages.descriptionComingSoon', { title })} />
                <CardMeta
                  showDemoIndicator={showDemoIndicator}
                  isDemoData={effectiveIsDemoData}
                  isLive={isLive}
                  isFailed={effectiveIsFailed}
                  consecutiveFailures={effectiveConsecutiveFailures}
                  showRefreshIndicator={showHeaderRefreshIndicator}
                  isLoading={effectiveIsLoading}
                  isVisuallySpinning={isVisuallySpinning}
                  lastUpdated={effectiveLastUpdated}
                />
              </div>
              <CardToolbar
                title={title}
                isCollapsed={isCollapsed}
                onToggleCollapse={handleToggleCollapse}
                onRefresh={onRefresh ? handleRefresh : undefined}
                isRefreshDisabled={isRefreshing || isVisuallySpinning || effectiveIsLoading}
                isRefreshSpinning={isRefreshing || isVisuallySpinning || effectiveIsLoading}
                isFailed={effectiveIsFailed}
                consecutiveFailures={effectiveConsecutiveFailures}
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
            </div>

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

            {/* Demo-mode install CTA */}
            {!isCollapsed && showInstallCta && (
              <div className="shrink-0 px-4 pb-2">
                <InstallCTAFlow cardType={cardType} title={title} />
              </div>
            )}

            {/* Pending swap notification - hidden when collapsed */}
            {!isCollapsed && pendingSwap && (
              <PendingSwapNotification
                pendingSwap={pendingSwap}
                newTitle={newTitle}
                onSnooze={handleSnooze}
                onSwapNow={handleSwapNow}
                onCancel={() => onSwapCancel?.()}
                defaultSnoozeDurationMs={3600000}
              />
            )}

            {/* Hover summary */}
            {showSummary && lastSummary && (
              <div className="absolute bottom-full left-0 right-0 mb-2 mx-4 p-3 glass rounded-lg text-sm animate-fade-in-up">
                <p className="text-xs text-muted-foreground mb-1">{t('common:labels.sinceFocus')}</p>
                <p className="text-foreground">{lastSummary}</p>
              </div>
            )}
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
              <div ref={expandedContentRef} className="flex flex-1 min-h-0 flex-col">
                <CardErrorFallback cardId={cardId || cardType}>
                  {children}
                </CardErrorFallback>
              </div>
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
