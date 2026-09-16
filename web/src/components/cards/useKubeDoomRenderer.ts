/**
 * Raycasting canvas renderer + game loop for the KubeDoom card. Draws
 * walls, enemy sprites, HUD flashes, weapon, and minimap each frame.
 */
import { useEffect, useRef, useCallback, type RefObject } from 'react'
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, MAP_WIDTH, MAP_HEIGHT, FOV, NUM_RAYS, MAX_DEPTH, HALF_FOV,
  WALL_COLORS, CEILING_COLOR, FLOOR_COLOR, CROSSHAIR_COLOR, FLASH_SHOOT_COLOR, FLASH_DAMAGE_COLOR,
  ENEMY_EYE_RGB, getMap, type Enemy, type Player,
} from './kubeDoom.constants'

interface UseKubeDoomRendererArgs {
  gameState: string
  playerRef: RefObject<Player>
  enemiesRef: RefObject<Enemy[]>
  shootFlashRef: RefObject<number>
  damageFlashRef: RefObject<number>
  update: () => void
}

export function useKubeDoomRenderer({ gameState, playerRef, enemiesRef, shootFlashRef, damageFlashRef, update }: UseKubeDoomRendererArgs) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const player = playerRef.current

    // Ceiling
    ctx.fillStyle = CEILING_COLOR
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT / 2)
    // Floor
    ctx.fillStyle = FLOOR_COLOR
    ctx.fillRect(0, CANVAS_HEIGHT / 2, CANVAS_WIDTH, CANVAS_HEIGHT / 2)

    // Depth buffer for sprite clipping
    const depthBuffer = new Float32Array(NUM_RAYS)

    // Raycasting walls
    for (let i = 0; i < NUM_RAYS; i++) {
      const rayAngle = player.angle - HALF_FOV + (i / NUM_RAYS) * FOV

      let depth = 0
      const stepSize = 0.02
      let hitWall = 0

      while (depth < MAX_DEPTH) {
        depth += stepSize
        const testX = player.x + Math.cos(rayAngle) * depth
        const testY = player.y + Math.sin(rayAngle) * depth
        const wall = getMap(testX, testY)
        if (wall > 0) {
          hitWall = wall
          break
        }
      }

      depthBuffer[i] = depth

      // Fix fisheye
      const correctedDepth = depth * Math.cos(rayAngle - player.angle)
      const wallHeight = Math.min(CANVAS_HEIGHT, (CANVAS_HEIGHT / 2) / correctedDepth)

      // Shade based on distance
      const shade = Math.max(0, 1 - depth / MAX_DEPTH)
      const baseColor = WALL_COLORS[(hitWall - 1) % WALL_COLORS.length]
      const r = parseInt(baseColor.slice(1, 3), 16)
      const g = parseInt(baseColor.slice(3, 5), 16)
      const b = parseInt(baseColor.slice(5, 7), 16)

      ctx.fillStyle = `rgb(${Math.floor(r * shade)},${Math.floor(g * shade)},${Math.floor(b * shade)})`
      const wallTop = (CANVAS_HEIGHT - wallHeight) / 2
      ctx.fillRect(i, wallTop, 1, wallHeight)
    }

    // Render enemies as sprites
    // Sort by distance (far to near)
    const visibleEnemies = enemiesRef.current
      .filter(e => e.alive)
      .map(e => {
        const dx = e.x - player.x
        const dy = e.y - player.y
        return { ...e, dist: Math.sqrt(dx * dx + dy * dy), dx, dy }
      })
      .sort((a, b) => b.dist - a.dist)

    for (const enemy of visibleEnemies) {
      const angle = Math.atan2(enemy.dy, enemy.dx)
      let angleDiff = angle - player.angle
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

      // Only render if in FOV
      if (Math.abs(angleDiff) > HALF_FOV + 0.2) continue

      const correctedDist = enemy.dist * Math.cos(angleDiff)
      if (correctedDist < 0.3) continue

      const spriteHeight = Math.min(CANVAS_HEIGHT, (CANVAS_HEIGHT / 2) / correctedDist)
      const spriteWidth = spriteHeight * 0.6
      const screenX = (CANVAS_WIDTH / 2) + (angleDiff / HALF_FOV) * (CANVAS_WIDTH / 2)
      const screenY = (CANVAS_HEIGHT - spriteHeight) / 2

      // Check if sprite is behind a wall
      const centerCol = Math.floor(screenX)
      if (centerCol >= 0 && centerCol < NUM_RAYS && depthBuffer[centerCol] < enemy.dist - 0.1) continue

      // Sprite shade
      const shade = Math.max(0.2, 1 - enemy.dist / MAX_DEPTH)
      const isHit = enemy.hitTimer > 0

      // Draw enemy body
      const enemyColors = ['#ff4444', '#ff8800', '#aa44ff', '#44ff88']
      const baseR = isHit ? 255 : parseInt(enemyColors[enemy.type % 4].slice(1, 3), 16)
      const baseG = isHit ? 255 : parseInt(enemyColors[enemy.type % 4].slice(3, 5), 16)
      const baseB = isHit ? 255 : parseInt(enemyColors[enemy.type % 4].slice(5, 7), 16)

      // Body
      ctx.fillStyle = `rgb(${Math.floor(baseR * shade)},${Math.floor(baseG * shade)},${Math.floor(baseB * shade)})`
      ctx.fillRect(screenX - spriteWidth / 2, screenY + spriteHeight * 0.2, spriteWidth, spriteHeight * 0.6)

      // Head
      ctx.beginPath()
      ctx.arc(screenX, screenY + spriteHeight * 0.2, spriteWidth * 0.35, 0, Math.PI * 2)
      ctx.fill()

      // Eyes (red glow)
      const eyeR = Math.max(2, spriteWidth * 0.08)
      ctx.fillStyle = `rgb(${Math.floor(ENEMY_EYE_RGB[0] * shade)},${Math.floor(ENEMY_EYE_RGB[1] * shade)},${Math.floor(ENEMY_EYE_RGB[2] * shade)})`
      ctx.beginPath()
      ctx.arc(screenX - spriteWidth * 0.12, screenY + spriteHeight * 0.15, eyeR, 0, Math.PI * 2)
      ctx.arc(screenX + spriteWidth * 0.12, screenY + spriteHeight * 0.15, eyeR, 0, Math.PI * 2)
      ctx.fill()

      // K8s icon on body (cube shape)
      if (spriteWidth > 20) {
        const iconSize = spriteWidth * 0.2
        ctx.strokeStyle = `rgba(255,255,255,${shade * 0.7})`
        ctx.lineWidth = 1
        const ix = screenX - iconSize / 2
        const iy = screenY + spriteHeight * 0.4
        // Simple cube/container icon
        ctx.strokeRect(ix, iy, iconSize, iconSize)
        ctx.beginPath()
        ctx.moveTo(ix, iy)
        ctx.lineTo(ix + iconSize * 0.3, iy - iconSize * 0.3)
        ctx.lineTo(ix + iconSize * 1.3, iy - iconSize * 0.3)
        ctx.lineTo(ix + iconSize, iy)
        ctx.stroke()
      }
    }

    // Shoot flash
    if (shootFlashRef.current > 0) {
      ctx.fillStyle = `rgba(${FLASH_SHOOT_COLOR[0]}, ${FLASH_SHOOT_COLOR[1]}, ${FLASH_SHOOT_COLOR[2]}, ${shootFlashRef.current / 8 * 0.3})`
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    }

    // Damage flash
    if (damageFlashRef.current > 0) {
      ctx.fillStyle = `rgba(${FLASH_DAMAGE_COLOR[0]}, ${FLASH_DAMAGE_COLOR[1]}, ${FLASH_DAMAGE_COLOR[2]}, ${damageFlashRef.current / 8 * 0.4})`
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    }

    // Crosshair
    ctx.strokeStyle = CROSSHAIR_COLOR
    ctx.lineWidth = 2
    const cx = CANVAS_WIDTH / 2
    const cy = CANVAS_HEIGHT / 2
    ctx.beginPath()
    ctx.moveTo(cx - 12, cy)
    ctx.lineTo(cx - 4, cy)
    ctx.moveTo(cx + 4, cy)
    ctx.lineTo(cx + 12, cy)
    ctx.moveTo(cx, cy - 12)
    ctx.lineTo(cx, cy - 4)
    ctx.moveTo(cx, cy + 4)
    ctx.lineTo(cx, cy + 12)
    ctx.stroke()

    // Weapon at bottom
    const weaponShake = shootFlashRef.current > 0 ? -5 : 0
    ctx.fillStyle = '#555'
    ctx.fillRect(CANVAS_WIDTH / 2 - 15, CANVAS_HEIGHT - 60 + weaponShake, 30, 60)
    ctx.fillStyle = '#333'
    ctx.fillRect(CANVAS_WIDTH / 2 - 8, CANVAS_HEIGHT - 80 + weaponShake, 16, 25)
    // Muzzle flash
    if (shootFlashRef.current > 4) {
      ctx.fillStyle = '#ffdd44'
      ctx.beginPath()
      ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 85 + weaponShake, 10, 0, Math.PI * 2)
      ctx.fill()
    }

    // Minimap
    const mmScale = 4
    const mmOffX = CANVAS_WIDTH - MAP_WIDTH * mmScale - 8
    const mmOffY = 8
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(mmOffX - 2, mmOffY - 2, MAP_WIDTH * mmScale + 4, MAP_HEIGHT * mmScale + 4)

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const wall = getMap(x, y)
        if (wall > 0) {
          ctx.fillStyle = WALL_COLORS[(wall - 1) % WALL_COLORS.length]
          ctx.fillRect(mmOffX + x * mmScale, mmOffY + y * mmScale, mmScale, mmScale)
        }
      }
    }

    // Player on minimap
    ctx.fillStyle = '#00ff00'
    ctx.beginPath()
    ctx.arc(mmOffX + player.x * mmScale, mmOffY + player.y * mmScale, 2, 0, Math.PI * 2)
    ctx.fill()
    // Direction line
    ctx.strokeStyle = '#00ff00'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(mmOffX + player.x * mmScale, mmOffY + player.y * mmScale)
    ctx.lineTo(
      mmOffX + (player.x + Math.cos(player.angle) * 1.5) * mmScale,
      mmOffY + (player.y + Math.sin(player.angle) * 1.5) * mmScale
    )
    ctx.stroke()

    // Enemies on minimap
    for (const enemy of enemiesRef.current) {
      if (!enemy.alive) continue
      ctx.fillStyle = '#ff4444'
      ctx.beginPath()
      ctx.arc(mmOffX + enemy.x * mmScale, mmOffY + enemy.y * mmScale, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [playerRef, enemiesRef, shootFlashRef, damageFlashRef])

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return

    const gameLoop = () => {
      update()
      render()
      animationRef.current = requestAnimationFrame(gameLoop)
    }

    animationRef.current = requestAnimationFrame(gameLoop)
    return () => cancelAnimationFrame(animationRef.current)
  }, [gameState, update, render])

  return { canvasRef, render }
}
