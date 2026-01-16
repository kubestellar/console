import { Suspense, useState, useEffect } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera } from "@react-three/drei"
import NetworkGlobe from "./NetworkGlobe"
import GlobeLoader from "./GlobeLoader"

interface GlobeAnimationProps {
  width?: string
  height?: string
  className?: string
  showLoader?: boolean
  enableControls?: boolean
  enablePan?: boolean
  autoRotate?: boolean
  style?: React.CSSProperties
}

const GlobeAnimation = ({
  width = "100%",
  height = "600px",
  className = "",
  showLoader = true,
  enableControls = false,
  enablePan = false,
  autoRotate = false,
  style = {},
}: GlobeAnimationProps) => {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 1000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className={`relative ${className}`} style={{ width, height, ...style }}>
      {showLoader && !isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent z-10">
          <GlobeLoader />
        </div>
      )}
      <Canvas className="w-full h-full" style={{ background: "transparent" }}>
        <PerspectiveCamera makeDefault position={[0, 0, 10]} fov={50} near={0.1} far={1000} />
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        {enableControls && (
          <OrbitControls enableZoom={false} enablePan={enablePan} enableRotate autoRotate={autoRotate} autoRotateSpeed={0.3} maxPolarAngle={Math.PI * 0.8} minPolarAngle={Math.PI * 0.2} maxAzimuthAngle={Infinity} minAzimuthAngle={-Infinity} />
        )}
        <Suspense fallback={null}>
          <NetworkGlobe isLoaded={isLoaded} />
        </Suspense>
      </Canvas>
    </div>
  )
}

export default GlobeAnimation
