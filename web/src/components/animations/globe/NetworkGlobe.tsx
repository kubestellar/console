import { useRef, useMemo, useState, useEffect } from "react"
import { useFrame } from "@react-three/fiber"
import { Sphere, Line, Text, Torus, Billboard } from "@react-three/drei"
// NOTE: Wildcard import is required for React Three Fiber (R3F) type support
// R3F uses THREE namespace for type annotations and JSX intrinsic elements
import * as THREE from "three"
import { COLORS } from "./colors"
import DataPacket from "./DataPacket"
import LogoElement from "./LogoElement"
import Cluster from "./Cluster"

// Hardcoded translations (originally from next-intl)
const translations = {
  kubestellar: "Console",
  controlPlane: "AI Engine",
  clusters: {
    kubeflexCore: {
      name: "Development Clusters",
      description: "Development clusters for building and iterating on workloads",
    },
    edgeClusters: {
      name: "Edge Clusters",
      description: "Edge computing clusters for distributed workloads",
    },
    productionCluster: {
      name: "Production Clusters",
      description: "Production workloads and mission-critical applications",
    },
    devTestCluster: {
      name: "Test Clusters",
      description: "Test clusters for validation and QA environments",
    },
    multiCloudHub: {
      name: "Multi-Cloud Hub",
      description: "Cross-cloud orchestration and management",
    },
  },
}

// Add this interface for the component props
interface NetworkGlobeProps {
  isLoaded?: boolean
}

// Define interfaces for better type safety
interface FlowMaterial extends THREE.Material {
  opacity: number
  color: THREE.Color
  dashSize?: number
  gapSize?: number
}

interface FlowChild extends THREE.Object3D {
  material?: FlowMaterial
}

interface CentralNodeChild extends THREE.Object3D {
  material?: THREE.Material & { opacity?: number }
}

