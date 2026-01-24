import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw, Pause, Play, Trophy } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'

// Board dimensions
const ROWS = 20
const COLS = 10

// Tetromino shapes (I, O, T, S, Z, J, L)
const TETROMINOES = {
  I: {
    shape: [[1, 1, 1, 1]],
    color: 'bg-cyan-500',
  },
  O: {
    shape: [[1, 1], [1, 1]],
    color: 'bg-yellow-500',
  },
  T: {
    shape: [[0, 1, 0], [1, 1, 1]],
    color: 'bg-purple-500',
  },
  S: {
    shape: [[0, 1, 1], [1, 1, 0]],
    color: 'bg-green-500',
  },
  Z: {
    shape: [[1, 1, 0], [0, 1, 1]],
    color: 'bg-red-500',
  },
  J: {
    shape: [[1, 0, 0], [1, 1, 1]],
    color: 'bg-blue-500',
  },
  L: {
    shape: [[0, 0, 1], [1, 1, 1]],
    color: 'bg-orange-500',
  },
}

type TetrominoType = keyof typeof TETROMINOES
type Board = (string | null)[][]

interface Piece {
  type: TetrominoType
  shape: number[][]
  x: number
  y: number
}

// Create empty board
function createBoard(): Board {
  return Array(ROWS).fill(null).map(() => Array(COLS).fill(null))
}

// Rotate a shape clockwise
function rotateShape(shape: number[][]): number[][] {
  const rows = shape.length
  const cols = shape[0].length
  const rotated: number[][] = []

  for (let c = 0; c < cols; c++) {
    const newRow: number[] = []
    for (let r = rows - 1; r >= 0; r--) {
      newRow.push(shape[r][c])
    }
    rotated.push(newRow)
  }

  return rotated
}

// Check if piece position is valid
function isValidPosition(board: Board, piece: Piece): boolean {
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (piece.shape[r][c]) {
        const newRow = piece.y + r
        const newCol = piece.x + c

        // Check bounds
        if (newCol < 0 || newCol >= COLS || newRow >= ROWS) return false

        // Check collision with placed pieces (only if piece is on board)
        if (newRow >= 0 && board[newRow][newCol]) return false
      }
    }
  }
  return true
}

// Place piece on board
function placePiece(board: Board, piece: Piece): Board {
  const newBoard = board.map(row => [...row])
  const color = TETROMINOES[piece.type].color

  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (piece.shape[r][c]) {
        const boardRow = piece.y + r
        const boardCol = piece.x + c
        if (boardRow >= 0 && boardRow < ROWS && boardCol >= 0 && boardCol < COLS) {
          newBoard[boardRow][boardCol] = color
        }
      }
    }
  }

  return newBoard
}

// Clear completed lines and return new board + lines cleared
function clearLines(board: Board): { board: Board; linesCleared: number } {
  const newBoard = board.filter(row => row.some(cell => !cell))
  const linesCleared = ROWS - newBoard.length

  // Add empty rows at top
  while (newBoard.length < ROWS) {
    newBoard.unshift(Array(COLS).fill(null))
  }

  return { board: newBoard, linesCleared }
}

// Get random tetromino
function getRandomPiece(): Piece {
  const types = Object.keys(TETROMINOES) as TetrominoType[]
  const type = types[Math.floor(Math.random() * types.length)]
  return {
    type,
    shape: TETROMINOES[type].shape.map(row => [...row]),
    x: Math.floor((COLS - TETROMINOES[type].shape[0].length) / 2),
    y: -1,
  }
}

// Calculate score based on lines cleared
function calculateScore(lines: number, level: number): number {
  const basePoints = [0, 100, 300, 500, 800]
  return basePoints[lines] * level
}

