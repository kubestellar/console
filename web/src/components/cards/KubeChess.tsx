import { useState, useEffect, useCallback, useMemo } from 'react'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { RotateCcw, ChevronLeft, ChevronRight, Crown, Settings } from 'lucide-react'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useTranslation } from 'react-i18next'

// Chess piece types
type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' // King, Queen, Rook, Bishop, kNight, Pawn
type Color = 'white' | 'black'

interface Piece {
  type: PieceType
  color: Color
}

type Square = Piece | null
type Board = Square[][]

interface Move {
  from: { row: number; col: number }
  to: { row: number; col: number }
  piece: Piece
  captured?: Piece
  promotion?: PieceType
  castle?: 'kingside' | 'queenside'
  enPassant?: boolean
}

interface GameState {
  board: Board
  turn: Color
  moveHistory: Move[]
  castlingRights: {
    white: { kingside: boolean; queenside: boolean }
    black: { kingside: boolean; queenside: boolean }
  }
  enPassantTarget: { row: number; col: number } | null
  halfMoveClock: number
  fullMoveNumber: number
}

// Piece symbols for display
const PIECE_SYMBOLS: Record<Color, Record<PieceType, string>> = {
  white: { K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659' },
  black: { K: '\u265A', Q: '\u265B', R: '\u265C', B: '\u265D', N: '\u265E', P: '\u265F' }
}

// Piece values for evaluation
const PIECE_VALUES: Record<PieceType, number> = {
  K: 0, // King is invaluable
  Q: 900,
  R: 500,
  B: 330,
  N: 320,
  P: 100
}

// Position bonuses for pieces (center control, development, etc.)
const PAWN_TABLE = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0]
]

const KNIGHT_TABLE = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
]

const STORAGE_KEY = 'kube_chess_state'
const STORAGE_KEY_STATS = 'kube_chess_stats'

// Initialize the starting position
function createInitialBoard(): Board {
  const board: Board = Array(8).fill(null).map(() => Array(8).fill(null))

  // Set up pawns
  for (let col = 0; col < 8; col++) {
    board[1][col] = { type: 'P', color: 'black' }
    board[6][col] = { type: 'P', color: 'white' }
  }

  // Set up other pieces
  const backRow: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  for (let col = 0; col < 8; col++) {
    board[0][col] = { type: backRow[col], color: 'black' }
    board[7][col] = { type: backRow[col], color: 'white' }
  }

  return board
}

function createInitialState(): GameState {
  return {
    board: createInitialBoard(),
    turn: 'white',
    moveHistory: [],
    castlingRights: {
      white: { kingside: true, queenside: true },
      black: { kingside: true, queenside: true }
    },
    enPassantTarget: null,
    halfMoveClock: 0,
    fullMoveNumber: 1
  }
}

// Check if a square is on the board
function isValidSquare(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8
}

