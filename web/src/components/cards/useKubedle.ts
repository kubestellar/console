import { useState, useRef, useEffect } from 'react'
import { useReportCardDataState, useCardDemoState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeys } from '../../hooks/useGameKeys'
import { safeGet, safeSet } from '../../lib/safeLocalStorage'

// 5-letter Kubernetes-themed words
const WORD_LIST = [
  'NODES', 'PROBE', 'CHART', 'ETCD!', 'PROXY', 'APPLY', 'PATCH', 'SCALE',
  'DRAIN', 'TAINT', 'LABEL', 'WATCH', 'PORTS', 'MOUNT', 'CLAIM', 'QUOTA',
  'LIMIT', 'GRACE', 'READY', 'ALIVE', 'PHASE', 'EVENT', 'ROUTE', 'NGINX',
  'REDIS', 'MYSQL', 'KAFKA', 'SPARK', 'ISTIO', 'ENVOY', 'VAULT', 'ARGOŠ',
  'SHELL', 'DEBUG', 'PAUSE', 'IMAGE', 'BUILD', 'LAYER', 'CRANE', 'SKOPEO',
  'CERTS', 'TOKEN', 'ROLES', 'BINDS', 'RULES', 'AUDIT', 'VALID', 'HOOKS',
  'QUEUE', 'BATCH', 'CRONS', 'TASKS', 'SCHED', 'AGENT', 'FLEET', 'MULTI',
  'CLOUD', 'HOSTS', 'RACKS', 'ZONES', 'POOLS', 'DISKS', 'STORE', 'BLOCK',
  'SNAPS', 'CLONE', 'SYNCS', 'DRIFT', 'STATE', 'SPECS', 'METAS', 'KINDS',
].filter(w => /^[A-Z]{5}$/.test(w)) // Only keep valid 5-letter words

// Fallback words if word list gets filtered too much
const FALLBACK_WORDS = [
  'NODES', 'PROBE', 'CHART', 'PROXY', 'APPLY', 'PATCH', 'SCALE', 'DRAIN',
  'TAINT', 'LABEL', 'WATCH', 'PORTS', 'MOUNT', 'CLAIM', 'QUOTA', 'LIMIT',
  'GRACE', 'READY', 'ALIVE', 'PHASE', 'EVENT', 'ROUTE', 'NGINX', 'REDIS',
  'SHELL', 'DEBUG', 'PAUSE', 'IMAGE', 'BUILD', 'LAYER', 'CERTS', 'TOKEN',
  'ROLES', 'RULES', 'AUDIT', 'VALID', 'HOOKS', 'QUEUE', 'BATCH', 'TASKS',
  'AGENT', 'FLEET', 'CLOUD', 'HOSTS', 'ZONES', 'POOLS', 'DISKS', 'STORE',
  'BLOCK', 'CLONE', 'STATE', 'SPECS', 'KINDS', 'CRASH', 'ERROR', 'STACK',
]

const WORDS = WORD_LIST.length >= 20 ? WORD_LIST : FALLBACK_WORDS

// #6306: Set of valid guesses (the same pool used for target words).
// The original submit handler only checked `length === 5` and accepted
// any random letters as a guess, letting players burn rows with junk input.
// Lookup in a Set is O(1); words are already uppercased.
const VALID_GUESSES = new Set(WORDS)

// Get today's word (deterministic based on date)
function getTodaysWord(): string {
  const today = new Date()
  const dayNumber = Math.floor(today.getTime() / (1000 * 60 * 60 * 24))
  return WORDS[dayNumber % WORDS.length]
}

// Get a random word for practice mode
function getRandomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)]
}

type LetterState = 'correct' | 'present' | 'absent' | 'empty'

interface GameStats {
  played: number
  won: number
  currentStreak: number
  maxStreak: number
  guessDistribution: number[]
}

const STATS_KEY = 'kubedle-stats'

// Duration of the shake/error message flash on invalid input.
const SHAKE_DURATION_MS = 500

// Standard Wordle-style game: 6 guesses per puzzle.
export const MAX_GUESSES = 6
const WORD_LENGTH = 5

function loadStats(): GameStats {
  const defaults: GameStats = {
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    guessDistribution: [0, 0, 0, 0, 0, 0] }
  const stored = safeGet(STATS_KEY)
  if (!stored) return defaults
  try {
    return JSON.parse(stored)
  } catch {
    return defaults
  }
}

function saveStats(stats: GameStats) {
  safeSet(STATS_KEY, JSON.stringify(stats))
}

// Check letter states for a guess
export function checkGuess(guess: string, target: string): LetterState[] {
  const result: LetterState[] = Array(5).fill('absent')
  const targetChars = target.split('')
  const guessChars = guess.split('')
  const used = Array(5).fill(false)

  // First pass: find correct letters
  for (let i = 0; i < 5; i++) {
    if (guessChars[i] === targetChars[i]) {
      result[i] = 'correct'
      used[i] = true
    }
  }

  // Second pass: find present letters
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'correct') continue

    for (let j = 0; j < 5; j++) {
      if (!used[j] && guessChars[i] === targetChars[j]) {
        result[i] = 'present'
        used[j] = true
        break
      }
    }
  }

  return result
}

