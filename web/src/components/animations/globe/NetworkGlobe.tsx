import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, Line, Text, Torus, Billboard } from '@react-three/drei'
import { Mesh, Group, Material, Color, Object3D } from 'three'
import { COLORS } from './colors'
import DataPacket from './DataPacket'
import LogoElement from './LogoElement'
import Cluster from './Cluster'
import {
  GLOBE_RADIUS,
  GLOBE_SEGMENTS,
  GRID_LINE_THICKNESS,
  GRID_LINE_SEGMENTS,
  GRID_LINE_RADIAL_SEGMENTS,
  GRID_RINGS_COUNT,
  GLOBE_ROTATION_SPEED,
  GLOBE_TILT_SPEED,
  GLOBE_TILT_AMPLITUDE,
  GLOBE_Z_ROTATION_SPEED,
  GLOBE_Z_ROTATION_AMPLITUDE,
  CENTRAL_NODE_ROTATION_SPEED,
  CENTRAL_NODE_TILT_SPEED,
  CENTRAL_NODE_TILT_AMPLITUDE,
  CENTRAL_NODE_PULSE_SPEED,
  CENTRAL_NODE_PULSE_AMPLITUDE,
  GLOBE_WIREFRAME_OPACITY,
  GRID_LINE_OPACITY,
  FLOW_ACTIVE_OPACITY,
  FLOW_INACTIVE_OPACITY,
  TEXT_SUBTITLE_OPACITY_MULTIPLIER,
  ANIMATION_INCREMENT,
  OPACITY_INCREMENT_FAST,
  OPACITY_INCREMENT_SLOW,
  DATA_PACKET_THRESHOLD,
  DATA_FLOW_INTERVAL_MS,
  ACTIVE_FLOW_LINE_WIDTH,
  INACTIVE_FLOW_LINE_WIDTH,
  ACTIVE_DASH_SIZE,
  ACTIVE_GAP_SIZE,
  INACTIVE_DASH_SIZE,
  INACTIVE_GAP_SIZE,
  TITLE_FONT_SIZE,
  TITLE_OUTLINE_WIDTH,
  SUBTITLE_FONT_SIZE,
  SUBTITLE_OUTLINE_WIDTH,
  SUBTITLE_Y_OFFSET,
  BILLBOARD_Y_OFFSET,
  CLUSTER_STAGGER_FACTOR,
  translations,
  DEFAULT_CLUSTERS,
  buildDataFlows,
  getFlowColor,
  type ClusterConfig,
  type DataFlow,
} from './NetworkGlobe.geometry'

interface NetworkGlobeProps {
  isLoaded?: boolean
}

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

