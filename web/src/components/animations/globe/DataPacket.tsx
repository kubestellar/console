import { useRef, useState, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
// NOTE: Wildcard import is required for React Three Fiber (R3F) type support
// R3F uses THREE namespace for type annotations and JSX intrinsic elements
import * as THREE from "three"

interface DataPacketProps {
  path: [number, number, number][]
  speed?: number
  color?: string
  size?: number
}

const DataPacket = ({ path, speed = 1, color = "#00E396", size = 0.08 }: DataPacketProps) => {
  const ref = useRef<THREE.Mesh>(null)
  const [progress, setProgress] = useState(0)
  const trailRef = useRef<THREE.Points>(null)

  const trailPositions = useMemo(() => new Float32Array(20 * 3), [])

  useFrame(() => {
    setProgress(prev => (prev >= 1 ? 0 : prev + 0.005 * speed))

    if (trailRef.current && ref.current && path.length >= 2) {
      const positions = trailRef.current.geometry.attributes.position.array as Float32Array
      const [start, end] = path

      const x = start[0] + (end[0] - start[0]) * progress
      const y = start[1] + (end[1] - start[1]) * progress
      const z = start[2] + (end[2] - start[2]) * progress

      for (let i = positions.length - 3; i >= 3; i -= 3) {
        positions[i] = positions[i - 3]
        positions[i + 1] = positions[i - 2]
        positions[i + 2] = positions[i - 1]
      }

      positions[0] = x
      positions[1] = y
      positions[2] = z
      trailRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  const position = useMemo(() => {
    if (path.length < 2) return [0, 0, 0] as [number, number, number]
    const [start, end] = path
    return [
      start[0] + (end[0] - start[0]) * progress,
      start[1] + (end[1] - start[1]) * progress,
      start[2] + (end[2] - start[2]) * progress,
    ] as [number, number, number]
  }, [path, progress])

  return (
    <group>
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[trailPositions, 3, false]} />
        </bufferGeometry>
        <pointsMaterial color={color} size={size * 0.8} transparent opacity={0.6} sizeAttenuation />
      </points>
      <mesh ref={ref} position={position}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

export default DataPacket
