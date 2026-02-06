import { useState, useEffect, useRef, useCallback } from 'react'
import { useCardExpanded } from './CardWrapper'
import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { Play, Pause, RotateCcw, Sun, Moon } from 'lucide-react'

// Block types with colors and properties
type BlockType = 'air' | 'grass' | 'dirt' | 'stone' | 'wood' | 'leaves' | 'water' | 'sand' | 'brick' | 'glass' | 'bedrock'

interface Block {
  type: BlockType
}

const BLOCK_COLORS: Record<BlockType, { top: number; side: number; bottom: number; transparent?: boolean; emissive?: number }> = {
  air: { top: 0x000000, side: 0x000000, bottom: 0x000000, transparent: true },
  grass: { top: 0x228B22, side: 0x8B4513, bottom: 0x8B4513 },
  dirt: { top: 0x8B4513, side: 0x8B4513, bottom: 0x8B4513 },
  stone: { top: 0x808080, side: 0x808080, bottom: 0x808080 },
  wood: { top: 0xDEB887, side: 0x8B7355, bottom: 0xDEB887 },
  leaves: { top: 0x32CD32, side: 0x32CD32, bottom: 0x32CD32, transparent: true },
  water: { top: 0x4169E1, side: 0x4169E1, bottom: 0x4169E1, transparent: true },
  sand: { top: 0xF4A460, side: 0xF4A460, bottom: 0xF4A460 },
  brick: { top: 0xB22222, side: 0xB22222, bottom: 0xB22222 },
  glass: { top: 0xADD8E6, side: 0xADD8E6, bottom: 0xADD8E6, transparent: true },
  bedrock: { top: 0x1a1a1a, side: 0x1a1a1a, bottom: 0x1a1a1a },
}

const BLOCK_TYPES: BlockType[] = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'water', 'sand', 'brick', 'glass']

const WORLD_SIZE = 32
const CHUNK_HEIGHT = 24
const STORAGE_KEY = 'kube_craft_3d_world'

// Simplex noise for terrain generation
function createNoise() {
  const p = new Array(512)
  const permutation = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,
    190, 6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,
    68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,
    143,54, 65,25,63,161,1,216,80,73,209,76,132,187,208, 89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,
    186, 3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,
    170,213,119,248,152, 2,44,154,163, 70,221,153,101,155,167, 43,172,9,129,22,39,253, 19,98,108,110,79,113,224,232,178,
    185, 112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241, 81,51,145,235,249,14,239,107,49,192,214,
    31,181,199,106,157,184, 84,204,176,115,121,50,45,127, 4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,
    78,66,215,61,156,180]
  for(let i = 0; i < 256; i++) {
    p[256 + i] = p[i] = permutation[i]
  }

  function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10) }
  function lerp(t: number, a: number, b: number) { return a + t * (b - a) }
  function grad(hash: number, x: number, y: number) {
    const h = hash & 3
    const u = h < 2 ? x : y
    const v = h < 2 ? y : x
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
  }

  return function noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    x -= Math.floor(x)
    y -= Math.floor(y)
    const u = fade(x)
    const v = fade(y)
    const A = p[X] + Y, B = p[X + 1] + Y
    return lerp(v, lerp(u, grad(p[A], x, y), grad(p[B], x - 1, y)),
                   lerp(u, grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1)))
  }
}

