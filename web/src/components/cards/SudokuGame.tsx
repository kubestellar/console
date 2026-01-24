import { useState, useEffect, useCallback } from 'react'
import {
  Play, Pause, Lightbulb, Pencil, Undo2, Redo2,
  Save, Trophy, Settings, Sparkles, X
} from 'lucide-react'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useCardExpanded } from './CardWrapper'

// Types
type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
type CellValue = number | null
type Notes = Set<number>

interface Cell {
  value: CellValue
  isOriginal: boolean
  notes: Notes
  isConflict: boolean
}

interface GameState {
  board: Cell[][]
  solution: number[][]
  difficulty: Difficulty
  timer: number
  isPaused: boolean
  hintsRemaining: number
  isComplete: boolean
}

interface HistoryState {
  board: Cell[][]
  timer: number
}

interface BestTimes {
  easy?: number
  medium?: number
  hard?: number
  expert?: number
}

interface SudokuGameProps {
  config?: Record<string, unknown>
}

const DIFFICULTIES: Record<Difficulty, { label: string; cellsToRemove: number; hints: number }> = {
  easy: { label: 'Easy', cellsToRemove: 35, hints: 5 },
  medium: { label: 'Medium', cellsToRemove: 45, hints: 3 },
  hard: { label: 'Hard', cellsToRemove: 52, hints: 2 },
  expert: { label: 'Expert', cellsToRemove: 58, hints: 1 },
}

const STORAGE_KEY = 'sudoku-game-state'
const BEST_TIMES_KEY = 'sudoku-best-times'

// Puzzle generation helper functions
function createEmptyBoard(): Cell[][] {
  return Array(9).fill(null).map(() =>
    Array(9).fill(null).map(() => ({
      value: null,
      isOriginal: false,
      notes: new Set<number>(),
      isConflict: false,
    }))
  )
}

function isValid(board: number[][], row: number, col: number, num: number): boolean {
  // Check row
  for (let x = 0; x < 9; x++) {
    if (board[row][x] === num) return false
  }
  
  // Check column
  for (let x = 0; x < 9; x++) {
    if (board[x][col] === num) return false
  }
  
  // Check 3x3 box
  const boxRow = Math.floor(row / 3) * 3
  const boxCol = Math.floor(col / 3) * 3
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (board[boxRow + i][boxCol + j] === num) return false
    }
  }
  
  return true
}

function solveSudoku(board: number[][]): boolean {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === 0) {
        for (let num = 1; num <= 9; num++) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num
            if (solveSudoku(board)) return true
            board[row][col] = 0
          }
        }
        return false
      }
    }
  }
  return true
}

function generateSolvedBoard(): number[][] {
  const board: number[][] = Array(9).fill(null).map(() => Array(9).fill(0))
  
  // Fill diagonal 3x3 boxes first
  for (let box = 0; box < 9; box += 3) {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const idx = Math.floor(Math.random() * nums.length)
        board[box + i][box + j] = nums[idx]
        nums.splice(idx, 1)
      }
    }
  }
  
  solveSudoku(board)
  return board
}

function generatePuzzle(difficulty: Difficulty): { puzzle: Cell[][], solution: number[][] } {
  const solution = generateSolvedBoard()
  const puzzle = createEmptyBoard()
  
  // Copy solution to puzzle
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      puzzle[i][j].value = solution[i][j]
      puzzle[i][j].isOriginal = true
    }
  }
  
  // Remove cells based on difficulty
  const cellsToRemove = DIFFICULTIES[difficulty].cellsToRemove
  let removed = 0
  
  while (removed < cellsToRemove) {
    const row = Math.floor(Math.random() * 9)
    const col = Math.floor(Math.random() * 9)
    
    if (puzzle[row][col].value !== null) {
      puzzle[row][col].value = null
      puzzle[row][col].isOriginal = false
      removed++
    }
  }
  
  return { puzzle, solution }
}

function checkConflicts(board: Cell[][], row: number, col: number): boolean {
  const value = board[row][col].value
  if (!value) return false
  
  // Check row
  for (let x = 0; x < 9; x++) {
    if (x !== col && board[row][x].value === value) return true
  }
  
  // Check column
  for (let x = 0; x < 9; x++) {
    if (x !== row && board[x][col].value === value) return true
  }
  
  // Check 3x3 box
  const boxRow = Math.floor(row / 3) * 3
  const boxCol = Math.floor(col / 3) * 3
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const r = boxRow + i
      const c = boxCol + j
      if ((r !== row || c !== col) && board[r][c].value === value) return true
    }
  }
  
  return false
}

