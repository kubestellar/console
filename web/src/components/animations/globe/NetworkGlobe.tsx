import { useRef, useMemo, useState, useEffect } from "react"
import { useFrame } from "@react-three/fiber"
import { Sphere, Line, Text, Torus, Billboard } from "@react-three/drei"
import { Mesh, Group, Material, Color, Object3D } from "three"
import { COLORS } from "./colors"
import DataPacket from "./DataPacket"
import LogoElement from "./LogoElement"
import Cluster from "./Cluster"
import {
  NETWORK_GLOBE_TRANSLATIONS,
  GLOBE_RADIUS,
  GLOBE_SPHERE_SEGMENTS,
  GLOBE_WIREFRAME_OPACITY,
  GRID_RING_COUNT,
  GRID_TUBE_RADIUS,
  GRID_TUBULAR_SEGMENTS,
  GRID_RADIAL_SEGMENTS,
  GRID_LINE_OPACITY,
  GLOBE_ROTATION_Y_SPEED,
  GLOBE_TILT_X_SPEED,
  GLOBE_TILT_X_AMPLITUDE,
  GLOBE_TILT_Z_SPEED,
  GLOBE_TILT_Z_AMPLITUDE,
  ANIMATION_PROGRESS_STEP,
  CENTRAL_NODE_ROTATION_Y_SPEED,
  CENTRAL_NODE_TILT_X_SPEED,
  CENTRAL_NODE_TILT_X_AMPLITUDE,
  CENTRAL_NODE_PULSE_SPEED,
  CENTRAL_NODE_PULSE_AMPLITUDE,
  CENTRAL_NODE_FADE_STEP,
  DATA_FLOW_INTERVAL_MS,
  FLOW_FADE_IN_STEP,
  FLOW_ACTIVE_MAX_OPACITY,
  FLOW_FADE_OUT_STEP,
  FLOW_IDLE_MIN_OPACITY,
  FLOW_ACTIVE_DASH_SIZE,
  FLOW_ACTIVE_GAP_SIZE,
  FLOW_IDLE_DASH_SIZE,
  FLOW_IDLE_GAP_SIZE,
  FLOW_ACTIVE_LINE_WIDTH,
  FLOW_IDLE_LINE_WIDTH,
  CLUSTER_REVEAL_STAGGER,
  DATA_PACKET_MIN_SPEED,
  buildClusters,
  buildDataFlows,
  flowColor,
} from "./NetworkGlobe.geometry"

// Add this interface for the component props
interface NetworkGlobeProps {
  isLoaded?: boolean
}

// Define interfaces for better type safety
interface FlowMaterial extends Material {
  opacity: number
  color: Color
  dashSize?: number
  gapSize?: number
}

interface FlowChild extends Object3D {
  material?: FlowMaterial
}

interface CentralNodeChild extends Object3D {
  material?: Material & { opacity?: number }
}

