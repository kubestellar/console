import { useState, useEffect, useRef, useCallback } from 'react'

import { Save, Download, Trash2, Grid, Sun, Moon } from 'lucide-react'

import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

// Game constants
const CANVAS_WIDTH = 400
const CANVAS_HEIGHT = 400
const GRID_SIZE = 20
const CELL_SIZE = CANVAS_WIDTH / GRID_SIZE

// Block types
type BlockType = 'air' | 'dirt' | 'grass' | 'stone' | 'wood' | 'leaves' | 'water' | 'sand' | 'brick' | 'glass'

interface Block {
  type: BlockType
}

// Block colors and properties
const BLOCKS: Record<BlockType, { color: string; secondary?: string; transparent?: boolean }> = {
  air: { color: 'transparent', transparent: true },
  dirt: { color: '#8B4513', secondary: '#6B3410' },
  grass: { color: '#228B22', secondary: '#8B4513' },
  stone: { color: '#808080', secondary: '#606060' },
  wood: { color: '#DEB887', secondary: '#8B7355' },
  leaves: { color: '#32CD32', secondary: '#228B22', transparent: true },
  water: { color: '#4169E1', secondary: '#1E90FF', transparent: true },
  sand: { color: '#F4A460', secondary: '#DEB887' },
  brick: { color: '#B22222', secondary: '#8B0000' },
  glass: { color: '#ADD8E6', transparent: true },
}

const BLOCK_TYPES: BlockType[] = ['dirt', 'grass', 'stone', 'wood', 'leaves', 'water', 'sand', 'brick', 'glass']

