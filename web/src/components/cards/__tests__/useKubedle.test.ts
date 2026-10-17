import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkGuess, useKubedle } from '../useKubedle'
import { emitGameEnded, emitGameStarted } from '../../../lib/analytics'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../CardDataContext', () => ({
  useCardDemoState: () => ({ showDemoBadge: false }),
  useReportCardDataState: vi.fn(),
}))
vi.mock('../../../lib/analytics', () => ({
  emitGameEnded: vi.fn(), emitGameStarted: vi.fn(),
}))
vi.mock('../../../hooks/useGameKeys', () => ({ useGameKeys: vi.fn() }))

const ERROR_FLASH_MS = 500

function typeWord(result: { current: ReturnType<typeof useKubedle> }, word: string) {
  for (const key of word) act(() => result.current.handleKey(key))
}

describe('Kubedle rules and state', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('uses each target letter only once when marking repeated letters', () => {
    expect(checkGuess('LLAMA', 'LABEL')).toEqual(['correct', 'present', 'present', 'absent', 'absent'])
    expect(checkGuess('NODES', 'NODES')).toEqual(Array(5).fill('correct'))
  })

  it('rejects invalid words without consuming a guess and clears the error flash', () => {
    const { result, unmount } = renderHook(() => useKubedle())
    typeWord(result, 'ZZZZZ')
    act(() => result.current.handleKey('ENTER'))
    expect(result.current.guesses).toEqual([])
    expect(result.current.message).toBe('kubedle.notInWordList')
    expect(result.current.shake).toBe(true)
    act(() => vi.advanceTimersByTime(ERROR_FLASH_MS))
    expect(result.current.message).toBe('')
    expect(result.current.shake).toBe(false)
    act(() => result.current.handleKey('Backspace'))
    act(() => result.current.handleKey('Enter'))
    expect(result.current.message).toBe('kubedle.notEnoughLetters')
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('persists wins, ignores input after game over, and resets for practice', () => {
    const { result } = renderHook(() => useKubedle())
    typeWord(result, result.current.targetWord)
    act(() => result.current.handleKey('Enter'))
    expect(result.current.gameOver).toBe(true)
    expect(result.current.stats.won).toBe(1)
    expect(result.current.stats.guessDistribution[0]).toBe(1)
    expect(JSON.parse(localStorage.getItem('kubedle-stats') || '{}').played).toBe(1)
    expect(emitGameEnded).toHaveBeenCalledWith('kubedle', 'win', 1)
    act(() => result.current.handleKey('A'))
    expect(result.current.currentGuess).toBe('')
    act(() => result.current.newGame(true))
    expect(result.current.practiceMode).toBe(true)
    expect(result.current.gameOver).toBe(false)
    expect(result.current.guesses).toEqual([])
    expect(result.current.stats.won).toBe(1)
    expect(emitGameStarted).toHaveBeenCalledWith('kubedle')
  })
})