// Update the main component to accept props
const NetworkGlobe = ({ isLoaded = true }: NetworkGlobeProps) => {
  const globeRef = useRef<Mesh>(null)
  const gridLinesRef = useRef<Group>(null)
  const centralNodeRef = useRef<Group>(null)
  const dataFlowsRef = useRef<Group>(null)
  const rotatingContentRef = useRef<Group>(null)

  // Animation state for data flows
  const [activeFlows, setActiveFlows] = useState<number[]>([])
  const [animationProgress, setAnimationProgress] = useState(0)

  // Create cluster configurations with Console-related names and descriptions
  const clusters = useMemo(() => buildClusters(), [])

  // Generate data flow paths
  const dataFlows = useMemo(() => buildDataFlows(clusters), [clusters])

  // Animate data flows - only start when loaded
  useEffect(() => {
    if (!isLoaded) return

    const interval = setInterval(() => {
      const randomFlows = Array.from(
        { length: Math.floor(dataFlows.length / 2) },
        () => Math.floor(Math.random() * dataFlows.length)
      )
      setActiveFlows(randomFlows)
    }, DATA_FLOW_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [dataFlows.length, isLoaded])

  // Animation frame updates with progressive reveal
  useFrame(state => {
    const time = state.clock.getElapsedTime()

    // Update animation progress for reveal effect
    if (isLoaded && animationProgress < 1) {
      setAnimationProgress(Math.min(animationProgress + ANIMATION_PROGRESS_STEP, 1))
    }

    // Rotate the globe and grid lines together with slower speed to match clusters
    if (globeRef.current) {
      globeRef.current.rotation.y = time * GLOBE_ROTATION_Y_SPEED
      globeRef.current.rotation.x = Math.sin(time * GLOBE_TILT_X_SPEED) * GLOBE_TILT_X_AMPLITUDE
      globeRef.current.rotation.z = Math.cos(time * GLOBE_TILT_Z_SPEED) * GLOBE_TILT_Z_AMPLITUDE

      // Fixed scale - no zoom effect
      const scale = isLoaded ? 1 * animationProgress : 0.5
      globeRef.current.scale.setScalar(scale)
    }

    // Rotate grid lines to match globe rotation with same slow speed
    if (gridLinesRef.current) {
      gridLinesRef.current.rotation.y = time * GLOBE_ROTATION_Y_SPEED
      gridLinesRef.current.rotation.x = Math.sin(time * GLOBE_TILT_X_SPEED) * GLOBE_TILT_X_AMPLITUDE
      gridLinesRef.current.rotation.z = Math.cos(time * GLOBE_TILT_Z_SPEED) * GLOBE_TILT_Z_AMPLITUDE
    }

    // Rotate clusters and data flows to match globe rotation
    if (rotatingContentRef.current) {
      rotatingContentRef.current.rotation.y = time * GLOBE_ROTATION_Y_SPEED
      rotatingContentRef.current.rotation.x = Math.sin(time * GLOBE_TILT_X_SPEED) * GLOBE_TILT_X_AMPLITUDE
      rotatingContentRef.current.rotation.z = Math.cos(time * GLOBE_TILT_Z_SPEED) * GLOBE_TILT_Z_AMPLITUDE
    }

    // Animate central node with slower rotation to match globe
    if (centralNodeRef.current) {
      centralNodeRef.current.rotation.y = time * CENTRAL_NODE_ROTATION_Y_SPEED
      centralNodeRef.current.rotation.x = Math.sin(time * CENTRAL_NODE_TILT_X_SPEED) * CENTRAL_NODE_TILT_X_AMPLITUDE
      centralNodeRef.current.scale.setScalar(
        (1 + Math.sin(time * CENTRAL_NODE_PULSE_SPEED) * CENTRAL_NODE_PULSE_AMPLITUDE) * animationProgress
      )

      // Fade in the central node
      centralNodeRef.current.children.forEach((child: CentralNodeChild) => {
        if (child.material && typeof child.material.opacity !== "undefined") {
          child.material.opacity = Math.min(
            child.material.opacity + CENTRAL_NODE_FADE_STEP,
            animationProgress
          )
        }
      })
    }

    // Animate data flows
    if (dataFlowsRef.current) {
      dataFlowsRef.current.children.forEach((flow: FlowChild, i) => {
        if (flow.material) {
          const flowData = dataFlows[i]
          const flowType = flowData?.type || "data"

          if (activeFlows.includes(i)) {
            // Smooth fade in
            flow.material.opacity = Math.min(
              flow.material.opacity + FLOW_FADE_IN_STEP,
              FLOW_ACTIVE_MAX_OPACITY * animationProgress
            )
            flow.material.color.set(flowColor(flowType, true))

            if (flow.material.dashSize !== undefined) {
              flow.material.dashSize = FLOW_ACTIVE_DASH_SIZE
            }
            if (flow.material.gapSize !== undefined) {
              flow.material.gapSize = FLOW_ACTIVE_GAP_SIZE
            }
          } else {
            // Smooth fade out
            flow.material.opacity = Math.max(
              flow.material.opacity - FLOW_FADE_OUT_STEP,
              FLOW_IDLE_MIN_OPACITY * animationProgress
            )
            flow.material.color.set(flowColor(flowType, false))

            if (flow.material.dashSize !== undefined) {
              flow.material.dashSize = FLOW_IDLE_DASH_SIZE
            }
            if (flow.material.gapSize !== undefined) {
              flow.material.gapSize = FLOW_IDLE_GAP_SIZE
            }
          }
        }
      })
    }
  })

  return (
    <group>
      {/* Main globe — finer wireframe for a cleaner look */}
      <Sphere ref={globeRef} args={[GLOBE_RADIUS, GLOBE_SPHERE_SEGMENTS, GLOBE_SPHERE_SEGMENTS]}>
        <meshPhongMaterial
          color={COLORS.primary}
          transparent
          opacity={GLOBE_WIREFRAME_OPACITY * animationProgress}
          wireframe
        />
      </Sphere>

      {/* Grid lines — fewer rings, thinner, softer for less visual clutter */}
      <group ref={gridLinesRef} rotation={[0, 0, 0]}>
        {Array.from({ length: GRID_RING_COUNT }).map((_, idx) => (
          <Torus
            key={idx}
            args={[GLOBE_RADIUS, GRID_TUBE_RADIUS, GRID_TUBULAR_SEGMENTS, GRID_RADIAL_SEGMENTS]}
            rotation={[0, 0, (Math.PI * idx) / GRID_RING_COUNT]}
          >
            <meshBasicMaterial
              color={COLORS.primary}
              transparent
              opacity={GRID_LINE_OPACITY * animationProgress}
            />
          </Torus>
        ))}
        {Array.from({ length: GRID_RING_COUNT }).map((_, idx) => (
          <Torus
            key={idx + GRID_RING_COUNT}
            args={[GLOBE_RADIUS, GRID_TUBE_RADIUS, GRID_TUBULAR_SEGMENTS, GRID_RADIAL_SEGMENTS]}
            rotation={[Math.PI / 2, (Math.PI * idx) / GRID_RING_COUNT, 0]}
          >
            <meshBasicMaterial
              color={COLORS.primary}
              transparent
              opacity={GRID_LINE_OPACITY * animationProgress}
            />
          </Torus>
        ))}
      </group>

      {/* Central Console AI engine */}
      <group ref={centralNodeRef}>
        <LogoElement position={[0, 0, 0]} rotation={[0, 0, 0]} scale={1} />

        <Billboard position={[0, 1.1, 0]}>
          <Text
            fontSize={0.24}
            color={COLORS.highlight}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.015}
            outlineColor={COLORS.background}
            fillOpacity={animationProgress}
            font={undefined}
          >
            {NETWORK_GLOBE_TRANSLATIONS.kubestellar}
          </Text>
          <Text
            position={[0, -0.28, 0]}
            fontSize={0.1}
            color="#8ab4f8"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.005}
            outlineColor={COLORS.background}
            fillOpacity={animationProgress * 0.8}
          >
            {NETWORK_GLOBE_TRANSLATIONS.controlPlane}
          </Text>
        </Billboard>
      </group>

      <group ref={rotatingContentRef}>
        {/* Clusters with staggered appearance */}
        {clusters.map((cluster, idx) => (
          <group
            key={idx}
            scale={animationProgress > idx * CLUSTER_REVEAL_STAGGER ? animationProgress : 0}
            position={[
              cluster.position[0] * animationProgress,
              cluster.position[1] * animationProgress,
              cluster.position[2] * animationProgress,
            ]}
          >
            <Cluster
              position={[0, 0, 0]}
              name={cluster.name}
              nodeCount={cluster.nodeCount}
              radius={cluster.radius}
              color={cluster.color}
              description={cluster.description}
            />
          </group>
        ))}

        {/* Data flow connections — thinner idle, bolder active */}
        <group ref={dataFlowsRef}>
          {dataFlows.map((flow, idx) => {
            const isActive = activeFlows.includes(idx)
            return (
              <Line
                key={idx}
                points={flow.path}
                color={flowColor(flow.type, isActive)}
                lineWidth={isActive ? FLOW_ACTIVE_LINE_WIDTH : FLOW_IDLE_LINE_WIDTH}
                transparent
                opacity={(isActive ? FLOW_ACTIVE_MAX_OPACITY : FLOW_IDLE_MIN_OPACITY) * animationProgress}
                dashed
                dashSize={isActive ? FLOW_ACTIVE_DASH_SIZE : FLOW_IDLE_DASH_SIZE}
                gapSize={isActive ? FLOW_ACTIVE_GAP_SIZE : FLOW_IDLE_GAP_SIZE}
              />
            )
          })}
        </group>

        {/* Data packets traveling along active connections */}
        {isLoaded &&
          animationProgress > 0.7 &&
          dataFlows.map(
            (flow, idx) =>
              activeFlows.includes(idx) && (
                <DataPacket
                  key={idx}
                  path={flow.path}
                  speed={DATA_PACKET_MIN_SPEED + Math.random()}
                  color={
                    flow.type === "workload" || flow.type === "deploy" || flow.type === "control"
                      ? flowColor(flow.type, true)
                      : idx % 2 === 0
                        ? COLORS.highlight
                        : COLORS.primary
                  }
                />
              )
          )}
      </group>
    </group>
  )
}

export default NetworkGlobe
