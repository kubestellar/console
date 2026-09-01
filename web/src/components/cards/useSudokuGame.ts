import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useToast } from '../ui/Toast'
import type { Difficulty, GameState, HistoryState, BestTimes } from './sudoku.types'
import { DIFFICULTIES, STORAGE_KEY, BEST_TIMES_KEY, MAX_HISTORY_LENGTH } from './sudoku.constants'
import { generatePuzzle, updateConflicts, isBoardComplete } from './sudoku.utils'

export function useSudokuGame() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null)
  const [pencilMode, setPencilMode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [history, setHistory] = useState<HistoryState[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [bestTimes, setBestTimes] = useState<BestTimes>({})
  const [showVictory, setShowVictory] = useState(false)

  // Load saved state and best times
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as GameState
          parsed.board = parsed.board.map((row) =>
            row.map((cell) => ({
              ...cell,
              notes: new Set(Array.isArray(cell.notes) ? cell.notes : []),
            }))
          )
          setGameState(parsed)
        } catch (e: unknown) {
          console.error('Failed to load saved game:', e)
          showToast(t('sudoku.errors.loadFailed', 'Could not load saved game — starting fresh.'), 'warning')
        }
      }

      const savedBestTimes = localStorage.getItem(BEST_TIMES_KEY)
      if (savedBestTimes) {
        try {
          setBestTimes(JSON.parse(savedBestTimes) as BestTimes)
        } catch (e: unknown) {
          console.error('Failed to load best times:', e)
          showToast(t('sudoku.errors.bestTimesFailed', 'Could not load best times.'), 'warning')
        }
      }
    } catch {
      // Ignore storage errors (e.g. private browsing)
    }
  }, [showToast, t])

  // Timer
  const isTimerRunning = gameState !== null && !gameState.isPaused && !gameState.isComplete
  useEffect(() => {
    if (!isTimerRunning) return
    const interval = setInterval(() => {
      setGameState(prev => prev ? { ...prev, timer: prev.timer + 1 } : null)
    }, 1000)
    return () => clearInterval(interval)
  }, [isTimerRunning])

  const saveGame = useCallback(() => {
    if (!gameState) return
    const toSave = {
      ...gameState,
      board: gameState.board.map(row =>
        row.map(cell => ({ ...cell, notes: Array.from(cell.notes) }))
      ),
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch {
      // Ignore storage errors (e.g. private browsing, quota exceeded)
    }
  }, [gameState])

  const startNewGame = useCallback((difficulty: Difficulty) => {
    const { puzzle, solution } = generatePuzzle(difficulty)
    const newState: GameState = {
      board: puzzle,
      solution,
      difficulty,
      timer: 0,
      isPaused: false,
      hintsRemaining: DIFFICULTIES[difficulty].hints,
      isComplete: false,
    }
    setGameState(newState)
    setHistory([{ board: puzzle, timer: 0 }])
    setHistoryIndex(0)
    setSelectedCell(null)
    setShowSettings(false)
    setShowVictory(false)
    emitGameStarted('sudoku')
  }, [])

  // Initialize with easy game if no saved state
  useEffect(() => {
    if (!gameState) {
      startNewGame('easy')
    }
  }, [gameState, startNewGame])

  const addToHistory = useCallback((board: HistoryState['board'], timer: number) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push({ board: board.map(row => row.map(cell => ({ ...cell }))), timer })
      return newHistory.slice(-MAX_HISTORY_LENGTH)
    })
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY_LENGTH - 1))
  }, [historyIndex])

  const undo = useCallback(() => {
    if (historyIndex > 0 && gameState) {
      const prevState = history[historyIndex - 1]
      setGameState({
        ...gameState,
        board: prevState.board.map(row => row.map(cell => ({ ...cell }))),
        timer: prevState.timer,
      })
      setHistoryIndex(prev => prev - 1)
    }
  }, [historyIndex, gameState, history])

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1 && gameState) {
      const nextState = history[historyIndex + 1]
      setGameState({
        ...gameState,
        board: nextState.board.map(row => row.map(cell => ({ ...cell }))),
        timer: nextState.timer,
      })
      setHistoryIndex(prev => prev + 1)
    }
  }, [historyIndex, history, gameState])

  const handleCellClick = useCallback((row: number, col: number) => {
    if (!gameState || gameState.isComplete) return
    if (gameState.board[row][col].isOriginal) return
    setSelectedCell([row, col])
  }, [gameState])

  const handleNumberInput = useCallback((num: number) => {
    if (!gameState || !selectedCell || gameState.isComplete) return
    const [row, col] = selectedCell
    if (gameState.board[row][col].isOriginal) return

    const newBoard = gameState.board.map((r, i) =>
      r.map((cell, j) => {
        if (i === row && j === col) {
          if (pencilMode) {
            const newNotes = new Set<number>(cell.notes)
            if (newNotes.has(num)) {
              newNotes.delete(num)
            } else {
              newNotes.add(num)
            }
            return { ...cell, notes: newNotes }
          } else {
            return { ...cell, value: cell.value === num ? null : num, notes: new Set<number>() }
          }
        }
        return cell
      })
    )

    const updatedBoard = updateConflicts(newBoard)
    const complete = isBoardComplete(updatedBoard, gameState.solution)

    setGameState(prev => prev ? { ...prev, board: updatedBoard, isComplete: complete } : null)
    addToHistory(updatedBoard, gameState.timer)

    if (complete) {
      setShowVictory(true)
      emitGameEnded('sudoku', 'win', gameState.timer)
      const currentBest = bestTimes[gameState.difficulty]
      if (!currentBest || gameState.timer < currentBest) {
        const newBestTimes = { ...bestTimes, [gameState.difficulty]: gameState.timer }
        setBestTimes(newBestTimes)
        try {
          localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(newBestTimes))
        } catch {
          // Ignore storage errors
        }
      }
    }
  }, [gameState, selectedCell, pencilMode, addToHistory, bestTimes])

  const handleHint = useCallback(() => {
    if (!gameState || !selectedCell || gameState.hintsRemaining <= 0 || gameState.isComplete) return
    const [row, col] = selectedCell
    if (gameState.board[row][col].isOriginal) return

    const correctValue = gameState.solution[row][col]
    const newBoard = gameState.board.map((r, i) =>
      r.map((cell, j) => {
        if (i === row && j === col) {
          return { ...cell, value: correctValue, notes: new Set<number>(), isOriginal: false }
        }
        return cell
      })
    )

    const updatedBoard = updateConflicts(newBoard)
    setGameState(prev => prev ? { ...prev, board: updatedBoard, hintsRemaining: prev.hintsRemaining - 1 } : null)
    addToHistory(updatedBoard, gameState.timer)
  }, [gameState, selectedCell, addToHistory])

  const togglePause = useCallback(() => {
    setGameState(prev => prev ? { ...prev, isPaused: !prev.isPaused } : null)
  }, [])

  return {
    gameState,
    selectedCell,
    pencilMode,
    setPencilMode,
    showSettings,
    setShowSettings,
    showVictory,
    setShowVictory,
    bestTimes,
    historyIndex,
    historyLength: history.length,
    saveGame,
    startNewGame,
    handleCellClick,
    handleNumberInput,
    handleHint,
    undo,
    redo,
    togglePause,
  }
}
