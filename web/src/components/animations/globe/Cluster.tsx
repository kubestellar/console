import { useRef, useState, useMemo, useEffect } from "react"
import { useFrame } from "@react-three/fiber"
import { Sphere, Line, Text, Billboard } from "@react-three/drei"
import * as THREE from "three"

const COLORS = {
  primary: "#1a90ff",
  success: "#00E396",
  background: "#0a0f1c",
}

interface ClusterProps {
  position?: [number, number, number]
  name: string
  nodeCount: number
  radius: number
  color: string
  description?: string
}

const Cluster = ({ position = [0, 0, 0], name, nodeCount, radius, color, description }: ClusterProps) => {
  const clusterRef = useRef<THREE.Group>(null)
  const [activeNodes, setActiveNodes] = useState<number[]>([])
  const [hovered, setHovered] = useState(false)

  const nodes = useMemo(() => {
    return Array.from({ length: nodeCount }, (_, i) => {
      const phi = Math.acos(-1 + (2 * i) / nodeCount)
      const theta = Math.sqrt(nodeCount * Math.PI) * phi
      return [
        radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.sin(theta) * Math.sin(phi),
        radius * Math.cos(phi),
      ] as [number, number, number]
    })
  }, [nodeCount, radius])

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveNodes(Array.from({ length: Math.floor(nodeCount / 3) }, () => Math.floor(Math.random() * nodeCount)))
    }, 3000)
    return () => clearInterval(interval)
  }, [nodeCount])

  useFrame(state => {
    if (clusterRef.current) {
      clusterRef.current.rotation.y = state.clock.getElapsedTime() * 0.1
      clusterRef.current.rotation.x = Math.sin(state.clock.getElapsedTime() * 0.2) * 0.05
      const targetScale = hovered ? 1.05 : 1
      clusterRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1)
    }
  })

  return (
    <group position={position} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
      <Sphere args={[radius * 1.2, 32, 32]}>
        <meshPhongMaterial color={color} transparent opacity={hovered ? 0.25 : 0.15} wireframe emissive={color} emissiveIntensity={hovered ? 0.3 : 0.1} />
      </Sphere>
      <Billboard position={[0, radius * 1.4, 0]}>
        <Text fontSize={0.18} color={color} anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor={COLORS.background}>{name}</Text>
        {description && hovered && (
          <Text position={[0, 0.2, 0]} fontSize={0.1} color="white" anchorX="center" anchorY="middle" outlineWidth={0.005} outlineColor={COLORS.background} maxWidth={2} textAlign="center">{description}</Text>
        )}
      </Billboard>
      <group ref={clusterRef}>
        {nodes.map((nodePos, idx) => (
          <group key={idx}>
            <Sphere position={nodePos} args={[0.08, 16, 16]}>
              <meshPhongMaterial color={activeNodes.includes(idx) ? COLORS.success : color} emissive={activeNodes.includes(idx) ? color : undefined} emissiveIntensity={activeNodes.includes(idx) ? 0.5 : 0} />
            </Sphere>
            {idx % 2 === 0 && nodes.slice(idx + 1).filter((_, i) => i % 3 === 0).map((target, targetIdx) => (
              <Line key={targetIdx} points={[nodePos, target]} color={color} lineWidth={1} transparent opacity={0.3} />
            ))}
          </group>
        ))}
      </group>
    </group>
  )
}

export default Cluster