// Get all possible moves for a piece (without checking for check)
function getPieceMoves(board: Board, row: number, col: number, state: GameState): { row: number; col: number }[] {
  const piece = board[row][col]
  if (!piece) return []

  const moves: { row: number; col: number }[] = []
  const { color, type } = piece

  const directions: Record<string, number[][]> = {
    R: [[0, 1], [0, -1], [1, 0], [-1, 0]],
    B: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    Q: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
    K: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
    N: [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]
  }

  if (type === 'P') {
    const direction = color === 'white' ? -1 : 1
    const startRow = color === 'white' ? 6 : 1

    // Forward move
    if (isValidSquare(row + direction, col) && !board[row + direction][col]) {
      moves.push({ row: row + direction, col })
      // Double move from start
      if (row === startRow && !board[row + 2 * direction][col]) {
        moves.push({ row: row + 2 * direction, col })
      }
    }

    // Captures
    for (const dc of [-1, 1]) {
      const newRow = row + direction
      const newCol = col + dc
      if (isValidSquare(newRow, newCol)) {
        const target = board[newRow][newCol]
        if (target && target.color !== color) {
          moves.push({ row: newRow, col: newCol })
        }
        // En passant
        if (state.enPassantTarget && state.enPassantTarget.row === newRow && state.enPassantTarget.col === newCol) {
          moves.push({ row: newRow, col: newCol })
        }
      }
    }
  } else if (type === 'N') {
    for (const [dr, dc] of directions.N) {
      const newRow = row + dr
      const newCol = col + dc
      if (isValidSquare(newRow, newCol)) {
        const target = board[newRow][newCol]
        if (!target || target.color !== color) {
          moves.push({ row: newRow, col: newCol })
        }
      }
    }
  } else if (type === 'K') {
    for (const [dr, dc] of directions.K) {
      const newRow = row + dr
      const newCol = col + dc
      if (isValidSquare(newRow, newCol)) {
        const target = board[newRow][newCol]
        if (!target || target.color !== color) {
          moves.push({ row: newRow, col: newCol })
        }
      }
    }
    // Castling
    const rights = state.castlingRights[color]
    const backRank = color === 'white' ? 7 : 0
    if (row === backRank && col === 4) {
      if (rights.kingside && !board[backRank][5] && !board[backRank][6]) {
        moves.push({ row: backRank, col: 6 })
      }
      if (rights.queenside && !board[backRank][1] && !board[backRank][2] && !board[backRank][3]) {
        moves.push({ row: backRank, col: 2 })
      }
    }
  } else {
    // Sliding pieces (R, B, Q)
    const dirs = type === 'R' ? directions.R : type === 'B' ? directions.B : directions.Q
    for (const [dr, dc] of dirs) {
      let newRow = row + dr
      let newCol = col + dc
      while (isValidSquare(newRow, newCol)) {
        const target = board[newRow][newCol]
        if (!target) {
          moves.push({ row: newRow, col: newCol })
        } else {
          if (target.color !== color) {
            moves.push({ row: newRow, col: newCol })
          }
          break
        }
        newRow += dr
        newCol += dc
      }
    }
  }

  return moves
}

// Find the king position
function findKing(board: Board, color: Color): { row: number; col: number } | null {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (piece && piece.type === 'K' && piece.color === color) {
        return { row, col }
      }
    }
  }
  return null
}

// Check if a color is in check
function isInCheck(board: Board, color: Color, state: GameState): boolean {
  const kingPos = findKing(board, color)
  if (!kingPos) return false

  const opponent = color === 'white' ? 'black' : 'white'

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (piece && piece.color === opponent) {
        const moves = getPieceMoves(board, row, col, state)
        if (moves.some(m => m.row === kingPos.row && m.col === kingPos.col)) {
          return true
        }
      }
    }
  }
  return false
}

