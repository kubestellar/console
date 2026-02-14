import { useState, useEffect, useCallback, useRef } from 'react'
import { Box, Server, Crown, RotateCcw, Trophy, Play, Loader2 } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

// Board is 8x8, pieces only on dark squares
const BOARD_SIZE = 8

type Player = 'pods' | 'nodes'
type PieceType = 'normal' | 'king'

interface Piece {
  player: Player
  type: PieceType
}

interface Position {
  row: number
  col: number
}

interface Move {
  from: Position
  to: Position
  captures: Position[]
  isJump: boolean
}

type Board = (Piece | null)[][]

type Difficulty = 'easy' | 'medium' | 'hard'

const DIFFICULTY_DEPTH: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
}

// Pirate jokes for the AI to say while waiting
const PIRATE_TAUNTS = [
  "Arrr, take yer time, landlubber! Me ship ain't goin' nowhere!",
  "Shiver me timbers! Is that the best move ye got?",
  "Yo ho ho! I've seen barnacles make faster moves!",
  "Blimey! Even me parrot could play better than this!",
  "Avast ye scallywag! Me treasure chest is getting dusty waitin'!",
  "Arrr, while ye think, I'll be countin' me doubloons!",
  "Walk the plank if ye can't decide soon!",
  "Ahoy! The seven seas will dry up before ye move!",
  "Ye fight like a dairy farmer! ...Oh wait, wrong game.",
  "Me wooden leg is fallin' asleep waitin' for ye!",
  "Arrr, I've pillaged whole villages faster than this!",
  "By Davy Jones' locker, make yer move already!",
  "Yo ho! Is the rum gone? I need somethin' to pass the time!",
  "Arrr, even a kraken shows more hustle!",
  "Shiver me circuits! Me nodes are gettin' restless!",
]

// Combat taunts when AI captures a piece
const CAPTURE_TAUNTS = [
  "Arrr! Another one walks the plank!",
  "Yo ho ho! That pod be swimmin' with the fishes now!",
  "Shiver me timbers! Got ye, ye scurvy pod!",
  "Avast! Down to Davy Jones with ye!",
  "Arrr! Me cannons sink another one!",
  "Blimey! That'll teach ye to cross Captain Node!",
]

// Initialize board with starting positions
function createInitialBoard(): Board {
  const board: Board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null))

  // Nodes (AI) on top 3 rows
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { player: 'nodes', type: 'normal' }
      }
    }
  }

  // Pods (player) on bottom 3 rows
  for (let row = 5; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { player: 'pods', type: 'normal' }
      }
    }
  }

  return board
}

// Deep clone board
function cloneBoard(board: Board): Board {
  return board.map(row => row.map(cell => cell ? { ...cell } : null))
}

// Get all valid moves for a piece
function getValidMoves(board: Board, pos: Position, mustJump: boolean = false): Move[] {
  const piece = board[pos.row][pos.col]
  if (!piece) return []

  const moves: Move[] = []
  const directions: number[] = []

  // Normal pieces move forward only, kings move both ways
  if (piece.type === 'king') {
    directions.push(-1, 1)
  } else {
    directions.push(piece.player === 'pods' ? -1 : 1)
  }

  // Check jumps first (captures)
  for (const dRow of directions) {
    for (const dCol of [-1, 1]) {
      const jumpRow = pos.row + dRow * 2
      const jumpCol = pos.col + dCol * 2
      const midRow = pos.row + dRow
      const midCol = pos.col + dCol

      if (jumpRow >= 0 && jumpRow < BOARD_SIZE && jumpCol >= 0 && jumpCol < BOARD_SIZE) {
        const midPiece = board[midRow][midCol]
        const destPiece = board[jumpRow][jumpCol]

        if (midPiece && midPiece.player !== piece.player && !destPiece) {
          moves.push({
            from: pos,
            to: { row: jumpRow, col: jumpCol },
            captures: [{ row: midRow, col: midCol }],
            isJump: true,
          })
        }
      }
    }
  }

  // If there are jumps or mustJump is set, only return jumps
  if (moves.length > 0 || mustJump) {
    return moves
  }

  // Simple moves (no capture)
  for (const dRow of directions) {
    for (const dCol of [-1, 1]) {
      const newRow = pos.row + dRow
      const newCol = pos.col + dCol

      if (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE) {
        if (!board[newRow][newCol]) {
          moves.push({
            from: pos,
            to: { row: newRow, col: newCol },
            captures: [],
            isJump: false,
          })
        }
      }
    }
  }

  return moves
}

