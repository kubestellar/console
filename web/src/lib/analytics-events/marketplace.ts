import { send } from '../analytics-core'
import type { InstallCopySource } from '../analytics-types'

// ── Marketplace ──────────────────────────────────────

export function emitMarketplaceInstall(itemType: string, itemName: string) {
  send('ksc_marketplace_install', { item_type: itemType, item_name: itemName })
}

export function emitMarketplaceRemove(itemType: string) {
  send('ksc_marketplace_remove', { item_type: itemType })
}

export function emitMarketplaceInstallFailed(
  itemType: string,
  itemName: string,
  error: string,
  failureStage: 'download' | 'http_error' | 'integrity' | 'parse' | 'persist',
) {
  send('ksc_marketplace_install_failed', {
    item_type: itemType,
    item_name: itemName,
    error_detail: error.slice(0, 100),
    failure_stage: failureStage,
  })
}

export function emitMarketplaceItemViewed(itemType: string, itemName: string) {
  send('ksc_marketplace_item_viewed', { item_type: itemType, item_name: itemName })
}

// ── Community Reviews ──────────────────────────────────

export function emitMarketplaceReviewSubmitted(itemId: string, itemName: string, rating: number) {
  send('ksc_marketplace_review_submitted', { item_id: itemId, item_name: itemName, rating: String(rating) })
}

export function emitMarketplaceReviewHelpful(itemId: string, reviewId: string) {
  send('ksc_marketplace_review_helpful', { item_id: itemId, review_id: reviewId })
}

// ── Live Hooks ──────────────────────────────────────────

export function emitMarketplaceHookToggled(itemId: string, eventType: string, active: boolean) {
  send('ksc_marketplace_hook_toggled', { item_id: itemId, event_type: eventType, active: String(active) })
}

export function emitMarketplaceHookCreated(itemId: string, eventType: string) {
  send('ksc_marketplace_hook_created', { item_id: itemId, event_type: eventType })
}

// ── Install & Conversion ──────────────────────────────────

export function emitInstallCommandCopied(source: InstallCopySource, command: string) {
  send('ksc_install_command_copied', { source, command })
}

export function emitConversionStep(
  step: number,
  stepName: string,
  details?: Record<string, string>,
) {
  send('ksc_conversion_step', {
    step_number: step,
    step_name: stepName,
    ...details,
  })
}

export function emitLocalClusterCreated(tool: string) {
  send('ksc_local_cluster_created', { tool })
}

// ── Landing Pages ───────────

export function emitWelcomeViewed(ref: string) {
  send('ksc_welcome_viewed', { ref })
}

export function emitWelcomeActioned(action: string, ref: string) {
  send('ksc_welcome_actioned', { action, ref })
}

export function emitFromLensViewed() {
  send('ksc_from_lens_viewed')
}

export function emitFromLensActioned(action: string) {
  send('ksc_from_lens_actioned', { action })
}

export function emitFromLensTabSwitch(tab: string) {
  send('ksc_from_lens_tab_switch', { tab })
}

export function emitFromLensCommandCopy(tab: string, step: number, command: string) {
  send('ksc_from_lens_command_copy', { tab, step, command })
}

export function emitFromHeadlampViewed() {
  send('ksc_from_headlamp_viewed')
}

export function emitFromHeadlampActioned(action: string) {
  send('ksc_from_headlamp_actioned', { action })
}

export function emitFromHeadlampTabSwitch(tab: string) {
  send('ksc_from_headlamp_tab_switch', { tab })
}

export function emitFromHeadlampCommandCopy(tab: string, step: number, command: string) {
  send('ksc_from_headlamp_command_copy', { tab, step, command })
}

export function emitWhiteLabelViewed() {
  send('ksc_white_label_viewed')
}

export function emitWhiteLabelActioned(action: string) {
  send('ksc_white_label_actioned', { action })
}

export function emitWhiteLabelTabSwitch(tab: string) {
  send('ksc_white_label_tab_switch', { tab })
}

export function emitWhiteLabelCommandCopy(tab: string, step: number, command: string) {
  send('ksc_white_label_command_copy', { tab, step, command })
}
