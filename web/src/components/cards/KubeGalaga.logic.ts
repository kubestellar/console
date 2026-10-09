import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BULLET_HEIGHT,
  ENEMY_WIDTH,
  ENEMY_HEIGHT,
  ENEMY_COLS,
  ENEMY_ROWS,
  BULLET_SPEED,
  ENEMY_BULLET_SPEED,
  type Bullet,
  type Enemy,
  type Star,
} from './KubeGalaga.constants'

/** Creates the scrolling starfield background. */
export function createStars(): Star[] {
  return Array.from({ length: 50 }, () => ({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    speed: 0.5 + Math.random() * 1.5,
    size: Math.random() > 0.7 ? 2 : 1 }))
}

/** Builds the enemy formation for a level (grows with level). */
export function createEnemies(lvl: number): Enemy[] {
  const enemies: Enemy[] = []
  const rows = Math.min(ENEMY_ROWS + Math.floor(lvl / 3), 6)
  const cols = Math.min(ENEMY_COLS + Math.floor(lvl / 2), 10)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      enemies.push({
        x: 50 + col * (ENEMY_WIDTH + 10),
        y: 50 + row * (ENEMY_HEIGHT + 15),
        row,
        alive: true,
        diving: false,
        diveX: 0,
        diveY: 0,
        diveAngle: 0 })
    }
  }
  return enemies
}

/** Scrolls stars down, wrapping them back to the top. Mutates in place. */
export function advanceStars(stars: Star[]) {
  stars.forEach(star => {
    star.y += star.speed
    if (star.y > CANVAS_HEIGHT) {
      star.y = 0
      star.x = Math.random() * CANVAS_WIDTH
    }
  })
}

/** Moves bullets and drops those that left the canvas. */
export function advanceBullets(bullets: Bullet[]): Bullet[] {
  return bullets.filter(bullet => {
    if (bullet.isEnemy) {
      bullet.y += ENEMY_BULLET_SPEED
      return bullet.y < CANVAS_HEIGHT
    } else {
      bullet.y -= BULLET_SPEED
      return bullet.y > -BULLET_HEIGHT
    }
  })
}

/** Advances diving enemies along their sine path, returning them to formation off-screen. Mutates in place. */
export function advanceDivingEnemies(enemies: Enemy[]) {
  enemies.forEach(enemy => {
    if (!enemy.alive || !enemy.diving) return

    enemy.diveAngle += 0.05
    enemy.diveX += Math.sin(enemy.diveAngle) * 3
    enemy.diveY += 4

    enemy.x = enemy.diveX
    enemy.y = enemy.diveY

    // Return to formation or go off screen
    if (enemy.y > CANVAS_HEIGHT + 50) {
      enemy.diving = false
      enemy.x = 50 + (Math.floor(Math.random() * ENEMY_COLS)) * (ENEMY_WIDTH + 10)
      enemy.y = 50 + enemy.row * (ENEMY_HEIGHT + 15)
      enemy.diveX = enemy.x
      enemy.diveY = enemy.y
    }
  })
}
