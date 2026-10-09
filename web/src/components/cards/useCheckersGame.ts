import { useState, useEffect, useRef } from 'react'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { safeGetJSON, safeSetJSON, safeRemove } from '../../lib/safeLocalStorage'
import {
  AI_MOVE_DELAY_MS,
  CAPTURE_TAUNTS,
  COMBAT_ANIMATION_MS,
  DIFFICULTY_DEPTH,
  INITIAL_TAUNT_DELAY_MS,
  PIRATE_TAUNTS,
  PRE_GAME_TAUNTS,
  PRE_GAME_TAUNT_DELAY_MS,
  SCORE_STORAGE_KEY,
  TAUNT_CYCLE_INTERVAL_MS,
  TAUNT_DISPLAY_MS,
  type Board,
  type Difficulty,
  type Move,
  type Player,
  type Position,
} from './Checkers.types'
import {
  STORAGE_KEY,
  applyMove,
  countPieces,
  createInitialBoard,
  getAllMoves,
  getChainJumps,
  getValidMoves,
  loadGameState,
  minimax,
  saveGameState,
} from './Checkers.engine'

/** Game state, AI loop and handlers for the Checkers card. */
export function useCheckersGame() {
  const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tauntIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load saved game state on mount
  const savedState = loadGameState()

  const [board, setBoard] = useState<Board>(savedState?.board || createInitialBoard)
  const [currentPlayer, setCurrentPlayer] = useState<Player>(savedState?.currentPlayer || 'pods')
  const [selectedPos, setSelectedPos] = useState<Position | null>(null)
  const [validMoves, setValidMoves] = useState<Move[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty>(savedState?.difficulty || 'medium')
  const [isThinking, setIsThinking] = useState(false)
  const [gameOver, setGameOver] = useState<Player | 'draw' | null>(savedState?.gameOver || null)
  const [mustContinueJump, setMustContinueJump] = useState<Position | null>(null)
  const [moveCount, setMoveCount] = useState(savedState?.moveCount || 0)
  const [pirateTaunt, setPirateTaunt] = useState('')
  const [combatCell, setCombatCell] = useState<Position | null>(null)
  const [showCombat, setShowCombat] = useState(false)
  const [highScore, setHighScore] = useState<{ wins: number; losses: number }>(() =>
    safeGetJSON<{ wins: number; losses: number }>(SCORE_STORAGE_KEY, { wins: 0, losses: 0 }),
  )

  // Check for game over
  useEffect(() => {
    if (gameOver) return

    const podMoves = getAllMoves(board, 'pods')
    const nodeMoves = getAllMoves(board, 'nodes')
    const counts = countPieces(board)

    if (counts.pods === 0 || podMoves.length === 0) {
      setGameOver('nodes')
      emitGameEnded('checkers', 'loss', moveCount)
      setHighScore(prev => {
        const newScore = { ...prev, losses: prev.losses + 1 }
        safeSetJSON(SCORE_STORAGE_KEY, newScore)
        return newScore
      })
    } else if (counts.nodes === 0 || nodeMoves.length === 0) {
      setGameOver('pods')
      emitGameEnded('checkers', 'win', moveCount)
      setHighScore(prev => {
        const newScore = { ...prev, wins: prev.wins + 1 }
        safeSetJSON(SCORE_STORAGE_KEY, newScore)
        return newScore
      })
    }
  }, [board, gameOver, moveCount])

  // Save game state when it changes
  useEffect(() => {
    if (gameOver) {
      // Clear saved game on game over
      safeRemove(STORAGE_KEY)
    } else {
      saveGameState({
        board,
        currentPlayer,
        difficulty,
        moveCount,
        gameOver })
    }
  }, [board, currentPlayer, difficulty, moveCount, gameOver])

  // Pirate taunts while waiting for player
  useEffect(() => {
    if (currentPlayer !== 'pods' || gameOver || moveCount === 0) {
      if (tauntIntervalRef.current) {
        clearInterval(tauntIntervalRef.current)
        tauntIntervalRef.current = null
      }
      setPirateTaunt('')
      return
    }

    // Show initial taunt after a short delay
    const initialTimeout = setTimeout(() => {
      setPirateTaunt(PIRATE_TAUNTS[Math.floor(Math.random() * PIRATE_TAUNTS.length)])
    }, INITIAL_TAUNT_DELAY_MS)

    // Change taunt every 8 seconds
    tauntIntervalRef.current = setInterval(() => {
      setPirateTaunt(PIRATE_TAUNTS[Math.floor(Math.random() * PIRATE_TAUNTS.length)])
    }, TAUNT_CYCLE_INTERVAL_MS)

    return () => {
      clearTimeout(initialTimeout)
      if (tauntIntervalRef.current) {
        clearInterval(tauntIntervalRef.current)
      }
    }
  }, [currentPlayer, gameOver, moveCount])

  // Pre-game taunt after 2 seconds of being open
  useEffect(() => {
    if (moveCount > 0 || gameOver) return

    const timer = setTimeout(() => {
      setPirateTaunt(PRE_GAME_TAUNTS[Math.floor(Math.random() * PRE_GAME_TAUNTS.length)])
    }, PRE_GAME_TAUNT_DELAY_MS)

    return () => clearTimeout(timer)
  }, [moveCount, gameOver])

  // AI move - runs when it's the AI's turn (1 second delay)
  useEffect(() => {
    // Only start AI if it's nodes turn and game is active
    if (currentPlayer !== 'nodes' || gameOver) return

    // Prevent duplicate AI runs
    if (thinkingTimeoutRef.current) return

    setIsThinking(true)
    setPirateTaunt('') // Clear taunt while thinking

    // 1 second delay before AI moves
    thinkingTimeoutRef.current = setTimeout(() => {
      const depth = DIFFICULTY_DEPTH[difficulty]
      const result = minimax(board, depth, -Infinity, Infinity, true)

      if (result.move) {
        let newBoard = applyMove(board, result.move)
        let lastPos = result.move.to
        const capturedAny = result.move.isJump

        // Show combat animation for captures
        if (result.move.isJump && result.move.captures.length > 0) {
          setCombatCell(result.move.captures[0])
          setShowCombat(true)
          setTimeout(() => {
            setShowCombat(false)
            setCombatCell(null)
          }, COMBAT_ANIMATION_MS)
        }

        // Handle chain jumps
        if (result.move.isJump) {
          let chainMoves = getChainJumps(newBoard, lastPos)
          while (chainMoves.length > 0) {
            const chainMove = chainMoves[0]
            newBoard = applyMove(newBoard, chainMove)
            lastPos = chainMove.to
            chainMoves = getChainJumps(newBoard, lastPos)
          }
        }

        setBoard(newBoard)
        setMoveCount(m => m + 1)

        // Show capture taunt
        if (capturedAny) {
          setPirateTaunt(CAPTURE_TAUNTS[Math.floor(Math.random() * CAPTURE_TAUNTS.length)])
          setTimeout(() => setPirateTaunt(''), TAUNT_DISPLAY_MS)
        }
      }

      setCurrentPlayer('pods')
      setIsThinking(false)
      thinkingTimeoutRef.current = null
    }, AI_MOVE_DELAY_MS)

    return () => {
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current)
        thinkingTimeoutRef.current = null
      }
    }
  }, [board, currentPlayer, gameOver, difficulty]) // Trigger on board/player change

  // Handle cell click
  const handleCellClick = (row: number, col: number) => {
    if (currentPlayer !== 'pods' || gameOver || isThinking) return

    const piece = board[row][col]
    const clickedPos = { row, col }

    // If we must continue a jump, only allow clicking valid jump destinations
    if (mustContinueJump) {
      const jumpMove = validMoves.find(m =>
        m.to.row === row && m.to.col === col
      )
      if (jumpMove) {
        const newBoard = applyMove(board, jumpMove)
        setBoard(newBoard)
        setMoveCount(m => m + 1)

        // Check for more jumps
        const chainMoves = getChainJumps(newBoard, jumpMove.to)
        if (chainMoves.length > 0) {
          setMustContinueJump(jumpMove.to)
          setSelectedPos(jumpMove.to)
          setValidMoves(chainMoves)
        } else {
          setMustContinueJump(null)
          setSelectedPos(null)
          setValidMoves([])
          setCurrentPlayer('nodes')
        }
      }
      return
    }

    // Clicking on own piece - select it
    if (piece && piece.player === 'pods') {
      const allPlayerMoves = getAllMoves(board, 'pods')
      const hasJumps = allPlayerMoves.some(m => m.isJump)

      // Get moves for this piece
      let pieceMoves = getValidMoves(board, clickedPos)

      // If jumps are available anywhere, only show jumps
      if (hasJumps) {
        pieceMoves = pieceMoves.filter(m => m.isJump)
      }

      setSelectedPos(clickedPos)
      setValidMoves(pieceMoves)
      return
    }

    // Clicking on valid move destination
    if (selectedPos) {
      const move = validMoves.find(m =>
        m.to.row === row && m.to.col === col
      )

      if (move) {
        const newBoard = applyMove(board, move)
        setBoard(newBoard)
        setMoveCount(m => m + 1)

        // Check for chain jumps
        if (move.isJump) {
          const chainMoves = getChainJumps(newBoard, move.to)
          if (chainMoves.length > 0) {
            setMustContinueJump(move.to)
            setSelectedPos(move.to)
            setValidMoves(chainMoves)
            return
          }
        }

        setSelectedPos(null)
        setValidMoves([])
        setMustContinueJump(null)
        setCurrentPlayer('nodes')
      } else {
        // Clicked elsewhere, deselect
        setSelectedPos(null)
        setValidMoves([])
      }
    }
  }

  // New game
  const newGame = () => {
    setBoard(createInitialBoard())
    setCurrentPlayer('pods')
    setSelectedPos(null)
    setValidMoves([])
    setGameOver(null)
    setMustContinueJump(null)
    setMoveCount(0)
    setIsThinking(false)
    emitGameStarted('checkers')
  }

  return {
    board,
    currentPlayer,
    selectedPos,
    validMoves,
    difficulty,
    setDifficulty,
    isThinking,
    gameOver,
    mustContinueJump,
    moveCount,
    pirateTaunt,
    combatCell,
    showCombat,
    highScore,
    handleCellClick,
    newGame,
  }
}
