import { useEffect, useMemo, useRef, useState } from 'react'
import { isDemoMode } from '../../lib/demoMode'
import type { MissionExport } from '../../lib/missions/types'
import {
  updateNodeInTree,
  removeNodeFromTree,
  fetchTreeChildren,
  getKubaraConfig,
} from './browser'
import type { TreeNode } from './browser'

interface MissionTreeTarget {
  rootId: 'community' | 'github' | 'kubara'
  targetPath: string
  repoFullName?: string
}

function findTreeNodeById(nodes: TreeNode[], nodeId: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    if (node.children) {
      const nested = findTreeNodeById(node.children, nodeId)
      if (nested) return nested
    }
  }
  return null
}

function parseGitHubRepoFullName(repoUrl: string | undefined): string | null {
  if (!repoUrl) return null
  const repoMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/?#].*)?$/i)
  if (!repoMatch) return null
  return `${repoMatch[1]}/${repoMatch[2]}`
}

function resolveMissionTreeTarget(
  sourcePath: string | undefined,
  sourceRepoUrl: string | undefined,
  kubaraRootPath: string | undefined,
  kubaraRepoFullName: string | undefined,
): MissionTreeTarget | null {
  const normalizedSource = sourcePath?.trim().replace(/^\/+/, '')
  const repoFullName = parseGitHubRepoFullName(sourceRepoUrl)

  if (normalizedSource?.startsWith('fixes/')) {
    return { rootId: 'community', targetPath: normalizedSource }
  }

  if (normalizedSource?.startsWith('go-binary/templates/embedded/managed-service-catalog/helm/')) {
    return { rootId: 'kubara', targetPath: normalizedSource }
  }

  if (normalizedSource?.startsWith('kubara/')) {
    if (!kubaraRootPath) return null
    const relativePath = normalizedSource.slice('kubara/'.length)
    return {
      rootId: 'kubara',
      targetPath: relativePath ? `${kubaraRootPath}/${relativePath}` : kubaraRootPath,
    }
  }

  if (repoFullName && kubaraRootPath && repoFullName === kubaraRepoFullName) {
    const kubaraRelativePath = normalizedSource
      ? normalizedSource.replace(/^go-binary\/templates\/embedded\/managed-service-catalog\/helm\/?/, '')
      : ''
    return {
      rootId: 'kubara',
      targetPath: kubaraRelativePath ? `${kubaraRootPath}/${kubaraRelativePath}` : kubaraRootPath,
      repoFullName,
    }
  }

  if (repoFullName) {
    const targetPath = normalizedSource
      ? normalizedSource.startsWith(`${repoFullName}/`)
        ? normalizedSource
        : `${repoFullName}/${normalizedSource}`
      : repoFullName
    return { rootId: 'github', targetPath, repoFullName }
  }

  if (normalizedSource) {
    const pathParts = normalizedSource.split('/')
    if (pathParts.length >= 3) {
      return { rootId: 'github', targetPath: normalizedSource, repoFullName: `${pathParts[0]}/${pathParts[1]}` }
    }
  }

  return null
}