export function KubeCraft() {
  const { t: _t } = useTranslation()
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0 })
  const { isExpanded } = useCardExpanded()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedBlock, setSelectedBlock] = useState<BlockType>('grass')
  const [isErasing, setIsErasing] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [isDaytime, setIsDaytime] = useState(true)
  const [world, setWorld] = useState<Block[][]>(() => {
    // Try to load saved world
    const saved = localStorage.getItem('kubeCraftWorld')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Validate that the saved world has the correct structure
        if (
          Array.isArray(parsed) &&
          parsed.length === GRID_SIZE &&
          parsed.every((row: unknown) =>
            Array.isArray(row) &&
            row.length === GRID_SIZE &&
            row.every((cell: unknown) =>
              cell && typeof cell === 'object' && 'type' in cell
            )
          )
        ) {
          return parsed
        }
        // Invalid structure, remove corrupted data
        localStorage.removeItem('kubeCraftWorld')
      } catch {
        // Invalid JSON, remove corrupted data
        localStorage.removeItem('kubeCraftWorld')
      }
    }
    return generateWorld()
  })

  const isMouseDownRef = useRef(false)

  // Generate initial world with terrain
  function generateWorld(): Block[][] {
    const newWorld: Block[][] = Array(GRID_SIZE).fill(null).map(() =>
      Array(GRID_SIZE).fill(null).map(() => ({ type: 'air' as BlockType }))
    )

    // Generate terrain using simple noise
    const heights: number[] = []
    let height = GRID_SIZE / 2 + Math.floor(Math.random() * 3)

    for (let x = 0; x < GRID_SIZE; x++) {
      height += Math.floor(Math.random() * 3) - 1
      height = Math.max(Math.floor(GRID_SIZE / 3), Math.min(GRID_SIZE - 3, height))
      heights.push(height)
    }

    // Fill in blocks
    for (let x = 0; x < GRID_SIZE; x++) {
      const surfaceY = GRID_SIZE - heights[x]

      for (let y = GRID_SIZE - 1; y >= surfaceY; y--) {
        if (y === surfaceY) {
          newWorld[y][x] = { type: 'grass' }
        } else if (y < surfaceY + 3) {
          newWorld[y][x] = { type: 'dirt' }
        } else {
          newWorld[y][x] = { type: 'stone' }
        }
      }
    }

    // Add some trees
    for (let x = 2; x < GRID_SIZE - 2; x += 4 + Math.floor(Math.random() * 3)) {
      const surfaceY = GRID_SIZE - heights[x]
      if (surfaceY > 3) {
        // Trunk
        for (let y = surfaceY - 1; y >= surfaceY - 4 && y >= 0; y--) {
          newWorld[y][x] = { type: 'wood' }
        }
        // Leaves
        const leafY = surfaceY - 4
        if (leafY >= 0) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ly = leafY + dy
              const lx = x + dx
              if (ly >= 0 && ly < GRID_SIZE && lx >= 0 && lx < GRID_SIZE) {
                if (newWorld[ly][lx].type === 'air') {
                  newWorld[ly][lx] = { type: 'leaves' }
                }
              }
            }
          }
        }
      }
    }

    // Add water at low points
    for (let x = 0; x < GRID_SIZE; x++) {
      const surfaceY = GRID_SIZE - heights[x]
      if (surfaceY > GRID_SIZE - 5) {
        for (let y = surfaceY; y < GRID_SIZE - 3; y++) {
          if (newWorld[y][x].type === 'air') {
            newWorld[y][x] = { type: 'water' }
          }
        }
      }
    }

    return newWorld
  }

  // Render world
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Sky gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
    if (isDaytime) {
      gradient.addColorStop(0, '#87CEEB')
      gradient.addColorStop(1, '#E0F6FF')
    } else {
      gradient.addColorStop(0, '#1a1a2e')
      gradient.addColorStop(1, '#16213e')
    }
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw sun/moon
    ctx.fillStyle = isDaytime ? '#FFD700' : '#E8E8E8'
    ctx.beginPath()
    ctx.arc(CANVAS_WIDTH - 50, 50, 25, 0, Math.PI * 2)
    ctx.fill()

    // Draw blocks
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const block = world[y][x]
        if (block.type === 'air') continue

        const blockInfo = BLOCKS[block.type]
        const px = x * CELL_SIZE
        const py = y * CELL_SIZE

        // Main block color
        ctx.fillStyle = blockInfo.color
        if (blockInfo.transparent) {
          ctx.globalAlpha = 0.7
        }
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE)

        // Add texture/detail
        if (block.type === 'grass') {
          // Grass top with dirt bottom
          ctx.fillStyle = '#8B4513'
          ctx.fillRect(px, py + CELL_SIZE * 0.3, CELL_SIZE, CELL_SIZE * 0.7)
          ctx.fillStyle = '#228B22'
          ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE * 0.35)
        } else if (block.type === 'brick') {
          // Brick pattern
          ctx.strokeStyle = '#8B0000'
          ctx.lineWidth = 1
          ctx.strokeRect(px + 1, py + 1, CELL_SIZE / 2 - 2, CELL_SIZE / 2 - 2)
          ctx.strokeRect(px + CELL_SIZE / 2, py + 1, CELL_SIZE / 2 - 1, CELL_SIZE / 2 - 2)
          ctx.strokeRect(px + 1, py + CELL_SIZE / 2, CELL_SIZE - 2, CELL_SIZE / 2 - 1)
        } else if (block.type === 'wood') {
          // Wood grain lines
          ctx.strokeStyle = '#8B7355'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(px + CELL_SIZE / 3, py)
          ctx.lineTo(px + CELL_SIZE / 3, py + CELL_SIZE)
          ctx.moveTo(px + (CELL_SIZE * 2) / 3, py)
          ctx.lineTo(px + (CELL_SIZE * 2) / 3, py + CELL_SIZE)
          ctx.stroke()
        } else if (block.type === 'glass') {
          // Glass reflection
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(px + 3, py + 3)
          ctx.lineTo(px + 6, py + 3)
          ctx.moveTo(px + 3, py + 3)
          ctx.lineTo(px + 3, py + 6)
          ctx.stroke()
        } else if (block.type === 'water') {
          // Water ripples
          ctx.strokeStyle = '#1E90FF'
          ctx.lineWidth = 1
          const time = Date.now() / 500
          ctx.beginPath()
          ctx.moveTo(px, py + CELL_SIZE / 2 + Math.sin(time + x) * 2)
          ctx.quadraticCurveTo(
            px + CELL_SIZE / 2, py + CELL_SIZE / 2 - Math.sin(time + x + 1) * 2,
            px + CELL_SIZE, py + CELL_SIZE / 2 + Math.sin(time + x + 2) * 2
          )
          ctx.stroke()
        }

        ctx.globalAlpha = 1

        // Block outline
        if (!blockInfo.transparent) {
          ctx.strokeStyle = 'rgba(0,0,0,0.2)'
          ctx.lineWidth = 1
          ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE)
        }
      }
    }

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
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
    }
  }, [world, showGrid, isDaytime])

  // Animation loop for water
  useEffect(() => {
    const interval = setInterval(() => {
      render()
    }, 100)
    return () => clearInterval(interval)
  }, [render])

  // Handle mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isMouseDownRef.current = true
    handleClick(e)
  }, [])

  const handleMouseUp = useCallback(() => {
    isMouseDownRef.current = false
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMouseDownRef.current) return
    handleClick(e)
  }, [])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE)
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE)

    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return

    setWorld(prev => {
      const newWorld = prev.map(row => row.map(block => ({ ...block })))
      newWorld[y][x] = { type: isErasing ? 'air' : selectedBlock }
      return newWorld
    })
  }

  // Save world
  const saveWorld = useCallback(() => {
    localStorage.setItem('kubeCraftWorld', JSON.stringify(world))
  }, [world])

  // Reset world
  const resetWorld = useCallback(() => {
    const newWorld = generateWorld()
    setWorld(newWorld)
    localStorage.removeItem('kubeCraftWorld')
  }, [])

  // Clear world
  const clearWorld = useCallback(() => {
    const emptyWorld: Block[][] = Array(GRID_SIZE).fill(null).map(() =>
      Array(GRID_SIZE).fill(null).map(() => ({ type: 'air' as BlockType }))
    )
    setWorld(emptyWorld)
  }, [])

  // Initial render
  useEffect(() => {
    render()
  }, [render])

  return (
    <div className="h-full flex flex-col">
      <div className={`flex flex-col items-center gap-3 ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
        {/* Block palette */}
        <div className="flex flex-wrap gap-1 justify-center">
          {BLOCK_TYPES.map(type => (
            <button
              key={type}
              onClick={() => {
                setSelectedBlock(type)
                setIsErasing(false)
              }}
              className={`w-8 h-8 rounded border-2 transition-all ${
                selectedBlock === type && !isErasing
                  ? 'border-white scale-110'
                  : 'border-transparent hover:border-white/50'
              }`}
              style={{ backgroundColor: BLOCKS[type].color }}
              title={type.charAt(0).toUpperCase() + type.slice(1)}
            />
          ))}
          <button
            onClick={() => setIsErasing(true)}
            className={`w-8 h-8 rounded border-2 flex items-center justify-center transition-all ${
              isErasing
                ? 'border-white scale-110 bg-red-500/50'
                : 'border-transparent hover:border-white/50 bg-secondary'
            }`}
            title="Eraser"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Canvas */}
        <div className={`relative ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-border rounded cursor-crosshair"
            style={isExpanded ? { width: '100%', height: '100%', objectFit: 'contain' } : undefined}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseUp}
          />
        </div>

        {/* Controls */}
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`flex items-center gap-1 px-3 py-1 rounded text-sm transition-colors ${
              showGrid ? 'bg-primary/20 text-primary' : 'bg-secondary hover:bg-secondary/80'
            }`}
          >
            <Grid className="w-4 h-4" />
            Grid
          </button>
          <button
            onClick={() => setIsDaytime(!isDaytime)}
            className="flex items-center gap-1 px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
          >
            {isDaytime ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-blue-300" />}
            {isDaytime ? 'Day' : 'Night'}
          </button>
          <button
            onClick={saveWorld}
            className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm text-white"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={resetWorld}
            className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
          >
            <Download className="w-4 h-4" />
            New
          </button>
          <button
            onClick={clearWorld}
            className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm text-white"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        </div>

        <p className="text-xs text-muted-foreground">Click and drag to build! Select a block type above.</p>
      </div>
    </div>
  )
}
