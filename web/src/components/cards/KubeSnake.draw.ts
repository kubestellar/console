import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_SIZE,
  CELL_SIZE,
  COLORS,
} from './KubeSnake.constants'
import type { Point, Direction } from './KubeSnake.constants'

/** Draws a full KubeSnake frame (background, grid, food and snake) onto the canvas. */
export function drawSnakeFrame(
  ctx: CanvasRenderingContext2D,
  food: Point,
  snake: Point[],
  direction: Direction,
) {
  // Clear
  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Draw grid
  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 0.5
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath()
    ctx.moveTo(i * CELL_SIZE, 0)
    ctx.lineTo(i * CELL_SIZE, CANVAS_HEIGHT)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * CELL_SIZE)
    ctx.lineTo(CANVAS_WIDTH, i * CELL_SIZE)
    ctx.stroke()
  }

  // Draw food with glow effect
  ctx.fillStyle = COLORS.foodGlow
  ctx.beginPath()
  ctx.arc(
    food.x * CELL_SIZE + CELL_SIZE / 2,
    food.y * CELL_SIZE + CELL_SIZE / 2,
    CELL_SIZE * 0.8,
    0,
    Math.PI * 2
  )
  ctx.fill()
  ctx.fillStyle = COLORS.food
  ctx.beginPath()
  ctx.arc(
    food.x * CELL_SIZE + CELL_SIZE / 2,
    food.y * CELL_SIZE + CELL_SIZE / 2,
    CELL_SIZE / 2 - 2,
    0,
    Math.PI * 2
  )
  ctx.fill()

  // Draw snake
  snake.forEach((segment, index) => {
    const isHead = index === 0
    ctx.fillStyle = isHead ? COLORS.snakeHead : COLORS.snake

    // Rounded rectangle for each segment
    const x = segment.x * CELL_SIZE + 1
    const y = segment.y * CELL_SIZE + 1
    const size = CELL_SIZE - 2
    const radius = isHead ? size / 3 : size / 4

    ctx.beginPath()
    ctx.roundRect(x, y, size, size, radius)
    ctx.fill()

    // Draw eyes on head
    if (isHead) {
      ctx.fillStyle = '#fff'
      const eyeSize = 3
      let eyeX1, eyeX2, eyeY1, eyeY2

      switch (direction) {
        case 'up':
          eyeX1 = x + size / 3 - eyeSize / 2
          eyeX2 = x + (size * 2) / 3 - eyeSize / 2
          eyeY1 = eyeY2 = y + size / 3
          break
        case 'down':
          eyeX1 = x + size / 3 - eyeSize / 2
          eyeX2 = x + (size * 2) / 3 - eyeSize / 2
          eyeY1 = eyeY2 = y + (size * 2) / 3
          break
        case 'left':
          eyeX1 = eyeX2 = x + size / 3
          eyeY1 = y + size / 3 - eyeSize / 2
          eyeY2 = y + (size * 2) / 3 - eyeSize / 2
          break
        case 'right':
        default:
          eyeX1 = eyeX2 = x + (size * 2) / 3
          eyeY1 = y + size / 3 - eyeSize / 2
          eyeY2 = y + (size * 2) / 3 - eyeSize / 2
          break
      }

      ctx.beginPath()
      ctx.arc(eyeX1, eyeY1, eyeSize, 0, Math.PI * 2)
      ctx.arc(eyeX2, eyeY2, eyeSize, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}
