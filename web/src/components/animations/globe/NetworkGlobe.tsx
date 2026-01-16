import { useRef, useMemo, useState, useEffect } from "react"
import { useFrame } from "@react-three/fiber"
import { Sphere, Line, Text, Torus, Billboard } from "@react-three/drei"
import * as THREE from "three"
import { COLORS } from "./colors"
import DataPacket from "./DataPacket"
import LogoElement from "./LogoElement"
import Cluster from "./Cluster"

const translations = {
  kubestellar: "KubeStellar",
  controlPlane: "Control Plane",
  clusters: {
    kubeflexCore: { name: "KubeFlex Core", description: "KubeFlex control plane managing multi-cluster operations" },
    edgeClusters: { name: "Edge Clusters", description: "Edge computing clusters for distributed workloads" },
    productionCluster: { name: "Production Cluster", description: "Production workloads and mission-critical applications" },
    devTestCluster: { name: "Dev/Test Cluster", description: "Development and testing environments" },
    multiCloudHub: { name: "Multi-Cloud Hub", description: "Cross-cloud orchestration and management" },
  },
}

interface NetworkGlobeProps { isLoaded?: boolean }
interface FlowMaterial extends THREE.Material { opacity: number; color: THREE.Color; dashSize?: number; gapSize?: number }
interface FlowChild extends THREE.Object3D { material?: FlowMaterial }
interface CentralNodeChild extends THREE.Object3D { material?: THREE.Material & { opacity?: number } }