function updateConflicts(board: Cell[][]): Cell[][] {
  const newBoard = board.map(row => row.map(cell => ({ ...cell, isConflict: false })))
  
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      if (newBoard[i][j].value) {
        newBoard[i][j].isConflict = checkConflicts(newBoard, i, j)
      }
    }
  }
  
  return newBoard
}

function isComplete(board: Cell[][], solution: number[][]): boolean {
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      if (board[i][j].value !== solution[i][j]) return false
    }
  }
  return true
}

export function SudokuGame({ config: _config }: SudokuGameProps) {
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null)
  const [pencilMode, setPencilMode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [history, setHistory] = useState<HistoryState[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [bestTimes, setBestTimes] = useState<BestTimes>({})
  const [showVictory, setShowVictory] = useState(false)

  // Get expanded state from parent CardWrapper via context
  const { isExpanded } = useCardExpanded()

  // Use large cells when expanded for playability (70px cells = 630px grid)
  const isMaximized = isExpanded
  const cellSize = isMaximized ? 'w-[70px] h-[70px] text-3xl' : 'w-6 h-6 text-[10px]'
  const noteSize = isMaximized ? 'text-sm' : 'text-[5px]'
  const numberPadSize = isMaximized ? 'h-12 text-xl' : 'h-6 text-[10px]'
  const controlButtonSize = isMaximized ? 'px-5 py-3 text-base' : 'px-1 py-1 text-[10px]'
  const iconSize = isMaximized ? 'w-5 h-5' : 'w-2.5 h-2.5'

  // Load saved state and best times
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as GameState
        // Reconstruct Sets for notes
        parsed.board = parsed.board.map((row) =>
          row.map((cell) => ({
            ...cell,
            notes: new Set(Array.isArray(cell.notes) ? cell.notes : []),
          }))
        )
        setGameState(parsed)
      } catch (e) {
        console.error('Failed to load saved game:', e)
      }
    }

    const savedBestTimes = localStorage.getItem(BEST_TIMES_KEY)
    if (savedBestTimes) {
      try {
        setBestTimes(JSON.parse(savedBestTimes) as BestTimes)
      } catch (e) {
        console.error('Failed to load best times:', e)
      }
    }
  }, [])

  // Timer
  useEffect(() => {
    if (!gameState || gameState.isPaused || gameState.isComplete) return

    const interval = setInterval(() => {
      setGameState(prev => prev ? { ...prev, timer: prev.timer + 1 } : null)
    }, 1000)

    return () => clearInterval(interval)
  }, [gameState?.isPaused, gameState?.isComplete])

  // Save game state
  const saveGame = useCallback(() => {
    if (!gameState) return
    
    const toSave = {
      ...gameState,
      board: gameState.board.map(row =>
        row.map(cell => ({
          ...cell,
          notes: Array.from(cell.notes),
        }))
      ),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  }, [gameState])

  // Start new game
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
  }, [])

  // Initialize with easy game if no saved state
  useEffect(() => {
    if (!gameState) {
      startNewGame('easy')
    }
  }, [gameState, startNewGame])

  const addToHistory = useCallback((board: Cell[][], timer: number) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push({ board: board.map(row => row.map(cell => ({ ...cell }))), timer })
      return newHistory.slice(-50) // Keep last 50 moves
    })
    setHistoryIndex(prev => Math.min(prev + 1, 49))
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
  }, [historyIndex, history, gameState])

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
    const complete = isComplete(updatedBoard, gameState.solution)

    setGameState(prev => prev ? {
      ...prev,
      board: updatedBoard,
      isComplete: complete,
    } : null)

    addToHistory(updatedBoard, gameState.timer)

    if (complete) {
      setShowVictory(true)
      const currentBest = bestTimes[gameState.difficulty]
      if (!currentBest || gameState.timer < currentBest) {
        const newBestTimes = { ...bestTimes, [gameState.difficulty]: gameState.timer }
        setBestTimes(newBestTimes)
        localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(newBestTimes))
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
    setGameState(prev => prev ? {
      ...prev,
      board: updatedBoard,
      hintsRemaining: prev.hintsRemaining - 1,
    } : null)

    addToHistory(updatedBoard, gameState.timer)
  }, [gameState, selectedCell, addToHistory])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!gameState) return null

  return (
    <div className="h-full flex-1 flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className={`flex items-center justify-between ${isMaximized ? 'mb-4' : 'mb-1.5'}`}>
        <div className={`flex items-center ${isMaximized ? 'gap-3' : 'gap-1.5'}`}>
          <Sparkles className={isMaximized ? 'w-5 h-5 text-purple-400' : 'w-3.5 h-3.5 text-purple-400'} />
          <span className={`font-medium text-muted-foreground ${isMaximized ? 'text-base' : 'text-xs'}`}>Sudoku</span>
        </div>
        <div className={`flex items-center ${isMaximized ? 'gap-2' : 'gap-0.5'}`}>
          <button
            onClick={() => setShowSettings(true)}
            className={`${isMaximized ? 'p-2' : 'p-0.5'} hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400`}
            title="Settings"
          >
            <Settings className={isMaximized ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
          </button>
          <RefreshButton
            isRefreshing={false}
            onRefresh={() => startNewGame(gameState.difficulty)}
            size={isMaximized ? undefined : 'sm'}
          />
        </div>
      </div>

      {/* Game info */}
      <div className={`flex items-center justify-between ${isMaximized ? 'mb-4 text-sm' : 'mb-1.5 text-[10px]'}`}>
        <div className={`flex items-center ${isMaximized ? 'gap-4' : 'gap-2'}`}>
          <span className={`${isMaximized ? 'px-3 py-1' : 'px-1.5 py-0.5'} rounded bg-purple-500/20 text-purple-400 font-medium`}>
            {DIFFICULTIES[gameState.difficulty].label}
          </span>
          <span className="text-muted-foreground">
            {formatTime(gameState.timer)}
          </span>
        </div>
        <div className={`flex items-center ${isMaximized ? 'gap-3' : 'gap-1.5'}`}>
          <span className={`text-muted-foreground flex items-center ${isMaximized ? 'gap-1' : 'gap-0.5'}`}>
            <Lightbulb className={isMaximized ? 'w-4 h-4' : 'w-2.5 h-2.5'} />
            {gameState.hintsRemaining}
          </span>
          {bestTimes[gameState.difficulty] && (
            <span className={`text-muted-foreground flex items-center ${isMaximized ? 'gap-1' : 'gap-0.5'}`}>
              <Trophy className={`${isMaximized ? 'w-4 h-4' : 'w-2.5 h-2.5'} text-yellow-500`} />
              {formatTime(bestTimes[gameState.difficulty]!)}
            </span>
          )}
        </div>
      </div>

      {/* Sudoku Grid */}
      <div className={`flex-1 flex items-center justify-center ${isMaximized ? 'mb-8' : 'mb-1.5'}`}>
        <div className={`inline-grid grid-cols-9 gap-0 ${isMaximized ? 'border-4 rounded-lg' : 'border rounded'} border-purple-500/30 overflow-hidden bg-secondary/20`}>
          {gameState.board.map((row, i) =>
            row.map((cell, j) => {
              const isSelected = selectedCell?.[0] === i && selectedCell?.[1] === j
              const isInSameRow = selectedCell?.[0] === i
              const isInSameCol = selectedCell?.[1] === j
              const isInSameBox =
                selectedCell &&
                Math.floor(selectedCell[0] / 3) === Math.floor(i / 3) &&
                Math.floor(selectedCell[1] / 3) === Math.floor(j / 3)
              const rightBorder = (j + 1) % 3 === 0 && j !== 8
              const bottomBorder = (i + 1) % 3 === 0 && i !== 8

              return (
                <button
                  key={`${i}-${j}`}
                  onClick={() => handleCellClick(i, j)}
                  disabled={gameState.isComplete}
                  className={`
                    ${cellSize} font-medium transition-all
                    ${rightBorder ? (isMaximized ? 'border-r-4' : 'border-r-2') + ' border-purple-500/50' : 'border-r border-border/30'}
                    ${bottomBorder ? (isMaximized ? 'border-b-4' : 'border-b-2') + ' border-purple-500/50' : 'border-b border-border/30'}
                    ${isSelected ? 'bg-purple-500/30 ring-2 ring-purple-500' : ''}
                    ${!isSelected && (isInSameRow || isInSameCol || isInSameBox) ? 'bg-purple-500/10' : ''}
                    ${cell.isOriginal ? 'text-foreground font-bold' : 'text-purple-400'}
                    ${cell.isConflict ? 'text-red-500 bg-red-500/20' : ''}
                    ${!cell.isOriginal && !gameState.isComplete ? 'hover:bg-purple-500/20 cursor-pointer' : ''}
                    ${gameState.isComplete ? 'cursor-default' : ''}
                  `}
                >
                  {cell.value || (
                    cell.notes.size > 0 && (
                      <div className={`grid grid-cols-3 gap-0 ${noteSize} text-muted-foreground/50 leading-none`}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                          <div key={n}>{cell.notes.has(n) ? n : ''}</div>
                        ))}
                      </div>
                    )
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Controls */}
      <div className={isMaximized ? 'space-y-4' : 'space-y-1'}>
        {/* Number pad */}
        <div className={`grid grid-cols-9 ${isMaximized ? 'gap-2' : 'gap-0.5'}`}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              onClick={() => handleNumberInput(num)}
              disabled={!selectedCell || gameState.isComplete}
              className={`${numberPadSize} rounded bg-secondary/50 hover:bg-purple-500/20 font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              {num}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className={`grid grid-cols-4 ${isMaximized ? 'gap-2' : 'gap-0.5'}`}>
          <button
            onClick={() => setPencilMode(!pencilMode)}
            className={`flex items-center justify-center gap-1 ${controlButtonSize} rounded transition-colors ${
              pencilMode ? 'bg-purple-500/30 text-purple-400' : 'bg-secondary/50 hover:bg-secondary'
            }`}
          >
            <Pencil className={iconSize} />
            <span className={isMaximized ? 'inline' : 'hidden sm:inline'}>Notes</span>
          </button>
          <button
            onClick={handleHint}
            disabled={!selectedCell || gameState.hintsRemaining <= 0 || gameState.isComplete}
            className={`flex items-center justify-center gap-1 ${controlButtonSize} rounded bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <Lightbulb className={iconSize} />
            <span className={isMaximized ? 'inline' : 'hidden sm:inline'}>Hint</span>
          </button>
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className={`flex items-center justify-center gap-1 ${controlButtonSize} rounded bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <Undo2 className={iconSize} />
            {isMaximized && <span>Undo</span>}
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className={`flex items-center justify-center gap-1 ${controlButtonSize} rounded bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <Redo2 className={iconSize} />
            {isMaximized && <span>Redo</span>}
          </button>
        </div>

        {/* Bottom controls */}
        <div className={`flex ${isMaximized ? 'gap-3' : 'gap-0.5'}`}>
          <button
            onClick={() => setGameState(prev => prev ? { ...prev, isPaused: !prev.isPaused } : null)}
            disabled={gameState.isComplete}
            className={`flex-1 flex items-center justify-center gap-1 ${controlButtonSize} rounded bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-30`}
          >
            {gameState.isPaused ? <Play className={iconSize} /> : <Pause className={iconSize} />}
            <span className={isMaximized ? 'inline' : 'hidden sm:inline'}>{gameState.isPaused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            onClick={saveGame}
            className={`flex-1 flex items-center justify-center gap-1 ${controlButtonSize} rounded bg-secondary/50 hover:bg-secondary transition-colors`}
          >
            <Save className={iconSize} />
            <span className={isMaximized ? 'inline' : 'hidden sm:inline'}>Save</span>
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 rounded-lg">
          <div className="bg-background border border-border rounded-lg p-4 max-w-xs w-full mx-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">New Game</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-secondary rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {(Object.keys(DIFFICULTIES) as Difficulty[]).map(difficulty => (
                <button
                  key={difficulty}
                  onClick={() => startNewGame(difficulty)}
                  className="w-full text-left px-3 py-2 rounded bg-secondary/50 hover:bg-purple-500/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{DIFFICULTIES[difficulty].label}</span>
                    {bestTimes[difficulty] && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Trophy className="w-3 h-3 text-yellow-500" />
                        {formatTime(bestTimes[difficulty]!)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {DIFFICULTIES[difficulty].hints} hints available
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Victory Modal */}
      {showVictory && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 rounded-lg animate-in fade-in duration-300">
          <div className="bg-background border border-purple-500/30 rounded-lg p-6 max-w-xs w-full mx-4 text-center">
            <div className="mb-4">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Trophy className="w-8 h-8 text-yellow-500" />
              </div>
              <h3 className="text-lg font-bold mb-2">Congratulations!</h3>
              <p className="text-sm text-muted-foreground mb-1">
                You completed the {DIFFICULTIES[gameState.difficulty].label} puzzle!
              </p>
              <p className="text-2xl font-bold text-purple-400">
                {formatTime(gameState.timer)}
              </p>
              {bestTimes[gameState.difficulty] === gameState.timer && (
                <p className="text-xs text-yellow-500 mt-2 flex items-center justify-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  New Best Time!
                </p>
              )}
            </div>
            <button
              onClick={() => {
                setShowVictory(false)
                setShowSettings(true)
              }}
              className="w-full px-4 py-2 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 font-medium transition-colors"
            >
              Play Again
            </button>
          </div>
        </div>
      )}

      {/* Pause overlay */}
      {gameState.isPaused && !showSettings && !showVictory && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-40 rounded-lg">
          <div className="text-center">
            <Pause className="w-12 h-12 text-purple-400 mx-auto mb-2" />
            <p className="text-lg font-medium">Paused</p>
          </div>
        </div>
      )}
    </div>
  )
}
