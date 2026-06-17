import { describe, expect, it, mockSend, emitActionClicked, emitGameEnded, emitGameStarted, emitModalClosed, emitModalOpened, emitModalTabViewed, emitSidebarNavigated, emitUserRemoved, emitUserRoleChanged } from './analytics-events.shared'

describe('analytics-events/admin', () => {
  it('emitModalOpened sends modal_type and source_card', () => {
    emitModalOpened('pod-detail', 'pods-card')
    expect(mockSend).toHaveBeenCalledWith('ksc_modal_opened', {
      modal_type: 'pod-detail',
      source_card: 'pods-card',
    })
  })

  it('emitModalTabViewed sends modal_type and tab_name', () => {
    emitModalTabViewed('pod-detail', 'logs')
    expect(mockSend).toHaveBeenCalledWith('ksc_modal_tab_viewed', {
      modal_type: 'pod-detail',
      tab_name: 'logs',
    })
  })

  it('emitModalClosed sends modal_type and duration_ms', () => {
    emitModalClosed('pod-detail', 3000)
    expect(mockSend).toHaveBeenCalledWith('ksc_modal_closed', {
      modal_type: 'pod-detail',
      duration_ms: 3000,
    })
  })

  it('emitActionClicked sends action_type, source_card, dashboard', () => {
    emitActionClicked('restart', 'pods-card', 'main')
    expect(mockSend).toHaveBeenCalledWith('ksc_action_clicked', {
      action_type: 'restart',
      source_card: 'pods-card',
      dashboard: 'main',
    })
  })

  it('emitUserRoleChanged sends new_role', () => {
    emitUserRoleChanged('admin')
    expect(mockSend).toHaveBeenCalledWith('ksc_user_role_changed', { new_role: 'admin' })
  })

  it('emitUserRemoved sends ksc_user_removed', () => {
    emitUserRemoved()
    expect(mockSend).toHaveBeenCalledWith('ksc_user_removed')
  })

  it('emitSidebarNavigated sends destination', () => {
    emitSidebarNavigated('/clusters')
    expect(mockSend).toHaveBeenCalledWith('ksc_sidebar_navigated', { destination: '/clusters' })
  })

  it('emitGameStarted sends game_name', () => {
    emitGameStarted('snake')
    expect(mockSend).toHaveBeenCalledWith('ksc_game_started', { game_name: 'snake' })
  })

  it('emitGameEnded sends game_name, outcome, score', () => {
    emitGameEnded('snake', 'win', 42)
    expect(mockSend).toHaveBeenCalledWith('ksc_game_ended', {
      game_name: 'snake',
      outcome: 'win',
      score: 42,
    })
  })
})

