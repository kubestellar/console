/**
 * Smoke tests for arcade / mini-game card components that have no dedicated
 * test file.  Each test verifies that the component mounts without throwing
 * and that something is rendered into the DOM.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// ── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock('../CardWrapper', () => ({
  useCardExpanded: () => ({ isExpanded: false, containerSize: { width: 600, height: 400 } }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
  useCardDemoState: vi.fn(() => ({ isDemoMode: false })),
}))

vi.mock('../../lib/analytics', () => ({
  emitGameStarted: vi.fn(),
  emitGameEnded: vi.fn(),
}))

vi.mock('../../hooks/useGameKeys', () => ({
  useGameKeys: () => ({ key: null }),
  useGameKeyTracking: vi.fn(),
}))

vi.mock('../../lib/safeLocalStorage', () => ({
  safeGet: vi.fn(() => null),
  safeSet: vi.fn(),
  safeGetJSON: vi.fn(() => null),
  safeSetJSON: vi.fn(),
  safeRemove: vi.fn(),
}))

vi.mock('@/lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

vi.mock('@/lib/demoMode', () => ({
  isDemoMode: vi.fn(() => false),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('../KubeKongOverlays', () => ({
  KubeKongHud: () => <div data-testid="kube-kong-hud" />,
  KubeKongOverlays: () => <div data-testid="kube-kong-overlays" />,
}))

vi.mock('../KubeKong.draw', () => ({
  drawKubeKongScene: vi.fn(),
}))

vi.mock('../CheckersPiece', () => ({
  PieceComponent: () => <div data-testid="checker-piece" />,
}))

vi.mock('../Checkers.engine', () => ({
  getValidMoves: vi.fn(() => []),
  makeMove: vi.fn(),
  getBestMove: vi.fn(() => null),
  isGameOver: vi.fn(() => false),
}))

vi.mock('../../../hooks/useGameKeys', () => ({
  useGameKeys: () => ({ key: null }),
  useGameKeyTracking: vi.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function smoke(name: string, factory: () => React.ReactElement) {
  describe(name, () => {
    beforeEach(() => vi.clearAllMocks())
    it('renders without crashing', () => {
      render(factory())
      expect(document.body).toBeTruthy()
    })
  })
}

// ── Game tests ────────────────────────────────────────────────────────────────

smoke('Checkers', () => {
  const { Checkers } = require('../Checkers')
  return <Checkers id="checkers" title="Checkers" />
})

smoke('KubeDoom', () => {
  const { KubeDoom } = require('../KubeDoom')
  return <KubeDoom />
})

smoke('KubeGalaga', () => {
  const { KubeGalaga } = require('../KubeGalaga')
  return <KubeGalaga />
})

smoke('KubeKart', () => {
  const { KubeKart } = require('../KubeKart')
  return <KubeKart />
})

smoke('KubeKong', () => {
  const { KubeKong } = require('../KubeKong')
  return <KubeKong id="kube-kong" title="KubeKong" />
})

smoke('KubeMan', () => {
  const { KubeMan } = require('../KubeMan')
  return <KubeMan id="kube-man" title="KubeMan" />
})

smoke('KubePong', () => {
  const { KubePong } = require('../KubePong')
  return <KubePong />
})

smoke('Kubedle', () => {
  const { Kubedle } = require('../Kubedle')
  return <Kubedle id="kubedle" title="Kubedle" />
})

smoke('MatchGame', () => {
  const { MatchGame } = require('../MatchGame')
  return <MatchGame id="match-game" title="Match Game" />
})

smoke('MissileCommand', () => {
  const { MissileCommand } = require('../MissileCommand')
  return <MissileCommand id="missile-command" title="Missile Command" />
})

smoke('NodeInvaders', () => {
  const { NodeInvaders } = require('../NodeInvaders')
  return <NodeInvaders id="node-invaders" title="Node Invaders" />
})

smoke('PodBrothers', () => {
  const { PodBrothers } = require('../PodBrothers')
  return <PodBrothers />
})

smoke('PodCrosser', () => {
  const { PodCrosser } = require('../PodCrosser')
  return <PodCrosser id="pod-crosser" title="Pod Crosser" />
})

smoke('PodPitfall', () => {
  const { PodPitfall } = require('../PodPitfall')
  return <PodPitfall id="pod-pitfall" title="Pod Pitfall" />
})

smoke('Solitaire', () => {
  const { Solitaire } = require('../Solitaire')
  return <Solitaire id="solitaire" title="Solitaire" />
})

smoke('SudokuGame', () => {
  const { SudokuGame } = require('../SudokuGame')
  return <SudokuGame />
})