// Generate terrain
function generateTerrain(): Block[][][] {
  const world: Block[][][] = Array(WORLD_SIZE).fill(null).map(() =>
    Array(CHUNK_HEIGHT).fill(null).map(() =>
      Array(WORLD_SIZE).fill(null).map(() => ({ type: 'air' as BlockType }))
    )
  )

  const noise = createNoise()

  // Generate heightmap
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      // Multi-octave noise for more interesting terrain
      let height = 8
      height += noise(x * 0.05, z * 0.05) * 6
      height += noise(x * 0.1, z * 0.1) * 3
      height += noise(x * 0.2, z * 0.2) * 1.5
      height = Math.max(1, Math.min(CHUNK_HEIGHT - 5, Math.floor(height)))

      // Fill in blocks
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        if (y === 0) {
          world[x][y][z] = { type: 'bedrock' }
        } else if (y < height - 3) {
          world[x][y][z] = { type: 'stone' }
        } else if (y < height) {
          world[x][y][z] = { type: 'dirt' }
        } else if (y === height) {
          // Water level
          if (height < 6) {
            world[x][y][z] = { type: 'sand' }
          } else {
            world[x][y][z] = { type: 'grass' }
          }
        } else if (y < 7 && y > height) {
          world[x][y][z] = { type: 'water' }
        }
      }

      // Add trees
      if (height > 7 && Math.random() < 0.02 && x > 2 && x < WORLD_SIZE - 3 && z > 2 && z < WORLD_SIZE - 3) {
        const treeHeight = 4 + Math.floor(Math.random() * 3)
        for (let ty = 1; ty <= treeHeight; ty++) {
          if (height + ty < CHUNK_HEIGHT) {
            world[x][height + ty][z] = { type: 'wood' }
          }
        }
        // Leaves
        for (let lx = -2; lx <= 2; lx++) {
          for (let lz = -2; lz <= 2; lz++) {
            for (let ly = treeHeight - 2; ly <= treeHeight + 1; ly++) {
              if (height + ly < CHUNK_HEIGHT && (Math.abs(lx) + Math.abs(lz) + Math.abs(ly - treeHeight) < 4)) {
                const wx = x + lx, wz = z + lz, wy = height + ly
                if (wx >= 0 && wx < WORLD_SIZE && wz >= 0 && wz < WORLD_SIZE && world[wx][wy][wz].type === 'air') {
                  world[wx][wy][wz] = { type: 'leaves' }
                }
              }
            }
          }
        }
      }
    }
  }

  return world
}