// Get all valid moves for a player
function getAllMoves(board: Board, player: Player): Move[] {
  const allMoves: Move[] = []
  let hasJump = false

  // First pass: find all moves and check if any jumps exist
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col]
      if (piece && piece.player === player) {
        const moves = getValidMoves(board, { row, col })
        for (const move of moves) {
          if (move.isJump) hasJump = true
          allMoves.push(move)
        }
      }
    }
  }

  // If any jump exists, filter to only jumps (mandatory capture)
  if (hasJump) {
    return allMoves.filter(m => m.isJump)
  }

  return allMoves
}

// Apply a move to the board
function applyMove(board: Board, move: Move): Board {
  const newBoard = cloneBoard(board)
  const piece = newBoard[move.from.row][move.from.col]!

  // Move piece
  newBoard[move.to.row][move.to.col] = piece
  newBoard[move.from.row][move.from.col] = null

  // Remove captured pieces
  for (const cap of move.captures) {
    newBoard[cap.row][cap.col] = null
  }

  // Promote to king
  if (piece.type === 'normal') {
    if ((piece.player === 'pods' && move.to.row === 0) ||
        (piece.player === 'nodes' && move.to.row === BOARD_SIZE - 1)) {
      newBoard[move.to.row][move.to.col] = { ...piece, type: 'king' }
    }
  }

  return newBoard
}

// Check for additional jumps after a capture
function getChainJumps(board: Board, pos: Position): Move[] {
  return getValidMoves(board, pos, true)
}

// Count pieces for evaluation
function countPieces(board: Board): { pods: number; nodes: number; podKings: number; nodeKings: number } {
  let pods = 0, nodes = 0, podKings = 0, nodeKings = 0

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col]
      if (piece) {
        if (piece.player === 'pods') {
          pods++
          if (piece.type === 'king') podKings++
        } else {
          nodes++
          if (piece.type === 'king') nodeKings++
        }
      }
    }
  }

  return { pods, nodes, podKings, nodeKings }
}

// Evaluate board position (positive = good for nodes/AI)
function evaluateBoard(board: Board): number {
  const counts = countPieces(board)

  // Check for game over
  const podMoves = getAllMoves(board, 'pods')
  const nodeMoves = getAllMoves(board, 'nodes')

  if (counts.pods === 0 || podMoves.length === 0) return 1000 // AI wins
  if (counts.nodes === 0 || nodeMoves.length === 0) return -1000 // Player wins

  // Material value (kings worth 1.5x)
  const nodeValue = counts.nodes + counts.nodeKings * 0.5
  const podValue = counts.pods + counts.podKings * 0.5

  // Position bonus (center control, advancement)
  let positionScore = 0
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col]
      if (piece) {
        const centerBonus = (3.5 - Math.abs(col - 3.5)) * 0.1
        if (piece.player === 'nodes') {
          positionScore += row * 0.1 + centerBonus // Advance bonus
        } else {
          positionScore -= (7 - row) * 0.1 + centerBonus
        }
      }
    }
  }

  return (nodeValue - podValue) * 10 + positionScore
}

// Minimax with alpha-beta pruning
function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean
): { score: number; move: Move | null } {
  const player = maximizing ? 'nodes' : 'pods'
  const moves = getAllMoves(board, player)

  // Terminal conditions
  if (depth === 0 || moves.length === 0) {
    return { score: evaluateBoard(board), move: null }
  }

  let bestMove: Move | null = null

  if (maximizing) {
    let maxScore = -Infinity
    for (const move of moves) {
      let newBoard = applyMove(board, move)

      // Handle chain jumps
      if (move.isJump) {
        let chainMoves = getChainJumps(newBoard, move.to)
        while (chainMoves.length > 0) {
          // For AI, pick the best chain jump
          const chainMove = chainMoves[0]
          newBoard = applyMove(newBoard, chainMove)
          chainMoves = getChainJumps(newBoard, chainMove.to)
        }
      }

      const result = minimax(newBoard, depth - 1, alpha, beta, false)
      if (result.score > maxScore) {
        maxScore = result.score
        bestMove = move
      }
      alpha = Math.max(alpha, result.score)
      if (beta <= alpha) break
    }
    return { score: maxScore, move: bestMove }
  } else {
    let minScore = Infinity
    for (const move of moves) {
      let newBoard = applyMove(board, move)

      if (move.isJump) {
        let chainMoves = getChainJumps(newBoard, move.to)
        while (chainMoves.length > 0) {
          const chainMove = chainMoves[0]
          newBoard = applyMove(newBoard, chainMove)
          chainMoves = getChainJumps(newBoard, chainMove.to)
        }
      }

      const result = minimax(newBoard, depth - 1, alpha, beta, true)
      if (result.score < minScore) {
        minScore = result.score
        bestMove = move
      }
      beta = Math.min(beta, result.score)
      if (beta <= alpha) break
    }
    return { score: minScore, move: bestMove }
  }
}

