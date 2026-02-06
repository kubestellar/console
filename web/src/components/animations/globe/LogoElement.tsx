import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
// NOTE: Wildcard import is required for React Three Fiber (R3F) type support
// R3F uses THREE namespace for type annotations and JSX intrinsic elements
// Named imports would break R3F's type system which expects the THREE namespace
import * as THREE from "three"
import GlowingSphere from "./GlowingSphere"

const COLORS = {
  primary: "#1a90ff",
  secondary: "#6236FF",
  highlight: "#00C2FF",
  accent1: "#FF5E84",
  accent2: "#FFD166",
}

interface LogoElementProps {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
}

const LogoElement = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 }: LogoElementProps) => {
  const groupRef = useRef<THREE.Group>(null)
  const ringRef1 = useRef<THREE.Mesh>(null)
  const ringRef2 = useRef<THREE.Mesh>(null)
  const ringRef3 = useRef<THREE.Mesh>(null)

  useFrame(state => {
    const t = state.clock.getElapsedTime()
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.2
      groupRef.current.rotation.z = Math.sin(t * 0.5) * 0.1
    }
    if (ringRef1.current) {
      ringRef1.current.rotation.x = t * 0.5
      ringRef1.current.rotation.z = t * 0.2
    }
    if (ringRef2.current) {
      ringRef2.current.rotation.x = -t * 0.3
      ringRef2.current.rotation.y = t * 0.4
    }
    if (ringRef3.current) {
      ringRef3.current.rotation.y = t * 0.2
      ringRef3.current.rotation.z = -t * 0.3
    }
  })

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      <GlowingSphere position={[0, 0, 0]} color={COLORS.secondary} size={0.25} />
      <mesh ref={ringRef1}>
        <torusGeometry args={[0.6, 0.02, 16, 100]} />
        <meshPhongMaterial color={COLORS.primary} emissive={COLORS.primary} emissiveIntensity={0.5} />
      </mesh>
      <mesh ref={ringRef2}>
        <torusGeometry args={[0.7, 0.02, 16, 100]} />
        <meshPhongMaterial color={COLORS.highlight} emissive={COLORS.highlight} emissiveIntensity={0.5} />
      </mesh>
      <mesh ref={ringRef3}>
        <torusGeometry args={[0.5, 0.02, 16, 100]} />
        <meshPhongMaterial color={COLORS.accent1} emissive={COLORS.accent1} emissiveIntensity={0.5} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2
        const x = Math.cos(angle) * 0.8
        const y = Math.sin(angle) * 0.8
        return (
          <mesh key={i} position={[x, y, 0]}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshBasicMaterial color={i % 2 === 0 ? COLORS.highlight : COLORS.accent2} />
          </mesh>
        )
      })}
    </group>
  )
}

export default LogoElement
