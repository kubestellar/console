import type { CSSProperties } from 'react'

const STAR_COUNT = 30
const MIN_STAR_SIZE_PX = 1
const STAR_SIZE_VARIANCE_PX = 2
const STAR_POSITION_PERCENT = 100
const STAR_ANIMATION_DELAY_S = 3

const STAR_POSITIONS: CSSProperties[] = Array.from({ length: STAR_COUNT }, () => ({
  width: `${Math.random() * STAR_SIZE_VARIANCE_PX + MIN_STAR_SIZE_PX}px`,
  height: `${Math.random() * STAR_SIZE_VARIANCE_PX + MIN_STAR_SIZE_PX}px`,
  left: `${Math.random() * STAR_POSITION_PERCENT}%`,
  top: `${Math.random() * STAR_POSITION_PERCENT}%`,
  animationDelay: `${Math.random() * STAR_ANIMATION_DELAY_S}s`,
}))

export function StarsBackground() {
  return (
    <div className="star-field">
      {STAR_POSITIONS.map((style, index) => (
        <div key={index} className="star" style={style} />
      ))}
    </div>
  )
}