// Make a move and return the new state
function makeMove(state: GameState, from: { row: number; col: number }, to: { row: number; col: number }, promotion?: PieceType): GameState {
  const newBoard = state.board.map(row => [...row])
  const piece = newBoard[from.row][from.col]!
  const captured = newBoard[to.row][to.col]

  // Handle en passant capture
  let enPassantCapture = false
  if (piece.type === 'P' && state.enPassantTarget &&
      to.row === state.enPassantTarget.row && to.col === state.enPassantTarget.col) {
    const captureRow = piece.color === 'white' ? to.row + 1 : to.row - 1
    newBoard[captureRow][to.col] = null
    enPassantCapture = true
  }

  // Handle castling
  let castle: 'kingside' | 'queenside' | undefined
  if (piece.type === 'K' && Math.abs(to.col - from.col) === 2) {
    castle = to.col > from.col ? 'kingside' : 'queenside'
    const rookFromCol = castle === 'kingside' ? 7 : 0
    const rookToCol = castle === 'kingside' ? 5 : 3
    newBoard[from.row][rookToCol] = newBoard[from.row][rookFromCol]
    newBoard[from.row][rookFromCol] = null
  }

  // Move the piece
  newBoard[to.row][to.col] = piece
  newBoard[from.row][from.col] = null

  // Handle promotion
  if (piece.type === 'P' && (to.row === 0 || to.row === 7)) {
    newBoard[to.row][to.col] = { type: promotion || 'Q', color: piece.color }
  }

  // Update castling rights
  const newCastlingRights = {
    white: { ...state.castlingRights.white },
    black: { ...state.castlingRights.black }
  }

  if (piece.type === 'K') {
    newCastlingRights[piece.color] = { kingside: false, queenside: false }
  } else if (piece.type === 'R') {
    if (from.col === 0) newCastlingRights[piece.color].queenside = false
    if (from.col === 7) newCastlingRights[piece.color].kingside = false
  }

  // Update en passant target
  let newEnPassantTarget: { row: number; col: number } | null = null
  if (piece.type === 'P' && Math.abs(to.row - from.row) === 2) {
    newEnPassantTarget = { row: (from.row + to.row) / 2, col: from.col }
  }

  const move: Move = {
    from, to, piece,
    captured: captured || undefined,
    promotion: promotion,
    castle,
    enPassant: enPassantCapture
  }

  return {
    board: newBoard,
    turn: state.turn === 'white' ? 'black' : 'white',
    moveHistory: [...state.moveHistory, move],
    castlingRights: newCastlingRights,
    enPassantTarget: newEnPassantTarget,
    halfMoveClock: captured || piece.type === 'P' ? 0 : state.halfMoveClock + 1,
    fullMoveNumber: state.turn === 'black' ? state.fullMoveNumber + 1 : state.fullMoveNumber
  }
}

// Get all legal moves for a color
function getAllLegalMoves(state: GameState, color: Color): { from: { row: number; col: number }; to: { row: number; col: number } }[] {
  const moves: { from: { row: number; col: number }; to: { row: number; col: number } }[] = []

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col]
      if (piece && piece.color === color) {
        const pieceMoves = getPieceMoves(state.board, row, col, state)
        for (const to of pieceMoves) {
          // Check if the move leaves the king in check
          const newState = makeMove(state, { row, col }, to)
          if (!isInCheck(newState.board, color, newState)) {
            moves.push({ from: { row, col }, to })
          }
        }
      }
    }
  }

  return moves
}

// Check for checkmate or stalemate
function getGameResult(state: GameState): 'checkmate' | 'stalemate' | 'ongoing' {
  const legalMoves = getAllLegalMoves(state, state.turn)
  if (legalMoves.length === 0) {
    return isInCheck(state.board, state.turn, state) ? 'checkmate' : 'stalemate'
  }
  return 'ongoing'
}

// Evaluate board position
function evaluateBoard(board: Board, state: GameState): number {
  let score = 0

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (piece) {
        let pieceScore = PIECE_VALUES[piece.type]

        // Add position bonus
        if (piece.type === 'P') {
          pieceScore += piece.color === 'white' ? PAWN_TABLE[row][col] : PAWN_TABLE[7-row][col]
        } else if (piece.type === 'N') {
          pieceScore += piece.color === 'white' ? KNIGHT_TABLE[row][col] : KNIGHT_TABLE[7-row][col]
        }

        score += piece.color === 'white' ? pieceScore : -pieceScore
      }
    }
  }

  // Bonus for check
  if (isInCheck(board, 'black', state)) score += 50
  if (isInCheck(board, 'white', state)) score -= 50

  return score
}

// Minimax with alpha-beta pruning
function minimax(state: GameState, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (depth === 0) {
    return evaluateBoard(state.board, state)
  }

  const result = getGameResult(state)
  if (result === 'checkmate') {
    return maximizing ? -10000 + state.moveHistory.length : 10000 - state.moveHistory.length
  }
  if (result === 'stalemate') {
    return 0
  }

  const moves = getAllLegalMoves(state, state.turn)

  if (maximizing) {
    let maxEval = -Infinity
    for (const move of moves) {
      const newState = makeMove(state, move.from, move.to)
      const evalScore = minimax(newState, depth - 1, alpha, beta, false)
      maxEval = Math.max(maxEval, evalScore)
      alpha = Math.max(alpha, evalScore)
      if (beta <= alpha) break
    }
    return maxEval
  } else {
    let minEval = Infinity
    for (const move of moves) {
      const newState = makeMove(state, move.from, move.to)
      const evalScore = minimax(newState, depth - 1, alpha, beta, true)
      minEval = Math.min(minEval, evalScore)
      beta = Math.min(beta, evalScore)
      if (beta <= alpha) break
    }
    return minEval
  }
}