const NetworkGlobe = ({ isLoaded = true }: NetworkGlobeProps) => {
  const globeRef = useRef<THREE.Mesh>(null)
  const gridLinesRef = useRef<THREE.Group>(null)
  const centralNodeRef = useRef<THREE.Group>(null)
  const dataFlowsRef = useRef<THREE.Group>(null)
  const rotatingContentRef = useRef<THREE.Group>(null)
  const [activeFlows, setActiveFlows] = useState<number[]>([])
  const [animationProgress, setAnimationProgress] = useState(0)

  const clusters = useMemo(() => [
    { name: translations.clusters.kubeflexCore.name, position: [0, 3, 0] as [number, number, number], nodeCount: 6, radius: 0.8, color: COLORS.primary, description: translations.clusters.kubeflexCore.description },
    { name: translations.clusters.edgeClusters.name, position: [3, 0, 0] as [number, number, number], nodeCount: 8, radius: 1, color: COLORS.highlight, description: translations.clusters.edgeClusters.description },
    { name: translations.clusters.productionCluster.name, position: [0, -3, 0] as [number, number, number], nodeCount: 5, radius: 0.7, color: COLORS.success, description: translations.clusters.productionCluster.description },
    { name: translations.clusters.devTestCluster.name, position: [-3, 0, 0] as [number, number, number], nodeCount: 7, radius: 0.9, color: COLORS.accent2, description: translations.clusters.devTestCluster.description },
    { name: translations.clusters.multiCloudHub.name, position: [2, 2, -2] as [number, number, number], nodeCount: 4, radius: 0.6, color: COLORS.accent1, description: translations.clusters.multiCloudHub.description },
  ], [])

  const dataFlows = useMemo(() => {
    const flows: { path: [number, number, number][]; id: number; type: string }[] = []
    const centralPos: [number, number, number] = [0, 0, 0]
    clusters.forEach((cluster, idx) => flows.push({ path: [centralPos, cluster.position], id: idx, type: "control" }))
    flows.push({ path: [clusters[2].position, clusters[1].position], id: clusters.length + 1, type: "workload" })
    flows.push({ path: [clusters[0].position, clusters[1].position], id: clusters.length + 2, type: "control" })
    flows.push({ path: [clusters[3].position, clusters[2].position], id: clusters.length + 3, type: "deploy" })
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (Math.random() > 0.7) flows.push({ path: [clusters[i].position, clusters[j].position], id: clusters.length + i * 10 + j, type: "data" })
      }
    }
    return flows
  }, [clusters])

  useEffect(() => {
    if (!isLoaded) return
    const interval = setInterval(() => {
      setActiveFlows(Array.from({ length: Math.floor(dataFlows.length / 2) }, () => Math.floor(Math.random() * dataFlows.length)))
    }, 4000)
    return () => clearInterval(interval)
  }, [dataFlows.length, isLoaded])

  useFrame(state => {
    const time = state.clock.getElapsedTime()
    if (isLoaded && animationProgress < 1) setAnimationProgress(Math.min(animationProgress + 0.01, 1))
    if (globeRef.current) {
      globeRef.current.rotation.y = time * 0.1
      globeRef.current.rotation.x = Math.sin(time * 0.15) * 0.08
      globeRef.current.rotation.z = Math.cos(time * 0.08) * 0.03
      globeRef.current.scale.setScalar(isLoaded ? animationProgress : 0.5)
    }
    if (gridLinesRef.current) {
      gridLinesRef.current.rotation.y = time * 0.1
      gridLinesRef.current.rotation.x = Math.sin(time * 0.15) * 0.08
      gridLinesRef.current.rotation.z = Math.cos(time * 0.08) * 0.03
    }
    if (rotatingContentRef.current) {
      rotatingContentRef.current.rotation.y = time * 0.1
      rotatingContentRef.current.rotation.x = Math.sin(time * 0.15) * 0.08
      rotatingContentRef.current.rotation.z = Math.cos(time * 0.08) * 0.03
    }
    if (centralNodeRef.current) {
      centralNodeRef.current.rotation.y = time * 0.15
      centralNodeRef.current.rotation.x = Math.sin(time * 0.2) * 0.05
      centralNodeRef.current.scale.setScalar((1 + Math.sin(time * 1.5) * 0.05) * animationProgress)
      centralNodeRef.current.children.forEach((child: CentralNodeChild) => {
        if (child.material && typeof child.material.opacity !== "undefined") {
          child.material.opacity = Math.min(child.material.opacity + 0.01, animationProgress)
        }
      })
    }
    if (dataFlowsRef.current) {
      dataFlowsRef.current.children.forEach((flow: FlowChild, i) => {
        if (flow.material) {
          const flowType = dataFlows[i]?.type || "data"
          if (activeFlows.includes(i)) {
            flow.material.opacity = Math.min(flow.material.opacity + 0.05, 0.8 * animationProgress)
            const colorMap: Record<string, string> = { workload: COLORS.success, deploy: COLORS.accent1, control: COLORS.secondary }
            flow.material.color.set(colorMap[flowType] || COLORS.highlight)
            if (flow.material.dashSize !== undefined) flow.material.dashSize = 0.1
            if (flow.material.gapSize !== undefined) flow.material.gapSize = 0.05
          } else {
            flow.material.opacity = Math.max(flow.material.opacity - 0.02, 0.1 * animationProgress)
            flow.material.color.set(COLORS.primary)
            if (flow.material.dashSize !== undefined) flow.material.dashSize = 0.05
            if (flow.material.gapSize !== undefined) flow.material.gapSize = 0.1
          }
        }
      })
    }
  })

  return (
    <group>
      <Sphere ref={globeRef} args={[3.5, 64, 64]}>
        <meshPhongMaterial color={COLORS.primary} transparent opacity={0.15 * animationProgress} wireframe />
      </Sphere>
      <group ref={gridLinesRef}>
        {Array.from({ length: 8 }).map((_, idx) => (
          <Torus key={idx} args={[3.5, 0.01, 16, 100]} rotation={[0, 0, (Math.PI * idx) / 8]}>
            <meshBasicMaterial color={COLORS.primary} transparent opacity={0.18 * animationProgress} />
          </Torus>
        ))}
        {Array.from({ length: 8 }).map((_, idx) => (
          <Torus key={idx + 8} args={[3.5, 0.01, 16, 100]} rotation={[Math.PI / 2, (Math.PI * idx) / 8, 0]}>
            <meshBasicMaterial color={COLORS.primary} transparent opacity={0.18 * animationProgress} />
          </Torus>
        ))}
      </group>
      <group ref={centralNodeRef}>
        <LogoElement position={[0, 0, 0]} rotation={[0, 0, 0]} scale={1} />
        <Billboard position={[0, 1, 0]}>
          <Text fontSize={0.2} color={COLORS.highlight} anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor={COLORS.background} fillOpacity={animationProgress}>{translations.kubestellar}</Text>
          <Text position={[0, -0.25, 0]} fontSize={0.1} color={COLORS.primary} anchorX="center" anchorY="middle" fillOpacity={animationProgress}>{translations.controlPlane}</Text>
        </Billboard>
      </group>
      <group ref={rotatingContentRef}>
        {clusters.map((cluster, idx) => (
          <group key={idx} scale={animationProgress > idx * 0.15 ? animationProgress : 0} position={[cluster.position[0] * animationProgress, cluster.position[1] * animationProgress, cluster.position[2] * animationProgress]}>
            <Cluster position={[0, 0, 0]} name={cluster.name} nodeCount={cluster.nodeCount} radius={cluster.radius} color={cluster.color} description={cluster.description} />
          </group>
        ))}
        <group ref={dataFlowsRef}>
          {dataFlows.map((flow, idx) => {
            const colorMap: Record<string, string> = { workload: COLORS.success, deploy: COLORS.accent1, control: COLORS.secondary }
            return (
              <Line key={idx} points={flow.path} color={activeFlows.includes(idx) ? (colorMap[flow.type] || COLORS.highlight) : COLORS.primary} lineWidth={1.5} transparent opacity={(activeFlows.includes(idx) ? 0.8 : 0.1) * animationProgress} dashed dashSize={0.1} gapSize={0.1} />
            )
          })}
        </group>
        {isLoaded && animationProgress > 0.7 && dataFlows.map((flow, idx) => {
          if (!activeFlows.includes(idx)) return null
          const colorMap: Record<string, string> = { workload: COLORS.success, deploy: COLORS.accent1, control: COLORS.secondary }
          return <DataPacket key={idx} path={flow.path} speed={1 + Math.random()} color={colorMap[flow.type] || (idx % 2 === 0 ? COLORS.highlight : COLORS.primary)} />
        })}
      </group>
    </group>
  )
}

export default NetworkGlobe
