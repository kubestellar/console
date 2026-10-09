import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PADDLE_WIDTH,
  PADDLE_HEIGHT,
  BALL_SIZE,
  getThemeColors,
  type Ball,
} from './KubePong.constants'

/** Draws a full KubePong frame (court, paddles, ball and scores) onto the canvas. */
export function drawPongFrame(
  ctx: CanvasRenderingContext2D,
  playerPaddleY: number,
  aiPaddleY: number,
  ball: Ball,
  playerScore: number,
  aiScore: number,
) {
  const colors = getThemeColors()

  // Clear
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Draw net
  ctx.strokeStyle = colors.net
  ctx.lineWidth = 2
  ctx.setLineDash([10, 10])
  ctx.beginPath()
  ctx.moveTo(CANVAS_WIDTH / 2, 0)
  ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT)
  ctx.stroke()
  ctx.setLineDash([])

  // Draw paddles
  ctx.fillStyle = colors.paddle
  // Player paddle (left)
  ctx.fillRect(20, playerPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT)
  // AI paddle (right)
  ctx.fillRect(CANVAS_WIDTH - 20 - PADDLE_WIDTH, aiPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT)

  // Draw ball
  ctx.fillStyle = colors.ball
  ctx.beginPath()
  ctx.arc(
    ball.x + BALL_SIZE / 2,
    ball.y + BALL_SIZE / 2,
    BALL_SIZE / 2,
    0,
    Math.PI * 2
  )
  ctx.fill()

  // Draw scores
  ctx.fillStyle = colors.score
  ctx.font = 'bold 48px monospace'
  ctx.textAlign = 'center'
  ctx.globalAlpha = 0.3
  ctx.fillText(playerScore.toString(), CANVAS_WIDTH / 4, 60)
  ctx.fillText(aiScore.toString(), (CANVAS_WIDTH / 4) * 3, 60)
  ctx.globalAlpha = 1
}