// Update the main component to accept props
const NetworkGlobe = ({ isLoaded = true }: NetworkGlobeProps) => {
  const globeRef = useRef<THREE.Mesh>(null)
  const gridLinesRef = useRef<THREE.Group>(null)
  const centralNodeRef = useRef<THREE.Group>(null)
  const dataFlowsRef = useRef<THREE.Group>(null)
  const rotatingContentRef = useRef<THREE.Group>(null)

  // Animation state for data flows
  const [activeFlows, setActiveFlows] = useState<number[]>([])
  const [animationProgress, setAnimationProgress] = useState(0)

  // Create cluster configurations with Console-related names and descriptions
  const clusters = useMemo(
    () => [
      {
        name: translations.clusters.kubeflexCore.name,
        position: [0, 3, 0] as [number, number, number],
        nodeCount: 6,
        radius: 0.8,
        color: COLORS.primary,
        description: translations.clusters.kubeflexCore.description,
      },
      {
        name: translations.clusters.edgeClusters.name,
        position: [3, 0, 0] as [number, number, number],
        nodeCount: 8,
        radius: 1,
        color: COLORS.highlight,
        description: translations.clusters.edgeClusters.description,
      },
      {
        name: translations.clusters.productionCluster.name,
        position: [0, -3, 0] as [number, number, number],
        nodeCount: 5,
        radius: 0.7,
        color: COLORS.success,
        description: translations.clusters.productionCluster.description,
      },
      {
        name: translations.clusters.devTestCluster.name,
        position: [-3, 0, 0] as [number, number, number],
        nodeCount: 7,
        radius: 0.9,
        color: COLORS.accent2,
        description: translations.clusters.devTestCluster.description,
      },
      {
        name: translations.clusters.multiCloudHub.name,
        position: [2, 2, -2] as [number, number, number],
        nodeCount: 4,
        radius: 0.6,
        color: COLORS.accent1,
        description: translations.clusters.multiCloudHub.description,
      },
    ],
    []
  )

  // Generate data flow paths
  const dataFlows = useMemo(() => {
    const flows: {
      path: [number, number, number][]
      id: number
      type: string
    }[] = []
    const centralPos: [number, number, number] = [0, 0, 0]

    // Connect central node to each cluster
    clusters.forEach((cluster, clusterIdx) => {
      flows.push({
        path: [centralPos, cluster.position],
        id: clusterIdx,
        type: "control",
      })
    })

    // Add some cross-cluster connections with specific types
    // Production to Edge (workload distribution)
    flows.push({
      path: [clusters[2].position, clusters[1].position],
      id: clusters.length + 1,
      type: "workload",
    })

    // Development to Edge (control commands)
    flows.push({
      path: [clusters[0].position, clusters[1].position],
      id: clusters.length + 2,
      type: "control",
    })

    // Test to Production (deployment pipeline)
    flows.push({
      path: [clusters[3].position, clusters[2].position],
      id: clusters.length + 3,
      type: "deploy",
    })

    // Add some other cross-cluster connections
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (Math.random() > 0.7) {
          flows.push({
            path: [clusters[i].position, clusters[j].position],
            id: clusters.length + i * 10 + j,
            type: "data",
          })
        }
      }
    }

    return flows
  }, [clusters])

  // Animate data flows - only start when loaded
  useEffect(() => {
    if (!isLoaded) return

    const interval = setInterval(() => {
      const randomFlows = Array.from(
        { length: Math.floor(dataFlows.length / 2) },
        () => Math.floor(Math.random() * dataFlows.length)
      )
      setActiveFlows(randomFlows)
    }, 4000)

    return () => clearInterval(interval)
  }, [dataFlows.length, isLoaded])

  // Animation frame updates with progressive reveal
  useFrame(state => {
    const time = state.clock.getElapsedTime()

    // Update animation progress for reveal effect
    if (isLoaded && animationProgress < 1) {
      setAnimationProgress(Math.min(animationProgress + 0.01, 1))
    }

    // Rotate the globe and grid lines together with slower speed to match clusters
    if (globeRef.current) {
      // Slower Y-axis rotation to match cluster speed
      globeRef.current.rotation.y = time * 0.1 // Reduced from 0.3 to 0.1

      // Subtle X-axis tilt for dynamic movement
      globeRef.current.rotation.x = Math.sin(time * 0.15) * 0.08 // Reduced speed and amplitude

      // Optional: Add slight Z-axis rotation for even more dynamic movement
      globeRef.current.rotation.z = Math.cos(time * 0.08) * 0.03 // Reduced speed and amplitude

      // Fixed scale - no zoom effect
      const scale = isLoaded ? 1 * animationProgress : 0.5
      globeRef.current.scale.setScalar(scale)
    }

    // Rotate grid lines to match globe rotation with same slow speed
    if (gridLinesRef.current) {
      gridLinesRef.current.rotation.y = time * 0.1 // Match globe speed
      gridLinesRef.current.rotation.x = Math.sin(time * 0.15) * 0.08
      gridLinesRef.current.rotation.z = Math.cos(time * 0.08) * 0.03
    }

    // Rotate clusters and data flows to match globe rotation
    if (rotatingContentRef.current) {
      rotatingContentRef.current.rotation.y = time * 0.1 // Match globe speed
      rotatingContentRef.current.rotation.x = Math.sin(time * 0.15) * 0.08
      rotatingContentRef.current.rotation.z = Math.cos(time * 0.08) * 0.03
    }

    // Animate central node with slower rotation to match globe
    if (centralNodeRef.current) {
      centralNodeRef.current.rotation.y = time * 0.15 // Reduced from 0.4 to 0.15
      centralNodeRef.current.rotation.x = Math.sin(time * 0.2) * 0.05 // Reduced amplitude
      centralNodeRef.current.scale.setScalar(
        (1 + Math.sin(time * 1.5) * 0.05) * animationProgress
      ) // Reduced from 0.08 to 0.05

      // Fade in the central node
      centralNodeRef.current.children.forEach((child: CentralNodeChild) => {
        if (child.material && typeof child.material.opacity !== "undefined") {
          child.material.opacity = Math.min(
            child.material.opacity + 0.01,
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
              flow.material.opacity + 0.03,
              0.7 * animationProgress
            )

            // Set color based on flow type
            if (flowType === "workload") {
              flow.material.color.set(COLORS.success)
            } else if (flowType === "deploy") {
              flow.material.color.set(COLORS.accent1)
            } else if (flowType === "control") {
              flow.material.color.set(COLORS.secondary)
            } else {
              flow.material.color.set(COLORS.highlight)
            }

            if (flow.material.dashSize !== undefined) {
              flow.material.dashSize = 0.15
            }
            if (flow.material.gapSize !== undefined) {
              flow.material.gapSize = 0.05
            }
          } else {
            // Smooth fade out
            flow.material.opacity = Math.max(
              flow.material.opacity - 0.01,
              0.06 * animationProgress
            )
            flow.material.color.set(COLORS.primary)

            if (flow.material.dashSize !== undefined) {
              flow.material.dashSize = 0.05
            }
            if (flow.material.gapSize !== undefined) {
              flow.material.gapSize = 0.12
            }
          }
        }
      })
    }
  })

  return (
    <group>
      {/* Main globe — finer wireframe for a cleaner look */}
      <Sphere ref={globeRef} args={[3.5, 48, 48]}>
        <meshPhongMaterial
          color={COLORS.primary}
          transparent
          opacity={0.08 * animationProgress}
          wireframe
        />
      </Sphere>

      {/* Grid lines — fewer rings, thinner, softer for less visual clutter */}
      <group ref={gridLinesRef} rotation={[0, 0, 0]}>
        {Array.from({ length: 5 }).map((_, idx) => (
          <Torus
            key={idx}
            args={[3.5, 0.005, 16, 120]}
            rotation={[0, 0, (Math.PI * idx) / 5]}
          >
            <meshBasicMaterial
              color={COLORS.primary}
              transparent
              opacity={0.12 * animationProgress}
            />
          </Torus>
        ))}
        {Array.from({ length: 5 }).map((_, idx) => (
          <Torus
            key={idx + 5}
            args={[3.5, 0.005, 16, 120]}
            rotation={[Math.PI / 2, (Math.PI * idx) / 5, 0]}
          >
            <meshBasicMaterial
              color={COLORS.primary}
              transparent
              opacity={0.12 * animationProgress}
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
            {translations.kubestellar}
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
            {translations.controlPlane}
          </Text>
        </Billboard>
      </group>

      <group ref={rotatingContentRef}>
        {/* Clusters with staggered appearance */}
        {clusters.map((cluster, idx) => (
          <group
            key={idx}
            scale={animationProgress > idx * 0.15 ? animationProgress : 0}
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
                color={
                  isActive
                    ? flow.type === "workload"
                      ? COLORS.success
                      : flow.type === "deploy"
                        ? COLORS.accent1
                        : flow.type === "control"
                          ? COLORS.secondary
                          : COLORS.highlight
                    : COLORS.primary
                }
                lineWidth={isActive ? 2 : 0.8}
                transparent
                opacity={
                  (isActive ? 0.7 : 0.06) * animationProgress
                }
                dashed
                dashSize={isActive ? 0.15 : 0.05}
                gapSize={isActive ? 0.05 : 0.12}
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
                  speed={1 + Math.random()}
                  color={
                    flow.type === "workload"
                      ? COLORS.success
                      : flow.type === "deploy"
                        ? COLORS.accent1
                        : flow.type === "control"
                          ? COLORS.secondary
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