// Piece component
function PieceComponent({
  piece,
  isSelected,
  isSmall,
}: {
  piece: Piece
  isSelected: boolean
  isSmall: boolean
}) {
  const isPod = piece.player === 'pods'
  const isKing = piece.type === 'king'

  return (
    <div
      className={`
        ${isSmall ? 'w-6 h-6' : 'w-10 h-10'} rounded-full flex items-center justify-center
        ${isPod ? 'bg-blue-500' : 'bg-orange-500'}
        ${isSelected ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-background' : ''}
        shadow-md transition-all
      `}
    >
      {isKing ? (
        <Crown className={`${isSmall ? 'w-3 h-3' : 'w-5 h-5'} text-yellow-300`} />
      ) : isPod ? (
        <Box className={`${isSmall ? 'w-3 h-3' : 'w-5 h-5'} text-blue-100`} />
      ) : (
        <Server className={`${isSmall ? 'w-3 h-3' : 'w-5 h-5'} text-orange-100`} />
      )}
    </div>
  )
}

// Storage key for game state
const STORAGE_KEY = 'checkers-game-state'

interface SavedGameState {
  board: Board
  currentPlayer: Player
  difficulty: Difficulty
  moveCount: number
  gameOver: Player | 'draw' | null
}

function loadGameState(): SavedGameState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function saveGameState(state: SavedGameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage errors
  }
}

