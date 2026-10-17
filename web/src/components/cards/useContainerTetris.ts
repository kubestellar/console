import { useState, useEffect, useCallback, useRef } from 'react'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeys } from '../../hooks/useGameKeys'
import { safeGet, safeSet } from '../../lib/safeLocalStorage'
import {
  ROWS,
  COLS,
  Board,
  Piece,
  TetrominoType,
  createBoard,
  rotateShape,
  isValidPosition,
  placePiece,
  clearLines,
  calculateScore
} from './containerTetrisHelpers'

// High-score key — persisted via safe wrapper so private-mode browsers
// don't throw (issue #8935, same pattern as #8938).
const TETRIS_HIGHSCORE_KEY = 'highscore-containerTetris'

// Game timing (milliseconds)
const TETRIS_NEXT_TICK_MS = 10

// Tetromino shapes (I, O, T, S, Z, J, L)
export const TETROMINOES = {
  I: {
    shape: [[1, 1, 1, 1]],
    color: 'bg-cyan-500' },
  O: {
    shape: [[1, 1], [1, 1]],
    color: 'bg-yellow-500' },
  T: {
    shape: [[0, 1, 0], [1, 1, 1]],
    color: 'bg-purple-500' },
  S: {
    shape: [[0, 1, 1], [1, 1, 0]],
    color: 'bg-green-500' },
  Z: {
    shape: [[1, 1, 0], [0, 1, 1]],
    color: 'bg-red-500' },
  J: {
    shape: [[1, 0, 0], [1, 1, 1]],
    color: 'bg-blue-500' },
  L: {
    shape: [[0, 0, 1], [1, 1, 1]],
    color: 'bg-orange-500' } }



// Get random tetromino
function getRandomPiece(): Piece {
  const types = Object.keys(TETROMINOES) as TetrominoType[]
  const type = types[Math.floor(Math.random() * types.length)]
  return {
    type,
    shape: TETROMINOES[type].shape.map(row => [...row]),
    x: Math.floor((COLS - TETROMINOES[type].shape[0].length) / 2),
    y: -1 }
}

export function useContainerTetris() {
  const [board, setBoard] = useState<Board>(() => createBoard(ROWS, COLS))
  const [piece, setPiece] = useState<Piece | null>(null)
  const [nextPiece, setNextPiece] = useState<Piece>(() => getRandomPiece())
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lines, setLines] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [highScore, setHighScore] = useState<number>(() => {
    const saved = safeGet(TETRIS_HIGHSCORE_KEY)
    return saved ? parseInt(saved, 10) || 0 : 0
  })

  // Persist high score when game ends and score beats the stored best.
  useEffect(() => {
    if (gameOver && score > highScore) {
      setHighScore(score)
      safeSet(TETRIS_HIGHSCORE_KEY, score.toString())
    }
  }, [gameOver, score, highScore])

  const gameContainerRef = useRef<HTMLDivElement>(null)
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Calculate drop speed based on level
  const getDropSpeed = useCallback(() => {
    return Math.max(100, 1000 - (level - 1) * 100)
  }, [level])

  // Move piece down
  const moveDown = useCallback(() => {
    if (!piece || gameOver || isPaused) return

    const newPiece = { ...piece, y: piece.y + 1 }

    if (isValidPosition(board, newPiece.shape, newPiece.x, newPiece.y)) {
      setPiece(newPiece)
    } else {
      // Piece has landed
      const newBoard = placePiece(board, piece.shape, piece.x, piece.y, TETROMINOES[piece.type].color)

      // Check for game over (piece landed above board)
      if (piece.y < 0) {
        setGameOver(true)
        setIsPlaying(false)
        emitGameEnded('tetris', 'loss', score)
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
    // Preserve the existing callback dependencies during this extraction.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- moved verbatim from ContainerTetris; score dependency repair is separate
  }, [piece, board, gameOver, isPaused, nextPiece, level])

  // Move piece left/right
  const moveHorizontal = (dir: -1 | 1) => {
    if (!piece || gameOver || isPaused) return

    const newPiece = { ...piece, x: piece.x + dir }
    if (isValidPosition(board, newPiece.shape, newPiece.x, newPiece.y)) {
      setPiece(newPiece)
    }
  }

  // Rotate piece
  const rotate = () => {
    if (!piece || gameOver || isPaused) return

    const newShape = rotateShape(piece.shape)
    const newPiece = { ...piece, shape: newShape }

    // Try to fit rotated piece (wall kick)
    for (const offset of [0, -1, 1, -2, 2]) {
      const adjusted = { ...newPiece, x: newPiece.x + offset }
      if (isValidPosition(board, adjusted.shape, adjusted.x, adjusted.y)) {
        setPiece(adjusted)
        return
      }
    }
  }

  // Hard drop
  const hardDrop = () => {
    if (!piece || gameOver || isPaused) return

    const newPiece = { ...piece }
    while (isValidPosition(board, newPiece.shape, newPiece.x, newPiece.y + 1)) {
      newPiece.y++
    }
    setPiece(newPiece)
    // Force immediate landing on next tick
    setTimeout(moveDown, TETRIS_NEXT_TICK_MS)
  }

  // Keyboard controls — scoped to visible game container (KeepAlive-safe)
  const handleTetrisKeyDown = (e: KeyboardEvent) => {
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
  useGameKeys(gameContainerRef, { onKeyDown: handleTetrisKeyDown })

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
  const startGame = () => {
    setBoard(createBoard(ROWS, COLS))
    setPiece(getRandomPiece())
    setNextPiece(getRandomPiece())
    setScore(0)
    setLevel(1)
    setLines(0)
    setGameOver(false)
    setIsPaused(false)
    setIsPlaying(true)
    emitGameStarted('tetris')
  }

  // Toggle pause
  const togglePause = () => {
    if (!isPlaying || gameOver) return
    setIsPaused(p => !p)
  }

  // Render board with current piece
  const renderBoard = () => {
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
  }

  const displayBoard = renderBoard()
  return { gameContainerRef, score, level, lines, highScore, isPlaying, gameOver, isPaused, togglePause, startGame, nextPiece, displayBoard }
}