// AI move selection
function findBestMove(state: GameState, depth: number): { from: { row: number; col: number }; to: { row: number; col: number } } | null {
  const moves = getAllLegalMoves(state, state.turn)
  if (moves.length === 0) return null

  let bestMove = moves[0]
  let bestScore = state.turn === 'white' ? -Infinity : Infinity

  for (const move of moves) {
    const newState = makeMove(state, move.from, move.to)
    const score = minimax(newState, depth - 1, -Infinity, Infinity, state.turn === 'black')

    if (state.turn === 'white' && score > bestScore) {
      bestScore = score
      bestMove = move
    } else if (state.turn === 'black' && score < bestScore) {
      bestScore = score
      bestMove = move
    }
  }

  return bestMove
}

function KubeChessInternal() {
  const { isExpanded } = useCardExpanded()

  const [gameState, setGameState] = useState<GameState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return createInitialState()
  })

  const [selectedSquare, setSelectedSquare] = useState<{ row: number; col: number } | null>(null)
  const [validMoves, setValidMoves] = useState<{ row: number; col: number }[]>([])
  const [playerColor, setPlayerColor] = useState<Color>('white')
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2) // 1=easy, 2=medium, 3=hard
  const [isThinking, setIsThinking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [promotionPending, setPromotionPending] = useState<{ from: { row: number; col: number }; to: { row: number; col: number } } | null>(null)
  const [stats, setStats] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STATS)
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return { wins: 0, losses: 0, draws: 0 }
  })

  const gameResult = useMemo(() => getGameResult(gameState), [gameState])
  const inCheck = useMemo(() => isInCheck(gameState.board, gameState.turn, gameState), [gameState])

  // Save game state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState))
  }, [gameState])

  // Save stats
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(stats))
  }, [stats])

  // AI move
  useEffect(() => {
    if (gameState.turn !== playerColor && gameResult === 'ongoing' && !isThinking) {
      setIsThinking(true)

      // Use setTimeout to allow UI to update
      const id = setTimeout(() => {
        const depth = difficulty + 1 // 2, 3, or 4
        const bestMove = findBestMove(gameState, depth)

        if (bestMove) {
          setGameState(prev => makeMove(prev, bestMove.from, bestMove.to))
        }

        setIsThinking(false)
      }, 300)
      return () => clearTimeout(id)
    }
  }, [gameState.turn, playerColor, gameResult, difficulty, isThinking, gameState])

  // Update stats on game end
  useEffect(() => {
    if (gameResult !== 'ongoing') {
      if (gameResult === 'stalemate') {
        setStats((prev: typeof stats) => ({ ...prev, draws: prev.draws + 1 }))
      } else {
        const winner = gameState.turn === 'white' ? 'black' : 'white'
        if (winner === playerColor) {
          setStats((prev: typeof stats) => ({ ...prev, wins: prev.wins + 1 }))
        } else {
          setStats((prev: typeof stats) => ({ ...prev, losses: prev.losses + 1 }))
        }
      }
    }
  }, [gameResult, gameState.turn, playerColor])

  // Handle square click
  const handleSquareClick = useCallback((row: number, col: number) => {
    if (gameState.turn !== playerColor || gameResult !== 'ongoing' || isThinking) return

    const piece = gameState.board[row][col]

    // If a piece is selected
    if (selectedSquare) {
      // Check if clicking a valid move
      const isValidMove = validMoves.some(m => m.row === row && m.col === col)

      if (isValidMove) {
        const movingPiece = gameState.board[selectedSquare.row][selectedSquare.col]

        // Check for pawn promotion
        if (movingPiece?.type === 'P' && (row === 0 || row === 7)) {
          setPromotionPending({ from: selectedSquare, to: { row, col } })
        } else {
          setGameState(prev => makeMove(prev, selectedSquare, { row, col }))
        }

        setSelectedSquare(null)
        setValidMoves([])
        return
      }

      // Deselect if clicking same square or invalid move
      if (selectedSquare.row === row && selectedSquare.col === col) {
        setSelectedSquare(null)
        setValidMoves([])
        return
      }
    }

    // Select a piece of the current player
    if (piece && piece.color === playerColor) {
      setSelectedSquare({ row, col })

      // Calculate valid moves
      const moves = getPieceMoves(gameState.board, row, col, gameState)
      const legalMoves = moves.filter(to => {
        const newState = makeMove(gameState, { row, col }, to)
        return !isInCheck(newState.board, playerColor, newState)
      })
      setValidMoves(legalMoves)
    } else {
      setSelectedSquare(null)
      setValidMoves([])
    }
  }, [gameState, selectedSquare, validMoves, playerColor, gameResult, isThinking])

  // Handle promotion
  const handlePromotion = useCallback((pieceType: PieceType) => {
    if (promotionPending) {
      setGameState(prev => makeMove(prev, promotionPending.from, promotionPending.to, pieceType))
      setPromotionPending(null)
    }
  }, [promotionPending])

  // Reset game
  const resetGame = useCallback(() => {
    setGameState(createInitialState())
    setSelectedSquare(null)
    setValidMoves([])
    setPromotionPending(null)
  }, [])

  // Flip board
  const flipBoard = useCallback(() => {
    setPlayerColor(prev => prev === 'white' ? 'black' : 'white')
  }, [])

  const cellSize = isExpanded ? 56 : 40

  // Render the board
  const renderBoard = () => {
    const rows = []
    const boardRows = playerColor === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
    const boardCols = playerColor === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]

    for (const row of boardRows) {
      const cols = []
      for (const col of boardCols) {
        const piece = gameState.board[row][col]
        const isLight = (row + col) % 2 === 0
        const isSelected = selectedSquare?.row === row && selectedSquare?.col === col
        const isValidMove = validMoves.some(m => m.row === row && m.col === col)
        const isLastMove = gameState.moveHistory.length > 0 && (
          (gameState.moveHistory[gameState.moveHistory.length - 1].from.row === row &&
           gameState.moveHistory[gameState.moveHistory.length - 1].from.col === col) ||
          (gameState.moveHistory[gameState.moveHistory.length - 1].to.row === row &&
           gameState.moveHistory[gameState.moveHistory.length - 1].to.col === col)
        )
        const isInCheckSquare = inCheck && piece?.type === 'K' && piece?.color === gameState.turn

        cols.push(
          <div
            key={`${row}-${col}`}
            onClick={() => handleSquareClick(row, col)}
            className={`
              flex items-center justify-center cursor-pointer relative
              ${isLight ? 'bg-amber-100 dark:bg-amber-200' : 'bg-amber-700 dark:bg-amber-800'}
              ${isSelected ? 'ring-2 ring-blue-500 ring-inset z-10' : ''}
              ${isLastMove ? 'bg-yellow-300/50 dark:bg-yellow-400/30' : ''}
              ${isInCheckSquare ? 'bg-red-500/50' : ''}
            `}
            style={{ width: cellSize, height: cellSize }}
          >
            {/* Valid move indicator */}
            {isValidMove && (
              <div className={`absolute inset-0 flex items-center justify-center ${piece ? '' : ''}`}>
                {piece ? (
                  <div className="absolute inset-1 border-4 border-blue-500/50 rounded-full" />
                ) : (
                  <div className="w-3 h-3 rounded-full bg-blue-500/50" />
                )}
              </div>
            )}

            {/* Piece */}
            {piece && (
              <span
                className={`text-${isExpanded ? '4xl' : '2xl'} select-none ${
                  piece.color === 'white' ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]' : 'text-gray-900'
                }`}
                style={{ fontSize: cellSize * 0.7 }}
              >
                {PIECE_SYMBOLS[piece.color][piece.type]}
              </span>
            )}
          </div>
        )
      }
      rows.push(
        <div key={row} className="flex">
          {cols}
        </div>
      )
    }
    return rows
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col items-center gap-3">
        {/* Status */}
        <div className="flex items-center justify-between w-full max-w-xs">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${gameState.turn === 'white' ? 'bg-white border border-gray-300' : 'bg-gray-800'}`} />
            <span className="text-sm font-medium">
              {isThinking ? 'AI thinking...' : (
                gameResult !== 'ongoing' ? (
                  gameResult === 'checkmate' ? `Checkmate! ${gameState.turn === 'white' ? 'Black' : 'White'} wins!` :
                  'Stalemate - Draw!'
                ) : (
                  inCheck ? 'Check!' : `${gameState.turn}'s turn`
                )
              )}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Move {gameState.fullMoveNumber}
          </div>
        </div>

        {/* Board */}
        <div className="relative">
          <div className="border-2 border-amber-900 rounded overflow-hidden shadow-lg">
            {renderBoard()}
          </div>

          {/* Promotion dialog */}
          {promotionPending && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 shadow-xl">
                <p className="text-sm font-medium mb-3 text-center">Promote to:</p>
                <div className="flex gap-2">
                  {(['Q', 'R', 'B', 'N'] as PieceType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => handlePromotion(type)}
                      className="w-12 h-12 flex items-center justify-center bg-amber-100 dark:bg-amber-200 rounded hover:bg-amber-200 dark:hover:bg-amber-300 transition-colors"
                    >
                      <span className="text-3xl">
                        {PIECE_SYMBOLS[playerColor][type]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Game over overlay */}
          {gameResult !== 'ongoing' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 shadow-xl text-center">
                <Crown className={`w-12 h-12 mx-auto mb-2 ${
                  gameResult === 'stalemate' ? 'text-yellow-500' :
                  (gameState.turn !== playerColor ? 'text-green-500' : 'text-red-500')
                }`} />
                <p className="text-lg font-bold mb-3">
                  {gameResult === 'checkmate' ? (
                    gameState.turn !== playerColor ? 'You Win!' : 'You Lose!'
                  ) : 'Stalemate!'}
                </p>
                <button
                  onClick={resetGame}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  New Game
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={resetGame}
            className="flex items-center gap-1 px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
            title="New Game"
          >
            <RotateCcw className="w-4 h-4" />
            New
          </button>
          <button
            onClick={flipBoard}
            className="flex items-center gap-1 px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
            title="Play as other color"
          >
            <ChevronLeft className="w-4 h-4" />
            <ChevronRight className="w-4 h-4" />
            Flip
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-1 px-3 py-1 rounded text-sm ${
              showSettings ? 'bg-primary/20 text-primary' : 'bg-secondary hover:bg-secondary/80'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="w-full max-w-xs p-3 bg-secondary/30 rounded-lg">
            <div className="mb-3">
              <label className="text-xs text-muted-foreground block mb-1">Difficulty</label>
              <div className="flex gap-1">
                {[1, 2, 3].map(d => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d as 1 | 2 | 3)}
                    className={`flex-1 py-1 text-xs rounded ${
                      difficulty === d
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary hover:bg-secondary/80'
                    }`}
                  >
                    {d === 1 ? 'Easy' : d === 2 ? 'Medium' : 'Hard'}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Stats: W{stats.wins} / L{stats.losses} / D{stats.draws}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function KubeChess() {
  const { t: _t } = useTranslation()
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0 })
  return (
    <DynamicCardErrorBoundary cardId="KubeChess">
      <KubeChessInternal />
    </DynamicCardErrorBoundary>
  )
}