export function Checkers(_props: CardComponentProps) {
  const { t } = useTranslation(['cards', 'common'])
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0 })
  const { isExpanded } = useCardExpanded()
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
  const [highScore, setHighScore] = useState<{ wins: number; losses: number }>(() => {
    try {
      const stored = localStorage.getItem('checkers-score')
      return stored ? JSON.parse(stored) : { wins: 0, losses: 0 }
    } catch {
      return { wins: 0, losses: 0 }
    }
  })

  // Check for game over
  useEffect(() => {
    if (gameOver) return

    const podMoves = getAllMoves(board, 'pods')
    const nodeMoves = getAllMoves(board, 'nodes')
    const counts = countPieces(board)

    if (counts.pods === 0 || podMoves.length === 0) {
      setGameOver('nodes')
      setHighScore(prev => {
        const newScore = { ...prev, losses: prev.losses + 1 }
        localStorage.setItem('checkers-score', JSON.stringify(newScore))
        return newScore
      })
    } else if (counts.nodes === 0 || nodeMoves.length === 0) {
      setGameOver('pods')
      setHighScore(prev => {
        const newScore = { ...prev, wins: prev.wins + 1 }
        localStorage.setItem('checkers-score', JSON.stringify(newScore))
        return newScore
      })
    }
  }, [board, gameOver])

  // Save game state when it changes
  useEffect(() => {
    if (gameOver) {
      // Clear saved game on game over
      localStorage.removeItem(STORAGE_KEY)
    } else {
      saveGameState({
        board,
        currentPlayer,
        difficulty,
        moveCount,
        gameOver,
      })
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
    }, 3000)

    // Change taunt every 8 seconds
    tauntIntervalRef.current = setInterval(() => {
      setPirateTaunt(PIRATE_TAUNTS[Math.floor(Math.random() * PIRATE_TAUNTS.length)])
    }, 8000)

    return () => {
      clearTimeout(initialTimeout)
      if (tauntIntervalRef.current) {
        clearInterval(tauntIntervalRef.current)
      }
    }
  }, [currentPlayer, gameOver, moveCount])

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
          }, 500)
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
          setTimeout(() => setPirateTaunt(''), 3000)
        }
      }

      setCurrentPlayer('pods')
      setIsThinking(false)
      thinkingTimeoutRef.current = null
    }, 1000) // 1 second delay before AI moves

    return () => {
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current)
        thinkingTimeoutRef.current = null
      }
    }
  }, [currentPlayer, gameOver]) // Only trigger on player change or game over

  // Handle cell click
  const handleCellClick = useCallback((row: number, col: number) => {
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
  }, [board, currentPlayer, selectedPos, validMoves, gameOver, isThinking, mustContinueJump])

  // New game
  const newGame = useCallback(() => {
    setBoard(createInitialBoard())
    setCurrentPlayer('pods')
    setSelectedPos(null)
    setValidMoves([])
    setGameOver(null)
    setMustContinueJump(null)
    setMoveCount(0)
    setIsThinking(false)
  }, [])

  const isSmall = !isExpanded
  const cellSize = isSmall ? 'w-7 h-7' : 'w-12 h-12'

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Box className="w-3 h-3 text-blue-400" />
            {t('checkers.you')}
          </span>
          <span>{t('checkers.vs')}</span>
          <span className="flex items-center gap-1">
            <Server className="w-3 h-3 text-orange-400" />
            {t('checkers.ai')}
          </span>
          <span className="text-yellow-400">
            {t('checkers.wins')}:{highScore.wins} {t('checkers.losses')}:{highScore.losses}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            className="text-xs bg-secondary border border-border rounded px-1.5 py-1"
            disabled={moveCount > 0 && !gameOver}
          >
            <option value="easy">{t('checkers.easy')}</option>
            <option value="medium">{t('checkers.medium')}</option>
            <option value="hard">{t('checkers.hard')}</option>
          </select>
          <button
            onClick={newGame}
            className="p-1.5 rounded hover:bg-secondary"
            title={t('checkers.newGame')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="text-center text-xs mb-2">
        {isThinking ? (
          <span className="flex items-center justify-center gap-1 text-orange-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('checkers.aiThinking')}
          </span>
        ) : gameOver ? (
          <span className={gameOver === 'pods' ? 'text-blue-400' : 'text-orange-400'}>
            {gameOver === 'pods' ? t('checkers.youWin') : t('checkers.aiWins')}
          </span>
        ) : mustContinueJump ? (
          <span className="text-yellow-400">{t('checkers.continueJumping')}</span>
        ) : (
          <span className={currentPlayer === 'pods' ? 'text-blue-400' : 'text-orange-400'}>
            {currentPlayer === 'pods' ? t('checkers.yourTurn') : t('checkers.aisTurn')}
          </span>
        )}
      </div>

      {/* Pirate Taunt Speech Bubble */}
      {pirateTaunt && (
        <div className="flex items-start gap-2 mb-2 px-2 animate-fade-in">
          <div className="text-2xl flex-shrink-0">🏴‍☠️</div>
          <div className="relative bg-orange-500/20 border border-orange-400/50 rounded-lg px-3 py-2 flex-1">
            <div className="absolute -left-2 top-3 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[8px] border-r-orange-400/50" />
            <span className="text-orange-300 italic text-sm font-medium leading-tight block">
              &quot;{pirateTaunt}&quot;
            </span>
          </div>
        </div>
      )}

      {/* Board */}
      <div className="flex-1 flex items-center justify-center">
        <div className="inline-block border border-border rounded overflow-hidden">
          {board.map((row, rowIdx) => (
            <div key={rowIdx} className="flex">
              {row.map((piece, colIdx) => {
                const isDark = (rowIdx + colIdx) % 2 === 1
                const isSelected = selectedPos?.row === rowIdx && selectedPos?.col === colIdx
                const isValidMove = validMoves.some(m => m.to.row === rowIdx && m.to.col === colIdx)
                const isCapture = validMoves.some(m =>
                  m.to.row === rowIdx && m.to.col === colIdx && m.isJump
                )
                const isCombatCell = showCombat && combatCell?.row === rowIdx && combatCell?.col === colIdx

                return (
                  <div
                    key={colIdx}
                    onClick={() => handleCellClick(rowIdx, colIdx)}
                    className={`
                      ${cellSize} flex items-center justify-center cursor-pointer transition-colors relative
                      ${isDark ? 'bg-emerald-800' : 'bg-emerald-200'}
                      ${isValidMove && !isCapture ? 'ring-2 ring-inset ring-green-400' : ''}
                      ${isCapture ? 'ring-2 ring-inset ring-red-400 bg-red-500/30' : ''}
                      ${isSelected ? 'bg-yellow-500/30' : ''}
                      ${isCombatCell ? 'animate-pulse bg-red-600' : ''}
                    `}>
                    {/* Combat explosion effect */}
                    {isCombatCell && (
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <span className="text-2xl animate-bounce">💥</span>
                      </div>
                    )}
                    {piece && (
                      <PieceComponent
                        piece={piece}
                        isSelected={isSelected}
                        isSmall={isSmall}
                      />
                    )}
                    {isValidMove && !piece && (
                      <div className={`${isSmall ? 'w-2 h-2' : 'w-3 h-3'} rounded-full ${isCapture ? 'bg-red-400' : 'bg-green-400'} opacity-60`} />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Game over overlay */}
      {gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center p-6 bg-card rounded-xl border border-border shadow-lg">
            <Trophy className={`w-12 h-12 mx-auto mb-3 ${gameOver === 'pods' ? 'text-blue-400' : 'text-orange-400'}`} />
            <h3 className="text-xl font-bold text-foreground mb-2">
              {gameOver === 'pods' ? t('checkers.youWon') : t('checkers.aiWinsExclaim')}
            </h3>
            <p className="text-muted-foreground mb-4">
              {moveCount} {t('checkers.movesPlayed')}
            </p>
            <button
              onClick={newGame}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg mx-auto hover:bg-purple-500/30"
            >
              <Play className="w-4 h-4" />
              {t('checkers.playAgain')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
