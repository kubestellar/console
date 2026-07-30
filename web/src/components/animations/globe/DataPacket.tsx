import { useRef, useState, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import { Mesh, Points } from "three"

/** Number of trail particles rendered behind each data packet */
const TRAIL_LENGTH = 30

interface DataPacketProps {
  path: [number, number, number][]
  speed?: number
  color?: string
  size?: number
}

const DataPacket = ({ path, speed = 1, color = "#00E396", size = 0.08 }: DataPacketProps) => {
  const ref = useRef<Mesh>(null)
  const [progress, setProgress] = useState(0)
  const trailRef = useRef<Points>(null)

  const trailPositions = useMemo(() => new Float32Array(TRAIL_LENGTH * 3), [])

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
      {/* Trail particles */}
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[trailPositions, 3, false]} />
        </bufferGeometry>
        <pointsMaterial color={color} size={size * 0.6} transparent opacity={0.4} sizeAttenuation depthWrite={false} />
      </points>
      {/* Main packet */}
      <mesh ref={ref} position={position}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Glow halo around packet */}
      <mesh position={position}>
        <sphereGeometry args={[size * 2.5, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} depthWrite={false} />
      </mesh>
    </group>
  )
}

export default DataPacket