export function useKubedle() {
  // Existing "kubedle.*" keys live in common.json; new ones go in cards.json.
  const { t } = useTranslation()
  const { t: tCards } = useTranslation('cards')
  const { showDemoBadge } = useCardDemoState({ requires: 'none' })
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: showDemoBadge })

  const gameContainerRef = useRef<HTMLDivElement>(null)
  const shakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [targetWord, setTargetWord] = useState(getTodaysWord)
  const [guesses, setGuesses] = useState<string[]>([])
  const [currentGuess, setCurrentGuess] = useState('')
  const [gameOver, setGameOver] = useState(false)
  const [shake, setShake] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [practiceMode, setPracticeMode] = useState(false)
  const [stats, setStats] = useState<GameStats>(loadStats)
  const [message, setMessage] = useState('')

  // Build keyboard letter states
  const letterStates = () => {
    const states: Record<string, LetterState> = {}

    for (const guess of guesses) {
      const results = checkGuess(guess, targetWord)
      for (let i = 0; i < 5; i++) {
        const letter = guess[i]
        const state = results[i]

        // Only upgrade state (absent < present < correct)
        if (!states[letter] ||
            (states[letter] === 'absent' && state !== 'absent') ||
            (states[letter] === 'present' && state === 'correct')) {
          states[letter] = state
        }
      }
    }

    return states
  }

  // Handle key press
  const handleKey = (key: string) => {
    if (gameOver) return

    if (key === 'ENTER' || key === 'Enter') {
      if (currentGuess.length !== WORD_LENGTH) {
        setShake(true)
        setMessage(tCards('kubedle.notEnoughLetters'))
        if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current)
        shakeTimeoutRef.current = setTimeout(() => {
          setShake(false)
          setMessage('')
          shakeTimeoutRef.current = null
        }, SHAKE_DURATION_MS)
        return
      }

      // #6306: reject guesses that aren't in the word pool. Previously
      // any 5-letter string was accepted, so players could type junk input
      // and burn a row. The word pool is the same set used to pick the target,
      // so every valid target is a valid guess. Ties into the existing
      // "Not enough letters" shake UX.
      if (!VALID_GUESSES.has(currentGuess)) {
        setShake(true)
        setMessage(tCards('kubedle.notInWordList'))
        if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current)
        shakeTimeoutRef.current = setTimeout(() => {
          setShake(false)
          setMessage('')
          shakeTimeoutRef.current = null
        }, SHAKE_DURATION_MS)
        return
      }

      const newGuesses = [...guesses, currentGuess]
      setGuesses(newGuesses)
      setCurrentGuess('')

      if (currentGuess === targetWord) {
        setGameOver(true)
        setMessage(tCards('kubedle.excellent'))
        emitGameEnded('kubedle', 'win', newGuesses.length)

        // Update stats
        setStats(prev => {
          const newStats = {
            ...prev,
            played: prev.played + 1,
            won: prev.won + 1,
            currentStreak: prev.currentStreak + 1,
            maxStreak: Math.max(prev.maxStreak, prev.currentStreak + 1),
            guessDistribution: [...prev.guessDistribution] }
          newStats.guessDistribution[newGuesses.length - 1]++
          saveStats(newStats)
          return newStats
        })
      } else if (newGuesses.length >= MAX_GUESSES) {
        setGameOver(true)
        setMessage(tCards('kubedle.wordWas', { word: targetWord }))
        emitGameEnded('kubedle', 'loss', newGuesses.length)

        // Update stats
        setStats(prev => {
          const newStats = {
            ...prev,
            played: prev.played + 1,
            currentStreak: 0 }
          saveStats(newStats)
          return newStats
        })
      }
    } else if (key === '⌫' || key === 'Backspace') {
      setCurrentGuess(prev => prev.slice(0, -1))
    } else if (/^[A-Za-z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
      setCurrentGuess(prev => prev + key.toUpperCase())
    }
  }

  // Physical keyboard — scoped to visible game container (KeepAlive-safe)
  const handleKubedleKeyDown = (e: KeyboardEvent) => {
    if (showStats || showHelp) return
    handleKey(e.key)
  }
  useGameKeys(gameContainerRef, { onKeyDown: handleKubedleKeyDown })

  // Cleanup shake timeout on unmount
  useEffect(() => {
    return () => {
      if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current)
    }
  }, [])

  // New game
  const newGame = (practice: boolean = false) => {
    setPracticeMode(practice)
    setTargetWord(practice ? getRandomWord() : getTodaysWord())
    setGuesses([])
    setCurrentGuess('')
    setGameOver(false)
    setMessage('')
    emitGameStarted('kubedle')
  }

  const states = letterStates()
  return {
    t,
    tCards,
    gameContainerRef,
    guesses,
    currentGuess,
    gameOver,
    shake,
    showStats,
    setShowStats,
    showHelp,
    setShowHelp,
    practiceMode,
    stats,
    message,
    handleKey,
    newGame,
    states,
    targetWord,
  }
}
