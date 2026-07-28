// Types, board constants and taunt copy for the Checkers card.
// Extracted from Checkers.tsx (issue #21615) — values unchanged.

/** localStorage key for Checkers win/loss score tracking */
export const SCORE_STORAGE_KEY = 'checkers-score'

// Board is 8x8, pieces only on dark squares
export const BOARD_SIZE = 8

export type Player = 'pods' | 'nodes'
export type PieceType = 'normal' | 'king'

export interface Piece {
  player: Player
  type: PieceType
}

export interface Position {
  row: number
  col: number
}

export interface Move {
  from: Position
  to: Position
  captures: Position[]
  isJump: boolean
}

export type Board = (Piece | null)[][]

export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTY_DEPTH: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3 }

// Pirate jokes for the AI to say while waiting
export const PIRATE_TAUNTS = [
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
export const CAPTURE_TAUNTS = [
  "Arrr! Another one walks the plank!",
  "Yo ho ho! That pod be swimmin' with the fishes now!",
  "Shiver me timbers! Got ye, ye scurvy pod!",
  "Avast! Down to Davy Jones with ye!",
  "Arrr! Me cannons sink another one!",
  "Blimey! That'll teach ye to cross Captain Node!",
]

// Pre-game taunts before the player starts
export const PRE_GAME_TAUNTS = [
  "Arrr! Ye dare challenge Captain Node? Step right up!",
  "Ahoy! Another scallywag approaches me checkerboard!",
  "Yo ho ho! Fresh meat! Press that button if ye dare!",
  "Shiver me timbers! Ye think ye can outwit a pirate?",
  "Avast! Welcome aboard, ye bilge rat! Make yer move!",
]

export const PRE_GAME_TAUNT_DELAY_MS = 2_000
export const TAUNT_DISPLAY_MS = 3_000
export const INITIAL_TAUNT_DELAY_MS = 3_000
export const TAUNT_CYCLE_INTERVAL_MS = 8_000
export const AI_MOVE_DELAY_MS = 1_000
export const COMBAT_ANIMATION_MS = 500
