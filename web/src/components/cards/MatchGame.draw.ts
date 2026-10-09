import { CONFETTI_DURATION_MS } from './MatchGame.constants'

/** Plays the win confetti burst on the overlay canvas, clearing it after CONFETTI_DURATION_MS. */
export function drawMatchGameConfetti(canvas: HTMLCanvasElement) {
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
      rotationSpeed: (Math.random() - 0.5) * 0.2 })
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
  }, CONFETTI_DURATION_MS)
}
