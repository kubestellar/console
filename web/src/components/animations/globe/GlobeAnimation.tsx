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

/** Delay between WebGL context acquisition retries in milliseconds.
 *  In containerized production environments the GPU rendering context
 *  can be momentarily unavailable while the page is hydrating and
 *  lazy chunks are still resolving, so we poll for a short window
 *  before giving up and showing the static fallback. */
const WEBGL_RETRY_INTERVAL_MS = 100

/** Maximum number of WebGL detection attempts before falling back.
 *  WEBGL_RETRY_INTERVAL_MS * WEBGL_MAX_RETRIES = total wait window. */
const WEBGL_MAX_RETRIES = 20

/** WebGL detection result. */
type WebGLState = "checking" | "available" | "unavailable"

/** Check if WebGL is available — returns false in headless browsers and CI.
 *  We intentionally do NOT use `instanceof WebGLRenderingContext` because in
 *  some containerized/SSR-hydrated environments the global constructor is
 *  briefly undefined or comes from a different realm than the context object,
 *  which causes the check to return false even when WebGL is functional. */
function isWebGLAvailable(): boolean {
  try {
    if (typeof document === "undefined") return false
    const canvas = document.createElement("canvas")
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    return gl !== null && typeof gl === "object"
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
  const [webGLState, setWebGLState] = useState<WebGLState>("checking")

  // Poll for WebGL availability after mount. Retries handle the production
  // race where the canvas/GPU context is not ready on the first tick after
  // hydration in containerized deployments.
  useEffect(() => {
    let attempts = 0
    let cancelled = false

    const check = () => {
      if (cancelled) return
      if (isWebGLAvailable()) {
        setWebGLState("available")
        return
      }
      attempts += 1
      if (attempts >= WEBGL_MAX_RETRIES) {
        setWebGLState("unavailable")
        return
      }
      window.setTimeout(check, WEBGL_RETRY_INTERVAL_MS)
    }

    check()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (webGLState !== "available") return
    // Simulate loading delay to show progressive animation
    const timer = setTimeout(() => {
      setIsLoaded(true)
    }, GLOBE_LOAD_DELAY_MS)

    return () => clearTimeout(timer)
  }, [webGLState])

  const hasWebGL = webGLState === "available"
  const webGLFailed = webGLState === "unavailable"
  // Hide the loader once the globe is loaded OR once we've decided to show
  // the static fallback — otherwise the spinner sits forever on top of the
  // gradient fallback circle in production.
  const showLoaderNow = showLoader && !isLoaded && !webGLFailed

  return (
    <div
      className={`relative ${className}`}
      style={{ width, height, ...style }}
    >
      {/* Loader */}
      {showLoaderNow && (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent z-10">
          <GlobeLoader />
        </div>
      )}

      {/* Static fallback — shown whenever WebGL is unavailable after retries
          (headless browsers, CI, GPU-less containers, denied contexts). */}
      {webGLFailed ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          data-testid="globe-fallback"
        >
          <div className="w-32 h-32 rounded-full bg-linear-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30" />
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
