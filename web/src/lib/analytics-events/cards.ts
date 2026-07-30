import { send } from '../analytics-core'

// ── Dashboard & Cards ──────────────────────────────────────────────

export function emitCardAdded(cardType: string, source: string) {
  send('ksc_card_added', { card_type: cardType, source })
}

export function emitCardRemoved(cardType: string) {
  send('ksc_card_removed', { card_type: cardType })
}

export function emitCardExpanded(cardType: string) {
  send('ksc_card_expanded', { card_type: cardType })
}

export function emitCardDragged(cardType: string) {
  send('ksc_card_dragged', { card_type: cardType })
}

export function emitCardConfigured(cardType: string) {
  send('ksc_card_configured', { card_type: cardType })
}

export function emitCardReplaced(oldType: string, newType: string) {
  send('ksc_card_replaced', { old_type: oldType, new_type: newType })
}

// ── Global Search (Cmd+K) ──────────────────────────────────────────

export function emitGlobalSearchOpened(method: 'keyboard' | 'click') {
  send('ksc_global_search_opened', { method })
}

export function emitGlobalSearchQueried(queryLength: number, resultCount: number) {
  send('ksc_global_search_queried', { query_length: queryLength, result_count: resultCount })
}

export function emitGlobalSearchSelected(category: string, resultIndex: number) {
  send('ksc_global_search_selected', { category, result_index: resultIndex })
}

export function emitGlobalSearchAskAI(queryLength: number) {
  send('ksc_global_search_ask_ai', { query_length: queryLength })
}

// ── Card framework-level (Interactions) ───────────────────────────

export function emitCardSortChanged(sortField: string, cardType: string) {
  send('ksc_card_sort_changed', { sort_field: sortField, card_type: cardType, page_path: window.location.pathname })
}

export function emitCardSortDirectionChanged(direction: string, cardType: string) {
  send('ksc_card_sort_direction_changed', { direction, card_type: cardType, page_path: window.location.pathname })
}

export function emitCardLimitChanged(limit: string, cardType: string) {
  send('ksc_card_limit_changed', { limit, card_type: cardType, page_path: window.location.pathname })
}

export function emitCardSearchUsed(queryLength: number, cardType: string) {
  send('ksc_card_search_used', { query_length: queryLength, card_type: cardType, page_path: window.location.pathname })
}

export function emitCardClusterFilterChanged(selectedCount: number, totalCount: number, cardType: string) {
  send('ksc_card_cluster_filter_changed', {
    selected_count: selectedCount,
    total_count: totalCount,
    card_type: cardType,
    page_path: window.location.pathname,
  })
}

export function emitCardPaginationUsed(page: number, totalPages: number, cardType: string) {
  send('ksc_card_pagination_used', { page, total_pages: totalPages, card_type: cardType, page_path: window.location.pathname })
}

export function emitCardListItemClicked(cardType: string) {
  send('ksc_card_list_item_clicked', { card_type: cardType, page_path: window.location.pathname })
}

// ── Card Recommendations ────────────────────────────────────────────

export function emitCardRecommendationsShown(cardCount: number, highPriorityCount: number) {
  send('ksc_card_recommendations_shown', { card_count: cardCount, high_priority_count: highPriorityCount })
}

export function emitCardRecommendationActioned(cardType: string, priority: string) {
  send('ksc_card_recommendation_actioned', { card_type: cardType, priority })
}

// ── Add Card Modal ────

export function emitAddCardModalOpened() {
  send('ksc_add_card_modal_opened')
}

export function emitAddCardModalAbandoned() {
  send('ksc_add_card_modal_abandoned')
}

export function emitCardCategoryBrowsed(category: string) {
  send('ksc_card_category_browsed', { category })
}

export function emitRecommendedCardShown(cardTypes: string[]) {
  send('ksc_recommended_cards_shown', {
    card_count: cardTypes.length,
    card_types: cardTypes.join(','),
  })
}

// ── Card Refresh ────────────────────────────────────────────────────

export function emitCardRefreshed(cardType: string) {
  send('ksc_card_refreshed', { card_type: cardType })
}
