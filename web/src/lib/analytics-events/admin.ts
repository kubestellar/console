import { send } from '../analytics-core'

// ── Modal & Actions ─────────────────────────────────────────────────

export function emitModalOpened(modalType: string, sourceCard: string) {
  send('ksc_modal_opened', { modal_type: modalType, source_card: sourceCard })
}

export function emitModalTabViewed(modalType: string, tabName: string) {
  send('ksc_modal_tab_viewed', { modal_type: modalType, tab_name: tabName })
}

export function emitModalClosed(modalType: string, durationMs: number) {
  send('ksc_modal_closed', { modal_type: modalType, duration_ms: durationMs })
}

export function emitActionClicked(actionType: string, sourceCard: string, dashboard: string) {
  send('ksc_action_clicked', { action_type: actionType, source_card: sourceCard, dashboard })
}

// ── Admin & Navigation ──────────────────────────────────────────────

export function emitUserRoleChanged(newRole: string) {
  send('ksc_user_role_changed', { new_role: newRole })
}

export function emitUserRemoved() {
  send('ksc_user_removed')
}

export function emitSidebarNavigated(destination: string) {
  send('ksc_sidebar_navigated', { destination })
}

export function emitGameStarted(gameName: string) {
  send('ksc_game_started', { game_name: gameName })
}

export function emitGameEnded(gameName: string, outcome: string, score: number) {
  send('ksc_game_ended', { game_name: gameName, outcome, score })
}
