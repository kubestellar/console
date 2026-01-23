import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Box, Container, Database, Server, Cloud, Network, HardDrive, 
  Cpu, Lock, Shield, Globe, GitBranch, Terminal,
  Play, Pause, RotateCcw, Trophy, Clock, Hash
} from 'lucide-react'
import { CardComponentProps } from './cardRegistry'

// Kubernetes/Cloud themed icons for matching
const CARD_ICONS = [
  { id: 'pod', Icon: Box, color: 'text-blue-400' },
  { id: 'container', Icon: Container, color: 'text-purple-400' },
  { id: 'database', Icon: Database, color: 'text-green-400' },
  { id: 'server', Icon: Server, color: 'text-yellow-400' },
  { id: 'cloud', Icon: Cloud, color: 'text-cyan-400' },
  { id: 'network', Icon: Network, color: 'text-pink-400' },
  { id: 'storage', Icon: HardDrive, color: 'text-orange-400' },
  { id: 'cpu', Icon: Cpu, color: 'text-red-400' },
  { id: 'security', Icon: Lock, color: 'text-indigo-400' },
  { id: 'shield', Icon: Shield, color: 'text-teal-400' },
  { id: 'globe', Icon: Globe, color: 'text-lime-400' },
  { id: 'git', Icon: GitBranch, color: 'text-fuchsia-400' },
]

type Difficulty = 'easy' | 'medium' | 'hard'

interface GameCard {
  id: string
  iconId: string
  matched: boolean
}

interface HighScore {
  difficulty: Difficulty
  moves: number
  time: number
  date: string
}

const DIFFICULTY_CONFIG = {
  easy: { rows: 3, cols: 4, pairs: 6 },
  medium: { rows: 4, cols: 4, pairs: 8 },
  hard: { rows: 4, cols: 6, pairs: 12 },
}

export function MatchGame(_props: CardComponentProps) {
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
    hard: null,
  })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Load high scores from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('matchGameHighScores')
    if (stored) {
      try {
        setHighScores(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to load high scores:', e)
      }
    }
  }, [])

  // Initialize game
  const initGame = useCallback(() => {
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
  }, [difficulty])

  // Timer
  useEffect(() => {
    if (isPlaying && !isPaused && !gameWon) {
      timerRef.current = setInterval(() => {
        setTime(t => t + 1)
      }, 1000)
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
        localStorage.setItem('matchGameHighScores', JSON.stringify(newHighScores))
      }
      
      // Trigger confetti
      triggerConfetti()
    }
  }, [cards, isPlaying, moves, time, difficulty, highScores])

  // Handle card flip
  const handleCardClick = useCallback((cardId: string) => {
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
        }, 500)
      } else {
        // No match
        setTimeout(() => {
          setFlippedCards([])
        }, 1000)
      }
    }
  }, [flippedCards, cards, isPaused, gameWon])

  // Confetti animation
  const triggerConfetti = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const particles: Array<{
      x: number
      y: number
      vx: number
      vy: number
      color: string
      size: number
      rotation: number
      rotationSpeed: number
    }> = []

    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444']

    // Create particles
    for (let i = 0; i < 100; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10 - 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
      })
    }

    let animationFrame: number

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Update and draw particles, filtering out off-screen ones
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.3 // gravity
        p.rotation += p.rotationSpeed

        // Remove particles that are off screen
        if (p.y > canvas.height) {
          particles.splice(i, 1)
          continue
        }

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        ctx.restore()
      }

      if (particles.length > 0) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animate()

    // Cleanup
    setTimeout(() => {
      if (animationFrame) cancelAnimationFrame(animationFrame)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }, 5000)
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const { rows, cols } = DIFFICULTY_CONFIG[difficulty]

  return (
    <div className="flex flex-col gap-2 h-full relative">
      {/* Canvas for confetti */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-50"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Header with controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-semibold">Match Game</span>
        </div>
        
        {/* Difficulty selector */}
        <div className="flex gap-1">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
            <button
              key={d}
              onClick={() => changeDifficulty(d)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                difficulty === d
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/5 hover:bg-white/10 text-gray-400'
              }`}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Game stats */}
      {isPlaying && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-blue-400" />
            <span>Moves: <span className="font-bold">{moves}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-green-400" />
            <span>Time: <span className="font-bold">{formatTime(time)}</span></span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={togglePause}
              className="p-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={resetGame}
              className="p-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors"
              title="Reset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* High score display */}
      {highScores[difficulty] && !isPlaying && (
        <div className="text-xs text-center py-1 px-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
          <Trophy className="w-3 h-3 inline mr-1 text-yellow-400" />
          Best: {highScores[difficulty]!.moves} moves in {formatTime(highScores[difficulty]!.time)}
        </div>
      )}

      {/* Start screen */}
      {!isPlaying && cards.length === 0 && (
        <div className="flex-1 flex items-center justify-center min-h-[120px]">
          <button
            onClick={initGame}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg text-sm font-semibold hover:from-purple-600 hover:to-blue-600 transition-all transform hover:scale-105 flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Start Game
          </button>
        </div>
      )}

      {/* Game won screen */}
      {gameWon && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 min-h-[120px]">
          <div className="text-2xl">🎉</div>
          <div className="text-base font-bold text-center">Congratulations!</div>
          <div className="text-center text-xs text-gray-400">
            <div>Completed in <span className="font-bold text-white">{moves}</span> moves</div>
            <div>Time: <span className="font-bold text-white">{formatTime(time)}</span></div>
          </div>
          <button
            onClick={resetGame}
            className="px-4 py-1.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg text-sm font-semibold hover:from-green-600 hover:to-emerald-600 transition-all transform hover:scale-105 flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Play Again
          </button>
        </div>
      )}

      {/* Game board */}
      {isPlaying && !gameWon && (
        <div 
          className="flex-1 grid gap-1.5 items-center justify-items-center"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {cards.map(card => {
            const icon = CARD_ICONS.find(i => i.id === card.iconId)
            const isFlipped = flippedCards.includes(card.id) || card.matched
            const Icon = icon?.Icon || Box

            return (
              <button
                key={card.id}
                onClick={() => handleCardClick(card.id)}
                disabled={isFlipped || isPaused}
                className="relative w-full aspect-square max-w-[60px] max-h-[60px] perspective-1000"
                style={{ opacity: isPaused ? 0.5 : 1 }}
              >
                <div
                  className={`card-inner w-full h-full transition-transform duration-500 transform-style-3d ${
                    isFlipped ? 'rotate-y-180' : ''
                  }`}
                >
                  {/* Card back */}
                  <div className="card-face absolute inset-0 backface-hidden bg-gradient-to-br from-purple-500/20 to-blue-500/20 border-2 border-purple-500/30 rounded flex items-center justify-center">
                    <Terminal className="w-5 h-5 text-purple-400" />
                  </div>
                  
                  {/* Card front */}
                  <div className={`card-face absolute inset-0 backface-hidden rotate-y-180 ${
                    card.matched ? 'bg-green-500/20 border-green-500/30' : 'bg-white/10 border-white/20'
                  } border-2 rounded flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${icon?.color || 'text-blue-400'}`} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Pause overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
          <div className="text-center">
            <Pause className="w-8 h-8 mx-auto mb-2 text-white" />
            <div className="text-base font-bold">Paused</div>
            <button
              onClick={togglePause}
              className="mt-2 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      <style>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        .transform-style-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
        .card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.5s;
          transform-style: preserve-3d;
        }
        .card-face {
          position: absolute;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
        }
      `}</style>
    </div>
  )
}