const NetworkGlobe = ({ isLoaded = true }: NetworkGlobeProps) => {
  const globeRef = useRef<Mesh>(null)
  const gridLinesRef = useRef<Group>(null)
  const centralNodeRef = useRef<Group>(null)
  const dataFlowsRef = useRef<Group>(null)
  const rotatingContentRef = useRef<Group>(null)

  const [activeFlows, setActiveFlows] = useState<number[]>([])
  const [animationProgress, setAnimationProgress] = useState(0)

  const clusters: ClusterConfig[] = useMemo(() => DEFAULT_CLUSTERS, [])

  const dataFlows: DataFlow[] = useMemo(() => buildDataFlows(clusters), [clusters])

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
      setAnimationProgress(Math.min(animationProgress + ANIMATION_INCREMENT, 1))
    }

    // Rotate the globe and grid lines together with slower speed to match clusters
    if (globeRef.current) {
      globeRef.current.rotation.y = time * GLOBE_ROTATION_SPEED
      globeRef.current.rotation.x = Math.sin(time * GLOBE_TILT_SPEED) * GLOBE_TILT_AMPLITUDE
      globeRef.current.rotation.z = Math.cos(time * GLOBE_Z_ROTATION_SPEED) * GLOBE_Z_ROTATION_AMPLITUDE

      const INITIAL_SCALE = 0.5
      const scale = isLoaded ? 1 * animationProgress : INITIAL_SCALE
      globeRef.current.scale.setScalar(scale)
    }

    // Rotate grid lines to match globe rotation
    if (gridLinesRef.current) {
      gridLinesRef.current.rotation.y = time * GLOBE_ROTATION_SPEED
      gridLinesRef.current.rotation.x = Math.sin(time * GLOBE_TILT_SPEED) * GLOBE_TILT_AMPLITUDE
      gridLinesRef.current.rotation.z = Math.cos(time * GLOBE_Z_ROTATION_SPEED) * GLOBE_Z_ROTATION_AMPLITUDE
    }

    // Rotate clusters and data flows to match globe rotation
    if (rotatingContentRef.current) {
      rotatingContentRef.current.rotation.y = time * GLOBE_ROTATION_SPEED
      rotatingContentRef.current.rotation.x = Math.sin(time * GLOBE_TILT_SPEED) * GLOBE_TILT_AMPLITUDE
      rotatingContentRef.current.rotation.z = Math.cos(time * GLOBE_Z_ROTATION_SPEED) * GLOBE_Z_ROTATION_AMPLITUDE
    }

    // Animate central node with slower rotation to match globe
    if (centralNodeRef.current) {
      centralNodeRef.current.rotation.y = time * CENTRAL_NODE_ROTATION_SPEED
      centralNodeRef.current.rotation.x = Math.sin(time * CENTRAL_NODE_TILT_SPEED) * CENTRAL_NODE_TILT_AMPLITUDE
      centralNodeRef.current.scale.setScalar(
        (1 + Math.sin(time * CENTRAL_NODE_PULSE_SPEED) * CENTRAL_NODE_PULSE_AMPLITUDE) * animationProgress
      )

      // Fade in the central node
      centralNodeRef.current.children.forEach((child: CentralNodeChild) => {
        if (child.material && typeof child.material.opacity !== 'undefined') {
          child.material.opacity = Math.min(
            child.material.opacity + OPACITY_INCREMENT_SLOW,
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
          const flowType = flowData?.type || 'data'

          if (activeFlows.includes(i)) {
            flow.material.opacity = Math.min(
              flow.material.opacity + OPACITY_INCREMENT_FAST,
              FLOW_ACTIVE_OPACITY * animationProgress
            )

            flow.material.color.set(getFlowColor(flowType, true))

            if (flow.material.dashSize !== undefined) {
              flow.material.dashSize = ACTIVE_DASH_SIZE
            }
            if (flow.material.gapSize !== undefined) {
              flow.material.gapSize = ACTIVE_GAP_SIZE
            }
          } else {
            flow.material.opacity = Math.max(
              flow.material.opacity - OPACITY_INCREMENT_SLOW,
              FLOW_INACTIVE_OPACITY * animationProgress
            )
            flow.material.color.set(COLORS.primary)

            if (flow.material.dashSize !== undefined) {
              flow.material.dashSize = INACTIVE_DASH_SIZE
            }
            if (flow.material.gapSize !== undefined) {
              flow.material.gapSize = INACTIVE_GAP_SIZE
            }
          }
        }
      })
    }
  })

  return (
    <group>
      {/* Main globe — finer wireframe for a cleaner look */}
      <Sphere ref={globeRef} args={[GLOBE_RADIUS, GLOBE_SEGMENTS, GLOBE_SEGMENTS]}>
        <meshPhongMaterial
          color={COLORS.primary}
          transparent
          opacity={GLOBE_WIREFRAME_OPACITY * animationProgress}
          wireframe
        />
      </Sphere>

      {/* Grid lines — fewer rings, thinner, softer for less visual clutter */}
      <group ref={gridLinesRef} rotation={[0, 0, 0]}>
        {Array.from({ length: GRID_RINGS_COUNT }).map((_, idx) => (
          <Torus
            key={idx}
            args={[GLOBE_RADIUS, GRID_LINE_THICKNESS, GRID_LINE_SEGMENTS, GRID_LINE_RADIAL_SEGMENTS]}
            rotation={[0, 0, (Math.PI * idx) / GRID_RINGS_COUNT]}
          >
            <meshBasicMaterial
              color={COLORS.primary}
              transparent
              opacity={GRID_LINE_OPACITY * animationProgress}
            />
          </Torus>
        ))}
        {Array.from({ length: GRID_RINGS_COUNT }).map((_, idx) => (
          <Torus
            key={idx + GRID_RINGS_COUNT}
            args={[GLOBE_RADIUS, GRID_LINE_THICKNESS, GRID_LINE_SEGMENTS, GRID_LINE_RADIAL_SEGMENTS]}
            rotation={[Math.PI / 2, (Math.PI * idx) / GRID_RINGS_COUNT, 0]}
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

        <Billboard position={[0, BILLBOARD_Y_OFFSET, 0]}>
          <Text
            fontSize={TITLE_FONT_SIZE}
            color={COLORS.highlight}
            anchorX="center"
            anchorY="middle"
            outlineWidth={TITLE_OUTLINE_WIDTH}
            outlineColor={COLORS.background}
            fillOpacity={animationProgress}
            font={undefined}
          >
            {translations.kubestellar}
          </Text>
          <Text
            position={[0, SUBTITLE_Y_OFFSET, 0]}
            fontSize={SUBTITLE_FONT_SIZE}
            color="#8ab4f8"
            anchorX="center"
            anchorY="middle"
            outlineWidth={SUBTITLE_OUTLINE_WIDTH}
            outlineColor={COLORS.background}
            fillOpacity={animationProgress * TEXT_SUBTITLE_OPACITY_MULTIPLIER}
          >
            {translations.controlPlane}
          </Text>
        </Billboard>
      </group>

      <group ref={rotatingContentRef}>
        {/* Clusters with staggered appearance */}
        {clusters.map((cluster, idx) => (
          <group
            key={idx}
            scale={animationProgress > idx * CLUSTER_STAGGER_FACTOR ? animationProgress : 0}
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
                color={getFlowColor(flow.type, isActive)}
                lineWidth={isActive ? ACTIVE_FLOW_LINE_WIDTH : INACTIVE_FLOW_LINE_WIDTH}
                transparent
                opacity={(isActive ? FLOW_ACTIVE_OPACITY : FLOW_INACTIVE_OPACITY) * animationProgress}
                dashed
                dashSize={isActive ? ACTIVE_DASH_SIZE : INACTIVE_DASH_SIZE}
                gapSize={isActive ? ACTIVE_GAP_SIZE : INACTIVE_GAP_SIZE}
              />
            )
          })}
        </group>

        {/* Data packets traveling along active connections */}
        {isLoaded &&
          animationProgress > DATA_PACKET_THRESHOLD &&
          dataFlows.map(
            (flow, idx) =>
              activeFlows.includes(idx) && (
                <DataPacket
                  key={idx}
                  path={flow.path}
                  speed={1 + Math.random()}
                  color={getFlowColor(flow.type, true)}
                />
              )
          )}
      </group>
    </group>
  )
}

export default NetworkGlobe
