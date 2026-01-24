import { useState, useEffect, useCallback } from 'react'
import { RotateCcw, Trophy, HelpCircle, BarChart3, X } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'

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

function loadStats(): GameStats {
  try {
    const stored = localStorage.getItem(STATS_KEY)
    return stored ? JSON.parse(stored) : {
      played: 0,
      won: 0,
      currentStreak: 0,
      maxStreak: 0,
      guessDistribution: [0, 0, 0, 0, 0, 0],
    }
  } catch {
    return {
      played: 0,
      won: 0,
      currentStreak: 0,
      maxStreak: 0,
      guessDistribution: [0, 0, 0, 0, 0, 0],
    }
  }
}

function saveStats(stats: GameStats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {
    // Ignore storage errors
  }
}

// Check letter states for a guess
function checkGuess(guess: string, target: string): LetterState[] {
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

// Keyboard layout
const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
]

export function Kubedle(_props: CardComponentProps) {
  const { isExpanded } = useCardExpanded()

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
  const letterStates = useCallback(() => {
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
  }, [guesses, targetWord])

  // Handle key press
  const handleKey = useCallback((key: string) => {
    if (gameOver) return

    if (key === 'ENTER' || key === 'Enter') {
      if (currentGuess.length !== 5) {
        setShake(true)
        setMessage('Not enough letters')
        setTimeout(() => {
          setShake(false)
          setMessage('')
        }, 500)
        return
      }

      const newGuesses = [...guesses, currentGuess]
      setGuesses(newGuesses)
      setCurrentGuess('')

      if (currentGuess === targetWord) {
        setGameOver(true)
        setMessage('Excellent!')

        // Update stats
        setStats(prev => {
          const newStats = {
            ...prev,
            played: prev.played + 1,
            won: prev.won + 1,
            currentStreak: prev.currentStreak + 1,
            maxStreak: Math.max(prev.maxStreak, prev.currentStreak + 1),
            guessDistribution: [...prev.guessDistribution],
          }
          newStats.guessDistribution[newGuesses.length - 1]++
          saveStats(newStats)
          return newStats
        })
      } else if (newGuesses.length >= 6) {
        setGameOver(true)
        setMessage(`The word was ${targetWord}`)

        // Update stats
        setStats(prev => {
          const newStats = {
            ...prev,
            played: prev.played + 1,
            currentStreak: 0,
          }
          saveStats(newStats)
          return newStats
        })
      }
    } else if (key === '⌫' || key === 'Backspace') {
      setCurrentGuess(prev => prev.slice(0, -1))
    } else if (/^[A-Za-z]$/.test(key) && currentGuess.length < 5) {
      setCurrentGuess(prev => prev + key.toUpperCase())
    }
  }, [currentGuess, guesses, gameOver, targetWord])

  // Physical keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showStats || showHelp) return
      handleKey(e.key)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKey, showStats, showHelp])

  // New game
  const newGame = useCallback((practice: boolean = false) => {
    setPracticeMode(practice)
    setTargetWord(practice ? getRandomWord() : getTodaysWord())
    setGuesses([])
    setCurrentGuess('')
    setGameOver(false)
    setMessage('')
  }, [])

  const states = letterStates()
  const cellSize = isExpanded ? 'w-12 h-12 text-xl' : 'w-8 h-8 text-sm'
  const keySize = isExpanded ? 'min-w-[32px] h-10 text-sm' : 'min-w-[24px] h-8 text-xs'

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold">Kubedle</span>
          {practiceMode && (
            <span className="text-xs text-muted-foreground">(Practice)</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHelp(true)}
            className="p-1.5 rounded hover:bg-secondary"
            title="How to Play"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowStats(true)}
            className="p-1.5 rounded hover:bg-secondary"
            title="Statistics"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => newGame(true)}
            className="p-1.5 rounded hover:bg-secondary"
            title="Practice Mode"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="text-center text-sm font-medium mb-1 text-foreground">
          {message}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1">
        {Array(6).fill(null).map((_, rowIdx) => {
          const guess = guesses[rowIdx]
          const isCurrentRow = rowIdx === guesses.length && !gameOver
          const displayWord = guess || (isCurrentRow ? currentGuess.padEnd(5, ' ') : '     ')
          const results = guess ? checkGuess(guess, targetWord) : []

          return (
            <div
              key={rowIdx}
              className={`flex gap-1 ${isCurrentRow && shake ? 'animate-shake' : ''}`}
            >
              {displayWord.split('').map((letter, colIdx) => {
                let bgColor = 'bg-secondary/50 border-border'
                if (guess) {
                  if (results[colIdx] === 'correct') {
                    bgColor = 'bg-green-600 border-green-600'
                  } else if (results[colIdx] === 'present') {
                    bgColor = 'bg-yellow-600 border-yellow-600'
                  } else {
                    bgColor = 'bg-zinc-700 border-zinc-700'
                  }
                } else if (letter !== ' ') {
                  bgColor = 'bg-secondary border-zinc-500'
                }

                return (
                  <div
                    key={colIdx}
                    className={`${cellSize} flex items-center justify-center font-bold border-2 rounded ${bgColor} text-white`}
                  >
                    {letter !== ' ' ? letter : ''}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Keyboard */}
      <div className="flex flex-col items-center gap-1 mt-2">
        {KEYBOARD_ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="flex gap-1">
            {row.map(key => {
              let bgColor = 'bg-zinc-600 hover:bg-zinc-500'
              if (states[key] === 'correct') {
                bgColor = 'bg-green-600'
              } else if (states[key] === 'present') {
                bgColor = 'bg-yellow-600'
              } else if (states[key] === 'absent') {
                bgColor = 'bg-zinc-800'
              }

              const isSpecial = key === 'ENTER' || key === '⌫'

              return (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  className={`${keySize} ${isSpecial ? 'px-2' : 'px-1'} rounded font-semibold text-white ${bgColor} transition-colors`}
                >
                  {key}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="absolute inset-0 bg-background/90 flex items-center justify-center rounded-lg z-10 p-4">
          <div className="bg-card border border-border rounded-lg p-4 max-w-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-foreground">How to Play</h3>
              <button onClick={() => setShowHelp(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Guess the Kubernetes word in 6 tries!</p>
              <p>Each guess must be a 5-letter word.</p>
              <div className="space-y-1 mt-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-green-600 rounded flex items-center justify-center text-white text-xs font-bold">N</div>
                  <span>Correct letter, correct spot</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-yellow-600 rounded flex items-center justify-center text-white text-xs font-bold">O</div>
                  <span>Correct letter, wrong spot</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-zinc-700 rounded flex items-center justify-center text-white text-xs font-bold">D</div>
                  <span>Letter not in word</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {showStats && (
        <div className="absolute inset-0 bg-background/90 flex items-center justify-center rounded-lg z-10 p-4">
          <div className="bg-card border border-border rounded-lg p-4 max-w-sm w-full">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-foreground">Statistics</h3>
              <button onClick={() => setShowStats(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center mb-4">
              <div>
                <div className="text-2xl font-bold text-foreground">{stats.played}</div>
                <div className="text-xs text-muted-foreground">Played</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0}%
                </div>
                <div className="text-xs text-muted-foreground">Win %</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{stats.currentStreak}</div>
                <div className="text-xs text-muted-foreground">Streak</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{stats.maxStreak}</div>
                <div className="text-xs text-muted-foreground">Max</div>
              </div>
            </div>

            <div className="text-sm font-medium text-foreground mb-2">Guess Distribution</div>
            <div className="space-y-1">
              {stats.guessDistribution.map((count, idx) => {
                const maxCount = Math.max(...stats.guessDistribution, 1)
                const width = `${Math.max((count / maxCount) * 100, 8)}%`

                return (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="w-3 text-muted-foreground">{idx + 1}</span>
                    <div
                      className="bg-green-600 text-white text-right px-1 rounded"
                      style={{ width }}
                    >
                      {count}
                    </div>
                  </div>
                )
              })}
            </div>

            {gameOver && (
              <button
                onClick={() => {
                  setShowStats(false)
                  newGame(true)
                }}
                className="mt-4 w-full py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30"
              >
                Play Again (Practice)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
