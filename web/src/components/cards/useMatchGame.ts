import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useToast } from '../ui/Toast'
import { safeGetItem, safeSetItem } from '@/lib/utils/localStorage'
import {
  CARD_ICONS, DIFFICULTY_CONFIG, TIMER_TICK_MS, MATCH_REVEAL_DELAY_MS, NO_MATCH_FLIP_DELAY_MS,
  type Difficulty, type GameCard, type HighScore,
} from './MatchGame.constants'
import { drawMatchGameConfetti } from './MatchGame.draw'

/** Game state and handlers for the Match Game card. */
export function useMatchGame() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [cards, setCards] = useState<GameCard[]>([])
  const [flippedCards, setFlippedCards] = useState<string[]>([])
  const [moves, setMoves] = useState(0)
  const [time, setTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [gameWon, setGameWon] = useState(false)
  const [highScores, setHighScores] = useState<Record<Difficulty, HighScore | null>>({
    easy: null,
    medium: null,
    hard: null })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Load high scores from localStorage
  useEffect(() => {
    try {
      const stored = safeGetItem('matchGameHighScores')
      if (stored) {
        setHighScores(JSON.parse(stored))
      }
    } catch {
      // User-visible toast already communicates the failure; no console
      // noise needed (#8816).
      showToast(t('matchGame.errors.highScoresFailed', 'Could not load high scores.'), 'warning')
    }
  }, [showToast, t])

  // Initialize game
  const initGame = () => {
    const config = DIFFICULTY_CONFIG[difficulty]
    const selectedIcons = CARD_ICONS.slice(0, config.pairs)
    const cardPairs = selectedIcons.flatMap(icon => [
      { id: `${icon.id}-1`, iconId: icon.id, matched: false },
      { id: `${icon.id}-2`, iconId: icon.id, matched: false },
    ])
    
    // Shuffle cards using Fisher-Yates algorithm
    const shuffled = [...cardPairs]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    setCards(shuffled)
    setFlippedCards([])
    setMoves(0)
    setTime(0)
    setIsPlaying(true)
    setIsPaused(false)
    setGameWon(false)
    emitGameStarted('match')
  }

  // Timer
  useEffect(() => {
    if (isPlaying && !isPaused && !gameWon) {
      timerRef.current = setInterval(() => {
        setTime(t => t + 1)
      }, TIMER_TICK_MS)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPlaying, isPaused, gameWon])

  // Check for game completion
  useEffect(() => {
    if (isPlaying && cards.length > 0 && cards.every(card => card.matched)) {
      setGameWon(true)
      setIsPlaying(false)
      
      // Save high score
      const currentScore = highScores[difficulty]
      if (!currentScore || moves < currentScore.moves || (moves === currentScore.moves && time < currentScore.time)) {
        const newHighScores = {
          ...highScores,
          [difficulty]: { difficulty, moves, time, date: new Date().toISOString() }
        }
        setHighScores(newHighScores)
        safeSetItem('matchGameHighScores', JSON.stringify(newHighScores))
      }
      
      emitGameEnded('match', 'win', moves)

      // Trigger confetti
      triggerConfetti()
    }
  }, [cards, isPlaying, moves, time, difficulty, highScores])

  // Handle card flip
  const handleCardClick = (cardId: string) => {
    if (flippedCards.length >= 2 || flippedCards.includes(cardId) || isPaused || gameWon) {
      return
    }

    const card = cards.find(c => c.id === cardId)
    if (!card || card.matched) return

    const newFlipped = [...flippedCards, cardId]
    setFlippedCards(newFlipped)

    if (newFlipped.length === 2) {
      setMoves(m => m + 1)
      
      const [first, second] = newFlipped
      const firstCard = cards.find(c => c.id === first)
      const secondCard = cards.find(c => c.id === second)

      if (firstCard && secondCard && firstCard.iconId === secondCard.iconId) {
        // Match found!
        setTimeout(() => {
          setCards(prevCards =>
            prevCards.map(c =>
              c.id === first || c.id === second ? { ...c, matched: true } : c
            )
          )
          setFlippedCards([])
        }, MATCH_REVEAL_DELAY_MS)
      } else {
        // No match
        setTimeout(() => {
          setFlippedCards([])
        }, NO_MATCH_FLIP_DELAY_MS)
      }
    }
  }

  // Confetti animation
  const triggerConfetti = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawMatchGameConfetti(canvas)
  }

  const togglePause = () => {
    setIsPaused(p => !p)
  }

  const resetGame = () => {
    initGame()
  }

  const changeDifficulty = (newDifficulty: Difficulty) => {
    setDifficulty(newDifficulty)
    setIsPlaying(false)
    setCards([])
  }

  return {
    difficulty,
    cards,
    flippedCards,
    moves,
    time,
    isPlaying,
    isPaused,
    gameWon,
    highScores,
    canvasRef,
    initGame,
    handleCardClick,
    togglePause,
    resetGame,
    changeDifficulty,
  }
}
