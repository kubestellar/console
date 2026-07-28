// Pure Checkers game engine: board setup, move generation, minimax AI and
// persisted game state. Extracted from Checkers.tsx (issue #21615) — logic unchanged.
import { safeGet, safeSetJSON } from '../../lib/safeLocalStorage'
import { BOARD_SIZE, type Board, type Difficulty, type Move, type Player, type Position } from './Checkers.types'

// Initialize board with starting positions
export function createInitialBoard(): Board {
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
export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(cell => cell ? { ...cell } : null))
}

// Get all valid moves for a piece
export function getValidMoves(board: Board, pos: Position, mustJump: boolean = false): Move[] {
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
            isJump: true })
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
            isJump: false })
        }
      }
    }
  }

  return moves
}

// Get all valid moves for a player
export function getAllMoves(board: Board, player: Player): Move[] {
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
export function applyMove(board: Board, move: Move): Board {
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
export function getChainJumps(board: Board, pos: Position): Move[] {
  return getValidMoves(board, pos, true)
}

// Count pieces for evaluation
export function countPieces(board: Board): { pods: number; nodes: number; podKings: number; nodeKings: number } {
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
export function evaluateBoard(board: Board): number {
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
export function minimax(
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

// Storage key for game state
export const STORAGE_KEY = 'checkers-game-state'

export interface SavedGameState {
  board: Board
  currentPlayer: Player
  difficulty: Difficulty
  moveCount: number
  gameOver: Player | 'draw' | null
}

export function loadGameState(): SavedGameState | null {
  const stored = safeGet(STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as SavedGameState
  } catch {
    return null
  }
}

export function saveGameState(state: SavedGameState) {
  safeSetJSON(STORAGE_KEY, state)
}
