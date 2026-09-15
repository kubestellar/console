/**
 * Pure canvas drawing helpers for the KubeBert isometric pyramid renderer.
 */
import {
  KUBEBERT_TILE_STROKE, KUBEBERT_FACE_SHADOW, KUBEBERT_CHARACTER_OUTLINE,
  KUBEBERT_LABEL_TEXT, KUBEBERT_CHARACTER_EYES, KUBEBERT_CHARACTER_NOSE,
  KUBEBERT_CHARACTER_CROWN_BG, KUBEBERT_CHARACTER_CROWN_OUTLINE,
} from './kubeBert.constants'

/** Convert grid position to canvas pixel coordinates (isometric projection) */
export function gridToPixel(row: number, col: number, tileW: number, tileH: number, offsetX: number, offsetY: number) {
  const x = offsetX + (col - row / 2) * tileW
  const y = offsetY + row * tileH * 0.75
  return { x, y }
}

/** Draw an isometric cube/tile */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  tileW: number, tileH: number,
  topColor: string, leftColor: string, rightColor: string,
  label?: string,
) {
  const halfW = tileW / 2
  const quarterH = tileH / 4

  // Top face
  ctx.beginPath()
  ctx.moveTo(x, y - quarterH)
  ctx.lineTo(x + halfW, y)
  ctx.lineTo(x, y + quarterH)
  ctx.lineTo(x - halfW, y)
  ctx.closePath()
  ctx.fillStyle = topColor
  ctx.fill()
  ctx.strokeStyle = KUBEBERT_TILE_STROKE
  ctx.lineWidth = 1
  ctx.stroke()

  // Left face
  ctx.beginPath()
  ctx.moveTo(x - halfW, y)
  ctx.lineTo(x, y + quarterH)
  ctx.lineTo(x, y + quarterH + tileH / 3)
  ctx.lineTo(x - halfW, y + tileH / 3)
  ctx.closePath()
  ctx.fillStyle = leftColor
  ctx.fill()
  ctx.strokeStyle = KUBEBERT_FACE_SHADOW
  ctx.stroke()

  // Right face
  ctx.beginPath()
  ctx.moveTo(x + halfW, y)
  ctx.lineTo(x, y + quarterH)
  ctx.lineTo(x, y + quarterH + tileH / 3)
  ctx.lineTo(x + halfW, y + tileH / 3)
  ctx.closePath()
  ctx.fillStyle = rightColor
  ctx.fill()
  ctx.strokeStyle = KUBEBERT_FACE_SHADOW
  ctx.stroke()

  // Label on top face
  if (label) {
    ctx.fillStyle = KUBEBERT_LABEL_TEXT
    ctx.font = `${Math.max(8, tileW / 5)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y)
  }
}

/** Draw a character (player or enemy) as a small sprite on a tile */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  tileW: number,
  color: string,
  isPlayer: boolean,
) {
  const size = tileW / 3
  const charY = y - size * 1.2

  if (isPlayer) {
    // Player: Kube Bert — a cute round character with legs
    // Body
    ctx.beginPath()
    ctx.arc(x, charY, size * 0.7, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = KUBEBERT_CHARACTER_OUTLINE
    ctx.lineWidth = 1
    ctx.stroke()

    // Eyes
    const eyeSize = size * 0.15
    ctx.fillStyle = KUBEBERT_CHARACTER_EYES
    ctx.beginPath()
    ctx.arc(x - size * 0.25, charY - size * 0.15, eyeSize, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + size * 0.25, charY - size * 0.15, eyeSize, 0, Math.PI * 2)
    ctx.fill()

    // Nose (Q*bert's signature snout)
    ctx.beginPath()
    ctx.moveTo(x, charY + size * 0.05)
    ctx.lineTo(x + size * 0.4, charY + size * 0.2)
    ctx.lineTo(x, charY + size * 0.35)
    ctx.fillStyle = KUBEBERT_CHARACTER_NOSE
    ctx.fill()

    // Kubernetes wheel on top (little crown)
    ctx.beginPath()
    ctx.arc(x, charY - size * 0.7, size * 0.2, 0, Math.PI * 2)
    ctx.fillStyle = KUBEBERT_CHARACTER_CROWN_BG
    ctx.fill()
    ctx.strokeStyle = KUBEBERT_CHARACTER_CROWN_OUTLINE
    ctx.lineWidth = 1
    ctx.stroke()
  } else {
    // Enemy: triangle/snake shape
    ctx.beginPath()
    ctx.moveTo(x, charY - size * 0.6)
    ctx.lineTo(x + size * 0.5, charY + size * 0.4)
    ctx.lineTo(x - size * 0.5, charY + size * 0.4)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = KUBEBERT_CHARACTER_OUTLINE
    ctx.lineWidth = 1
    ctx.stroke()

    // Enemy eyes
    const eyeSize = size * 0.1
    ctx.fillStyle = KUBEBERT_CHARACTER_CROWN_OUTLINE
    ctx.beginPath()
    ctx.arc(x - size * 0.15, charY, eyeSize, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + size * 0.15, charY, eyeSize, 0, Math.PI * 2)
    ctx.fill()
  }
}

// Darken a hex color for side faces
export function darkenColor(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount)
  return `rgb(${r},${g},${b})`
}