export function ContainerTetris(_props: CardComponentProps) {
  const { isExpanded } = useCardExpanded()

  const [board, setBoard] = useState<Board>(createBoard)
  const [piece, setPiece] = useState<Piece | null>(null)
  const [nextPiece, setNextPiece] = useState<Piece>(() => getRandomPiece())
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lines, setLines] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Calculate drop speed based on level
  const getDropSpeed = useCallback(() => {
    return Math.max(100, 1000 - (level - 1) * 100)
  }, [level])

  // Move piece down
  const moveDown = useCallback(() => {
    if (!piece || gameOver || isPaused) return

    const newPiece = { ...piece, y: piece.y + 1 }

    if (isValidPosition(board, newPiece)) {
      setPiece(newPiece)
    } else {
      // Piece has landed
      const newBoard = placePiece(board, piece)

      // Check for game over (piece landed above board)
      if (piece.y < 0) {
        setGameOver(true)
        setIsPlaying(false)
        return
      }

      // Clear lines
      const { board: clearedBoard, linesCleared } = clearLines(newBoard)
      setBoard(clearedBoard)

      if (linesCleared > 0) {
        setLines(l => {
          const newLines = l + linesCleared
          // Level up every 10 lines
          setLevel(Math.floor(newLines / 10) + 1)
          return newLines
        })
        setScore(s => s + calculateScore(linesCleared, level))
      }

      // Spawn next piece
      setPiece(nextPiece)
      setNextPiece(getRandomPiece())
    }
  }, [piece, board, gameOver, isPaused, nextPiece, level])

  // Move piece left/right
  const moveHorizontal = useCallback((dir: -1 | 1) => {
    if (!piece || gameOver || isPaused) return

    const newPiece = { ...piece, x: piece.x + dir }
    if (isValidPosition(board, newPiece)) {
      setPiece(newPiece)
    }
  }, [piece, board, gameOver, isPaused])

  // Rotate piece
  const rotate = useCallback(() => {
    if (!piece || gameOver || isPaused) return

    const newShape = rotateShape(piece.shape)
    const newPiece = { ...piece, shape: newShape }

    // Try to fit rotated piece (wall kick)
    for (const offset of [0, -1, 1, -2, 2]) {
      const adjusted = { ...newPiece, x: newPiece.x + offset }
      if (isValidPosition(board, adjusted)) {
        setPiece(adjusted)
        return
      }
    }
  }, [piece, board, gameOver, isPaused])

  // Hard drop
  const hardDrop = useCallback(() => {
    if (!piece || gameOver || isPaused) return

    let newPiece = { ...piece }
    while (isValidPosition(board, { ...newPiece, y: newPiece.y + 1 })) {
      newPiece.y++
    }
    setPiece(newPiece)
    // Force immediate landing on next tick
    setTimeout(moveDown, 10)
  }, [piece, board, gameOver, isPaused, moveDown])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || gameOver) return

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          moveHorizontal(-1)
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          moveHorizontal(1)
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          moveDown()
          break
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          rotate()
          break
        case ' ':
          e.preventDefault()
          hardDrop()
          break
        case 'p':
        case 'P':
          e.preventDefault()
          setIsPaused(p => !p)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, gameOver, moveHorizontal, moveDown, rotate, hardDrop])

  // Game loop
  useEffect(() => {
    if (!isPlaying || gameOver || isPaused) {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
        gameLoopRef.current = null
      }
      return
    }

    gameLoopRef.current = setInterval(moveDown, getDropSpeed())

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
    }
  }, [isPlaying, gameOver, isPaused, getDropSpeed, moveDown])

  // Start new game
  const startGame = useCallback(() => {
    setBoard(createBoard())
    setPiece(getRandomPiece())
    setNextPiece(getRandomPiece())
    setScore(0)
    setLevel(1)
    setLines(0)
    setGameOver(false)
    setIsPaused(false)
    setIsPlaying(true)
  }, [])

  // Toggle pause
  const togglePause = useCallback(() => {
    if (!isPlaying || gameOver) return
    setIsPaused(p => !p)
  }, [isPlaying, gameOver])

  // Render board with current piece
  const renderBoard = useCallback(() => {
    const display = board.map(row => [...row])

    // Add current piece to display
    if (piece) {
      for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
          if (piece.shape[r][c]) {
            const boardRow = piece.y + r
            const boardCol = piece.x + c
            if (boardRow >= 0 && boardRow < ROWS && boardCol >= 0 && boardCol < COLS) {
              display[boardRow][boardCol] = TETROMINOES[piece.type].color
            }
          }
        }
      }
    }

    return display
  }, [board, piece])

  const cellSize = isExpanded ? 'w-5 h-5' : 'w-3 h-3'
  const previewCellSize = isExpanded ? 'w-4 h-4' : 'w-2.5 h-2.5'
  const displayBoard = renderBoard()

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold">Container Tetris</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <div className="text-muted-foreground">Score</div>
            <div className="font-bold text-foreground">{score}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Level</div>
            <div className="font-bold text-purple-400">{level}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Lines</div>
            <div className="font-bold text-green-400">{lines}</div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isPlaying && !gameOver && (
            <button
              onClick={togglePause}
              className="p-1.5 rounded hover:bg-secondary"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={startGame}
            className="p-1.5 rounded hover:bg-secondary"
            title="New Game"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Game area */}
      <div className="flex-1 flex items-center justify-center gap-4">
        {/* Main board */}
        <div className="border border-border rounded overflow-hidden bg-zinc-900">
          {displayBoard.map((row, rowIdx) => (
            <div key={rowIdx} className="flex">
              {row.map((cell, colIdx) => (
                <div
                  key={colIdx}
                  className={`${cellSize} border border-zinc-800 ${cell || 'bg-zinc-900'}`}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4">
          {/* Next piece preview */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Next</div>
            <div className="border border-border rounded p-1 bg-zinc-900">
              {nextPiece.shape.map((row, r) => (
                <div key={r} className="flex">
                  {row.map((cell, c) => (
                    <div
                      key={c}
                      className={`${previewCellSize} ${cell ? TETROMINOES[nextPiece.type].color : 'bg-zinc-900'}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Controls hint */}
          {isExpanded && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>← → Move</div>
              <div>↓ Soft drop</div>
              <div>↑ Rotate</div>
              <div>Space Hard drop</div>
              <div>P Pause</div>
            </div>
          )}
        </div>
      </div>

      {/* Start overlay */}
      {!isPlaying && !gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <button
            onClick={startGame}
            className="px-6 py-3 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 font-semibold"
          >
            Start Game
          </button>
        </div>
      )}

      {/* Paused overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-foreground mb-4">Paused</div>
            <button
              onClick={togglePause}
              className="px-6 py-3 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 font-semibold"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-foreground mb-2">Game Over!</div>
            <div className="text-muted-foreground mb-4">Score: {score}</div>
            <button
              onClick={startGame}
              className="px-6 py-3 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 font-semibold"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
