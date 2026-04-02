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

/** Simulated loading delay before revealing the 3-D globe in milliseconds */
const GLOBE_LOAD_DELAY_MS = 1000

/** Check if WebGL is available — returns false in headless browsers and CI */
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    return gl instanceof WebGLRenderingContext || gl instanceof WebGL2RenderingContext
  } catch {
    return false
  }
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
  const [hasWebGL] = useState(isWebGLAvailable)

  useEffect(() => {
    if (!hasWebGL) return
    // Simulate loading delay to show progressive animation
    const timer = setTimeout(() => {
      setIsLoaded(true)
    }, GLOBE_LOAD_DELAY_MS)

    return () => clearTimeout(timer)
  }, [hasWebGL])

  return (
    <div
      className={`relative ${className}`}
      style={{ width, height, ...style }}
    >
      {/* Loader */}
      {showLoader && !isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent z-10">
          <GlobeLoader />
        </div>
      )}

      {/* Three.js Canvas — skipped when WebGL is unavailable (headless browsers, CI) */}
      {!hasWebGL ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30" />
        </div>
      ) : null}
      {hasWebGL && <Canvas className="w-full h-full bg-transparent">
        {/* Camera */}
        <PerspectiveCamera
          makeDefault
          position={[0, 0, 10]}
          fov={50}
          near={0.1}
          far={1000}
        />

        {/* Lighting — hemisphere for soft fill, directional for depth */}
        <ambientLight intensity={0.25} />
        <hemisphereLight args={["#1a90ff", "#0a0f1c", 0.35]} />
        <directionalLight position={[5, 8, 5]} intensity={0.7} color="#e0eaff" />
        <pointLight position={[-8, -4, -6]} intensity={0.3} color="#6236FF" />

        {/* Controls - allow full 360-degree rotation */}
        {enableControls && (
          <OrbitControls
            enableZoom={false} // Disable zoom as requested
            enablePan={enablePan}
            enableRotate={true}
            autoRotate={autoRotate}
            autoRotateSpeed={0.3} // Reduced from 1.0 to 0.3 to match slower globe rotation
            maxPolarAngle={Math.PI * 0.8} // Allow more vertical rotation
            minPolarAngle={Math.PI * 0.2} // Allow more vertical rotation
            // Remove azimuth limits for full 360-degree horizontal rotation
            maxAzimuthAngle={Infinity}
            minAzimuthAngle={-Infinity}
          />
        )}

        {/* Globe Animation */}
        <Suspense fallback={null}>
          <NetworkGlobe isLoaded={isLoaded} />
        </Suspense>
      </Canvas>}
    </div>
  )
}

export default GlobeAnimation