export function KubeCraft3D() {
  const { isExpanded } = useCardExpanded()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<PointerLockControls | null>(null)
  const worldRef = useRef<Block[][][]>([])
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const animationRef = useRef<number>(0)

  const [, setIsPlaying] = useState(false)
  const [selectedBlock, setSelectedBlock] = useState<BlockType>('grass')
  const [isDaytime, setIsDaytime] = useState(true)
  const [showGrid] = useState(false)
  const [position] = useState({ x: WORLD_SIZE / 2, y: 15, z: WORLD_SIZE / 2 })
  const [isLocked, setIsLocked] = useState(false)

  // Movement state
  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    velocity: new THREE.Vector3(),
  })

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    const width = containerRef.current.clientWidth
    const height = isExpanded ? 500 : 350

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(isDaytime ? 0x87CEEB : 0x1a1a2e)
    scene.fog = new THREE.Fog(isDaytime ? 0x87CEEB : 0x1a1a2e, 20, 60)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 100)
    camera.position.set(position.x, position.y, position.z)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    rendererRef.current = renderer

    // Controls
    const controls = new PointerLockControls(camera, renderer.domElement)
    controlsRef.current = controls

    const handleLock = () => setIsLocked(true)
    const handleUnlock = () => setIsLocked(false)

    controls.addEventListener('lock', handleLock)
    controls.addEventListener('unlock', handleUnlock)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, isDaytime ? 0.6 : 0.2)
    scene.add(ambientLight)

    const sunLight = new THREE.DirectionalLight(0xffffff, isDaytime ? 1 : 0.3)
    sunLight.position.set(50, 100, 50)
    sunLight.castShadow = true
    scene.add(sunLight)

    // Load or generate world
    let world: Block[][][]
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        world = JSON.parse(saved)
      } else {
        world = generateTerrain()
      }
    } catch {
      world = generateTerrain()
    }
    worldRef.current = world

    // Create block meshes
    const blockGeometry = new THREE.BoxGeometry(1, 1, 1)

    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let z = 0; z < WORLD_SIZE; z++) {
          const block = world[x][y][z]
          if (block.type !== 'air') {
            createBlockMesh(x, y, z, block.type, scene, blockGeometry)
          }
        }
      }
    }

    // Grid helper
    if (showGrid) {
      const gridHelper = new THREE.GridHelper(WORLD_SIZE, WORLD_SIZE)
      gridHelper.position.set(WORLD_SIZE / 2, 0, WORLD_SIZE / 2)
      scene.add(gridHelper)
    }

    // Crosshair
    const crosshairMaterial = new THREE.LineBasicMaterial({ color: 0xffffff })
    const crosshairGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.01, 0, -0.3),
      new THREE.Vector3(0.01, 0, -0.3),
      new THREE.Vector3(0, -0.01, -0.3),
      new THREE.Vector3(0, 0.01, -0.3),
    ])
    const crosshair = new THREE.LineSegments(crosshairGeometry, crosshairMaterial)
    camera.add(crosshair)
    scene.add(camera)

    // Animation loop
    const clock = new THREE.Clock()

    function animate() {
      animationRef.current = requestAnimationFrame(animate)

      const delta = clock.getDelta()

      if (controls.isLocked) {
        const speed = 10
        const velocity = moveState.current.velocity

        velocity.x -= velocity.x * 10.0 * delta
        velocity.z -= velocity.z * 10.0 * delta
        velocity.y -= velocity.y * 10.0 * delta

        const direction = new THREE.Vector3()
        direction.z = Number(moveState.current.forward) - Number(moveState.current.backward)
        direction.x = Number(moveState.current.right) - Number(moveState.current.left)
        direction.normalize()

        if (moveState.current.forward || moveState.current.backward) {
          velocity.z -= direction.z * speed * delta
        }
        if (moveState.current.left || moveState.current.right) {
          velocity.x -= direction.x * speed * delta
        }
        if (moveState.current.up) {
          velocity.y = 5 * delta
        } else if (moveState.current.down) {
          velocity.y = -5 * delta
        }

        controls.moveRight(-velocity.x)
        controls.moveForward(-velocity.z)
        camera.position.y += velocity.y

        // Keep within bounds
        camera.position.x = Math.max(0, Math.min(WORLD_SIZE, camera.position.x))
        camera.position.z = Math.max(0, Math.min(WORLD_SIZE, camera.position.z))
        camera.position.y = Math.max(2, Math.min(CHUNK_HEIGHT + 10, camera.position.y))
      }

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationRef.current)
      renderer.dispose()
      meshesRef.current.clear()
      // Remove event listeners from controls
      if (controls) {
        controls.removeEventListener('lock', handleLock)
        controls.removeEventListener('unlock', handleUnlock)
      }
    }
  }, [isExpanded, isDaytime, showGrid])

  // Create a block mesh
  const createBlockMesh = useCallback((x: number, y: number, z: number, type: BlockType, scene: THREE.Scene, geometry?: THREE.BoxGeometry) => {
    const colors = BLOCK_COLORS[type]
    if (!colors || type === 'air') return

    const geo = geometry || new THREE.BoxGeometry(1, 1, 1)

    // Create materials for each face
    const materials = [
      new THREE.MeshLambertMaterial({ color: colors.side, transparent: colors.transparent, opacity: colors.transparent ? 0.7 : 1 }), // right
      new THREE.MeshLambertMaterial({ color: colors.side, transparent: colors.transparent, opacity: colors.transparent ? 0.7 : 1 }), // left
      new THREE.MeshLambertMaterial({ color: colors.top, transparent: colors.transparent, opacity: colors.transparent ? 0.7 : 1 }),  // top
      new THREE.MeshLambertMaterial({ color: colors.bottom, transparent: colors.transparent, opacity: colors.transparent ? 0.7 : 1 }), // bottom
      new THREE.MeshLambertMaterial({ color: colors.side, transparent: colors.transparent, opacity: colors.transparent ? 0.7 : 1 }), // front
      new THREE.MeshLambertMaterial({ color: colors.side, transparent: colors.transparent, opacity: colors.transparent ? 0.7 : 1 }), // back
    ]

    const mesh = new THREE.Mesh(geo, materials)
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5)
    mesh.castShadow = true
    mesh.receiveShadow = true

    const key = `${x},${y},${z}`
    meshesRef.current.set(key, mesh)
    scene.add(mesh)
  }, [])

  // Handle keyboard events
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isLocked) return

      switch (event.code) {
        case 'KeyW': moveState.current.forward = true; break
        case 'KeyS': moveState.current.backward = true; break
        case 'KeyA': moveState.current.left = true; break
        case 'KeyD': moveState.current.right = true; break
        case 'Space': moveState.current.up = true; break
        case 'ShiftLeft': moveState.current.down = true; break
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW': moveState.current.forward = false; break
        case 'KeyS': moveState.current.backward = false; break
        case 'KeyA': moveState.current.left = false; break
        case 'KeyD': moveState.current.right = false; break
        case 'Space': moveState.current.up = false; break
        case 'ShiftLeft': moveState.current.down = false; break
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [isLocked])

  // Handle mouse click for placing/breaking blocks
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!isLocked || !cameraRef.current || !sceneRef.current) return

      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(0, 0), cameraRef.current)

      const meshArray = Array.from(meshesRef.current.values())
      const intersects = raycaster.intersectObjects(meshArray)

      if (intersects.length > 0) {
        const intersect = intersects[0]
        const mesh = intersect.object as THREE.Mesh

        if (event.button === 0) {
          // Left click - break block
          const pos = mesh.position
          const x = Math.floor(pos.x)
          const y = Math.floor(pos.y)
          const z = Math.floor(pos.z)

          if (worldRef.current[x]?.[y]?.[z]?.type !== 'bedrock') {
            worldRef.current[x][y][z] = { type: 'air' }
            sceneRef.current.remove(mesh)
            meshesRef.current.delete(`${x},${y},${z}`)
            saveWorld()
          }
        } else if (event.button === 2 && intersect.face) {
          // Right click - place block
          const normal = intersect.face.normal
          const pos = mesh.position.clone().add(normal)
          const x = Math.floor(pos.x)
          const y = Math.floor(pos.y)
          const z = Math.floor(pos.z)

          if (x >= 0 && x < WORLD_SIZE && y >= 0 && y < CHUNK_HEIGHT && z >= 0 && z < WORLD_SIZE) {
            if (worldRef.current[x][y][z].type === 'air') {
              worldRef.current[x][y][z] = { type: selectedBlock }
              createBlockMesh(x, y, z, selectedBlock, sceneRef.current)
              saveWorld()
            }
          }
        }
      }
    }

    const onContextMenu = (event: Event) => {
      event.preventDefault()
    }

    const canvas = canvasRef.current
    if (canvas) {
      canvas.addEventListener('click', onClick)
      canvas.addEventListener('contextmenu', onContextMenu)
      canvas.addEventListener('mousedown', onClick as EventListener)
    }

    return () => {
      if (canvas) {
        canvas.removeEventListener('click', onClick)
        canvas.removeEventListener('contextmenu', onContextMenu)
        canvas.removeEventListener('mousedown', onClick as EventListener)
      }
    }
  }, [isLocked, selectedBlock, createBlockMesh])

  const saveWorld = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(worldRef.current))
  }, [])

  const resetWorld = useCallback(() => {
    worldRef.current = generateTerrain()
    localStorage.removeItem(STORAGE_KEY)
    // Reload the scene
    window.location.reload()
  }, [])

  const handlePlay = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.lock()
    }
    setIsPlaying(true)
  }, [])

  const handlePause = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.unlock()
    }
    setIsPlaying(false)
  }, [])

  const height = isExpanded ? 500 : 350

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col gap-3">
        {/* Block palette */}
        <div className="flex flex-wrap gap-1 justify-center">
          {BLOCK_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setSelectedBlock(type)}
              className={`w-7 h-7 rounded border-2 transition-all ${
                selectedBlock === type
                  ? 'border-white scale-110'
                  : 'border-transparent hover:border-white/50'
              }`}
              style={{ backgroundColor: `#${BLOCK_COLORS[type].top.toString(16).padStart(6, '0')}` }}
              title={type.charAt(0).toUpperCase() + type.slice(1)}
            />
          ))}
        </div>

        {/* Game container */}
        <div ref={containerRef} className="relative rounded overflow-hidden border border-border">
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height }}
            className="cursor-crosshair"
          />

          {/* ESC hint shown during gameplay */}
          {isLocked && (
            <div className="absolute top-2 left-2 px-2 py-1 bg-black/40 rounded text-xs text-white/60 pointer-events-none">
              ESC to pause
            </div>
          )}

          {/* Overlay when not playing */}
          {!isLocked && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-center">
                <button
                  onClick={handlePlay}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-lg font-semibold"
                >
                  <Play className="w-6 h-6" />
                  Click to Play
                </button>
                <p className="text-sm text-white/70 mt-4">
                  WASD to move, Space/Shift for up/down
                </p>
                <p className="text-sm text-white/70">
                  Left click to break, Right click to place
                </p>
                <p className="text-xs text-white/50 mt-2">
                  ESC to pause (your world is saved)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={isLocked ? handlePause : handlePlay}
            className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded text-sm"
          >
            {isLocked ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isLocked ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={() => setIsDaytime(!isDaytime)}
            className="flex items-center gap-1 px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
          >
            {isDaytime ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-blue-300" />}
          </button>
          <button
            onClick={resetWorld}
            className="flex items-center gap-1 px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
            title="Generate new world"
          >
            <RotateCcw className="w-4 h-4" />
            New
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Build in 3D! Select a block type and click to play.
        </p>
      </div>
    </div>
  )
}