export function useMissionTree({
  isOpen,
  isAuthenticated,
  user,
  watchedRepos,
  watchedPaths,
}: {
  isOpen: boolean
  isAuthenticated: boolean
  user: unknown
  watchedRepos: string[]
  watchedPaths: string[]
}) {
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [revealPath, setRevealPath] = useState<string | null>(null)
  const [revealNonce, setRevealNonce] = useState(0)
  const treeNodesRef = useRef<TreeNode[]>([])
  const expandedNodesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    treeNodesRef.current = treeNodes
  }, [treeNodes])

  useEffect(() => {
    expandedNodesRef.current = expandedNodes
  }, [expandedNodes])

  useEffect(() => {
    if (!isOpen) return

    const rootNodes: TreeNode[] = [
      {
        id: 'community',
        name: 'KubeStellar Community',
        path: 'fixes',
        type: 'directory',
        source: 'community',
        loaded: false,
        description: 'console-kb',
      },
      {
        id: 'kubara',
        name: 'Kubara Platform Catalog',
        path: 'go-binary/templates/embedded/managed-service-catalog/helm',
        type: 'directory',
        source: 'github',
        loaded: false,
        description: isDemoMode() ? 'Demo catalog — install console locally for live data' : 'Production-tested Helm values from kubara-io/kubara',
        repoOwner: 'kubara-io',
        repoName: 'kubara',
        infoTooltip: 'Catalog: kubara-io/kubara · Set KUBARA_CATALOG_REPO (and optionally KUBARA_CATALOG_PATH) to use your own public or private catalog',
      },
    ]

    getKubaraConfig().then((cfg) => {
      const repo = `${cfg.repoOwner}/${cfg.repoName}`
      const isCustom = repo !== 'kubara-io/kubara'
      setTreeNodes((prev) => {
        const next = updateNodeInTree(prev, 'kubara', {
          path: cfg.catalogPath,
          repoOwner: cfg.repoOwner,
          repoName: cfg.repoName,
          description: isDemoMode()
            ? 'Demo catalog — install console locally for live data'
            : isCustom
              ? `Custom catalog: ${repo}`
              : 'Production-tested Helm values from kubara-io/kubara',
          infoTooltip: `Catalog: ${repo} · Set KUBARA_CATALOG_REPO (and optionally KUBARA_CATALOG_PATH) to use your own public or private catalog`,
        })
        treeNodesRef.current = next
        return next
      })
    }).catch((error: unknown) => {
      console.error('[MissionBrowser] failed to load kubara config:', error)
    })

    if (isAuthenticated && user) {
      rootNodes.push({
        id: 'github',
        name: 'GitHub Repositories',
        path: '',
        type: 'directory',
        source: 'github',
        loaded: true,
        description: 'Add any repo — your own, Kubara forks, or team knowledge bases',
        children: watchedRepos.map((repo) => ({
          id: `github/${repo}`,
          name: repo.split('/').pop() || repo,
          path: repo,
          type: 'directory' as const,
          source: 'github' as const,
          loaded: false,
          description: repo,
        })),
      })
    }

    rootNodes.push({
      id: 'local',
      name: 'Local Files',
      path: '',
      type: 'directory',
      source: 'local',
      loaded: true,
      children: watchedPaths.map((path) => ({
        id: `local/${path}`,
        name: path.split('/').pop() || path,
        path,
        type: 'directory' as const,
        source: 'local' as const,
        loaded: false,
        description: path,
      })),
      description: 'Drop files or add paths',
    })

    treeNodesRef.current = rootNodes
    expandedNodesRef.current = new Set()
    setTreeNodes(rootNodes)
    setExpandedNodes(new Set())
    setSelectedPath(null)
    setRevealPath(null)
  }, [isAuthenticated, isOpen, user, watchedPaths, watchedRepos])

  const expandNode = async (node: TreeNode): Promise<TreeNode | null> => {
    const nodeId = node.id

    if (!expandedNodesRef.current.has(nodeId)) {
      setExpandedNodes((prev) => {
        const next = new Set(prev).add(nodeId)
        expandedNodesRef.current = next
        return next
      })
    }

    if (node.loaded || node.loading) {
      return findTreeNodeById(treeNodesRef.current, nodeId) ?? node
    }

    setTreeNodes((prev) => {
      const next = updateNodeInTree(prev, nodeId, { loading: true })
      treeNodesRef.current = next
      return next
    })

    try {
      const children = await fetchTreeChildren(node)

      if (node.source === 'community' && children.length === 0 && nodeId !== 'community') {
        setTreeNodes((prev) => {
          const next = removeNodeFromTree(prev, nodeId)
          treeNodesRef.current = next
          return next
        })
        return null
      }

      const expandedNode: TreeNode = {
        ...node,
        children,
        loaded: true,
        loading: false,
        isEmpty: children.length === 0,
      }

      setTreeNodes((prev) => {
        const next = updateNodeInTree(prev, nodeId, {
          children,
          loaded: true,
          loading: false,
          isEmpty: children.length === 0,
        })
        treeNodesRef.current = next
        return next
      })

      return expandedNode
    } catch {
      const failedNode: TreeNode = {
        ...node,
        children: [],
        loaded: true,
        loading: false,
        isEmpty: true,
        description: 'Failed to load — check network or GitHub rate limits',
      }

      setTreeNodes((prev) => {
        const next = updateNodeInTree(prev, nodeId, {
          children: [],
          loaded: true,
          loading: false,
          isEmpty: true,
          description: 'Failed to load — check network or GitHub rate limits',
        })
        treeNodesRef.current = next
        return next
      })

      return failedNode
    }
  }

  const toggleNode = async (node: TreeNode) => {
    const nodeId = node.id

    if (expandedNodesRef.current.has(nodeId)) {
      setExpandedNodes((prev) => {
        const next = new Set(prev)
        next.delete(nodeId)
        expandedNodesRef.current = next
        return next
      })
      return
    }

    await expandNode(node)
  }

  const ensureGitHubRepoNode = (repoFullName: string) => {
    setTreeNodes((prev) => {
      const githubRoot = prev.find((node) => node.id === 'github')
      if (!githubRoot) return prev

      const repoExists = (githubRoot.children || []).some((child) => child.path === repoFullName)
      if (repoExists) return prev

      const next = prev.map((node) => {
        if (node.id !== 'github') return node
        return {
          ...node,
          children: [
            ...(node.children || []),
            {
              id: `github/${repoFullName}`,
              name: repoFullName.split('/').pop() || repoFullName,
              path: repoFullName,
              type: 'directory' as const,
              source: 'github' as const,
              loaded: false,
              description: repoFullName,
            },
          ],
        }
      })
      treeNodesRef.current = next
      return next
    })
  }

  const revealMissionInTree = async (mission: MissionExport) => {
    const kubaraNode = findTreeNodeById(treeNodesRef.current, 'kubara')
    const kubaraRootPath = kubaraNode?.path
    const kubaraRepoFullName = kubaraNode?.repoOwner && kubaraNode.repoName
      ? `${kubaraNode.repoOwner}/${kubaraNode.repoName}`
      : undefined
    const target = resolveMissionTreeTarget(
      mission.metadata?.source,
      mission.metadata?.sourceUrls?.repo,
      kubaraRootPath,
      kubaraRepoFullName,
    )
    if (!target) return

    if (target.rootId === 'github' && target.repoFullName) {
      ensureGitHubRepoNode(target.repoFullName)
      setExpandedNodes((prev) => {
        const next = new Set(prev).add('github')
        expandedNodesRef.current = next
        return next
      })
    }

    let currentNode = findTreeNodeById(treeNodesRef.current, target.rootId)
    if (!currentNode) return

    while (currentNode) {
      if (currentNode.path === target.targetPath) {
        setSelectedPath(currentNode.id)
        setRevealPath(currentNode.id)
        setRevealNonce((prev) => prev + 1)
        return
      }

      if (currentNode.type !== 'directory') return

      const refreshedNode = await expandNode(currentNode)
      if (!refreshedNode) return

      const matchingChild = (refreshedNode.children || []).find((child) =>
        target.targetPath === child.path || target.targetPath.startsWith(`${child.path}/`),
      )

      if (!matchingChild) return
      currentNode = matchingChild
    }
  }

  const refreshNode = (node: TreeNode) => {
    setTreeNodes((prev) => {
      const next = updateNodeInTree(prev, node.id, {
        loaded: false,
        loading: false,
        children: [],
      })
      treeNodesRef.current = next
      return next
    })
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      next.delete(node.id)
      expandedNodesRef.current = next
      return next
    })
  }

  const addLocalNode = (node: TreeNode) => {
    setTreeNodes((prev) => {
      const next = prev.map((treeNode) =>
        treeNode.id === 'local'
          ? {
              ...treeNode,
              children: [
                ...(treeNode.children || []).filter((child) => child.id !== node.id),
                node,
              ],
            }
          : treeNode,
      )
      treeNodesRef.current = next
      return next
    })
    setExpandedNodes((prev) => {
      const next = new Set(prev).add('local')
      expandedNodesRef.current = next
      return next
    })
    setSelectedPath(node.id)
  }

  const selectedTreeNode = useMemo(
    () => (selectedPath ? findTreeNodeById(treeNodes, selectedPath) : null),
    [selectedPath, treeNodes],
  )

  return {
    treeNodes,
    expandedNodes,
    selectedPath,
    setSelectedPath,
    revealPath,
    revealNonce,
    selectedTreeNode,
    toggleNode,
    revealMissionInTree,
    refreshNode,
    addLocalNode,
  }
}
