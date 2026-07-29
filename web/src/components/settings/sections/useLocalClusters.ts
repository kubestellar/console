import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../ui/Toast'
import { useLocalClusterTools } from '../../../hooks/useLocalClusterTools'
import { emitLocalClusterCreated } from '../../../lib/analytics'
import { useMissions } from '../../../hooks/useMissions'
import { useApiKeyCheck } from '../../cards/console-missions/shared'
import { useClusters } from '../../../hooks/mcp/clusters'

/** Default namespace for new vCluster instances */
const VCLUSTER_DEFAULT_NAMESPACE = 'vcluster'

export function useLocalClusters() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const tools = useLocalClusterTools()
  const { startMission } = useMissions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()
  const { deduplicatedClusters: connectedClusters } = useClusters()

  const [selectedTool, setSelectedTool] = useState('')
  const [clusterName, setClusterName] = useState('')
  const [vclusterName, setVclusterName] = useState('')
  const [vclusterNamespace, setVclusterNamespace] = useState(VCLUSTER_DEFAULT_NAMESPACE)
  const [vclusterHostCluster, setVclusterHostCluster] = useState('')
  const [deleteClusterConfirm, setDeleteClusterConfirm] = useState<{ tool: string; name: string } | null>(null)
  const [deleteVClusterConfirm, setDeleteVClusterConfirm] = useState<{ name: string; namespace: string } | null>(null)

  const healthyClusters = (connectedClusters || []).filter(c => c.healthy !== false)
  const hasVClusterTool = tools.installedTools.some(tool => tool.name === 'vcluster')
  /** Local cluster tools excluding vcluster (vcluster has its own section) */
  const localClusterTools = tools.installedTools.filter(tool => tool.name !== 'vcluster')

  const handleCreate = async () => {
    if (!selectedTool || !clusterName.trim()) return
    try {
      const result = await tools.createCluster(selectedTool, clusterName.trim())
      emitLocalClusterCreated(selectedTool)
      if (result.status === 'creating') {
        setClusterName('')
      }
    } catch {
      // createCluster handles errors internally; ignore unexpected throws
    }
  }

  const handleDelete = async (tool: string, name: string) => {
    try {
      const success = await tools.deleteCluster(tool, name)
      if (success) {
        showToast(t('settings.localClusters.deleteSuccess', { name }), 'success')
      } else {
        showToast(t('settings.localClusters.deleteError', { name }), 'error')
      }
    } catch {
      showToast(t('settings.localClusters.deleteError', { name }), 'error')
    }
  }

  const handleCreateVCluster = async () => {
    if (!vclusterName.trim()) return
    try {
      const result = await tools.createVCluster(vclusterName.trim(), vclusterNamespace.trim() || VCLUSTER_DEFAULT_NAMESPACE)
      emitLocalClusterCreated('vcluster')
      if (result.status === 'creating') {
        setVclusterName('')
        setVclusterNamespace(VCLUSTER_DEFAULT_NAMESPACE)
      }
    } catch {
      // createVCluster handles errors internally; ignore unexpected throws
    }
  }

  const handleDeleteVCluster = async (name: string, namespace: string) => {
    try {
      await tools.deleteVCluster(name, namespace)
    } catch {
      // deleteVCluster handles errors internally; ignore unexpected throws
    }
  }

  const handleConnectVCluster = async (name: string, namespace: string) => {
    try {
      await tools.connectVCluster(name, namespace)
    } catch {
      // connectVCluster handles errors internally; ignore unexpected throws
    }
  }

  const handleDisconnectVCluster = async (name: string, namespace: string) => {
    try {
      await tools.disconnectVCluster(name, namespace)
    } catch {
      // disconnectVCluster handles errors internally; ignore unexpected throws
    }
  }

  const handleSetVclusterHostCluster = (value: string) => {
    setVclusterHostCluster(value)
    if (value) tools.checkVClusterOnCluster(value)
  }

  // Client mission: install vCluster CLI locally
  const handleInstallVClusterCLI = () => {
    checkKeyAndRun(() => {
      startMission({
        title: 'Install vCluster CLI',
        description: 'Install the vCluster CLI tool on this machine',
        type: 'deploy',
        initialPrompt: 'Install the vCluster CLI tool on the local machine. Try using homebrew first (brew install loft-sh/tap/vcluster), and if that is not available, use the official install script: curl -L -o vcluster "https://github.com/loft-sh/vcluster/releases/latest/download/vcluster-$(uname -s)-$(uname -m)" && sudo install -c -m 0755 vcluster /usr/local/bin && rm -f vcluster. Verify the installation by running vcluster --version. After installation, ask: "vCluster CLI is installed — want to deploy it to a cluster?" or "Something went wrong — want to see details?"',
      })
    })
  }

  // Cluster mission: deploy vCluster operator to a specific host cluster
  const handleInstallVClusterOnCluster = (clusterContext: string) => {
    const displayName = (healthyClusters || []).find(c => (c.context || c.name) === clusterContext)?.name || clusterContext
    checkKeyAndRun(() => {
      startMission({
        title: `Deploy vCluster to ${displayName}`,
        description: `Install the vCluster operator on ${displayName} using Helm`,
        type: 'deploy',
        cluster: clusterContext,
        initialPrompt: `Deploy the vCluster operator to cluster "${displayName}" (context: ${clusterContext}) using Helm.

IMPORTANT: All kubectl and helm commands MUST use --context=${clusterContext}

Steps:
1. Verify connectivity: kubectl --context=${clusterContext} cluster-info
2. Add the Loft Helm repo: helm repo add loft-sh https://charts.loft.sh && helm repo update
3. Install the vCluster Helm chart: helm upgrade --install vcluster loft-sh/vcluster --namespace vcluster --create-namespace --kube-context=${clusterContext}
4. Wait for readiness: kubectl --context=${clusterContext} -n vcluster wait --for=condition=ready pod -l app=vcluster --timeout=120s
5. Verify the installation: kubectl --context=${clusterContext} get pods -n vcluster

After installation, ask:
- "vCluster operator is ready — want me to create and connect a virtual cluster now?"
- "Something went wrong — want to see details?"

If I say yes, do not stop after creation:
6. Create the virtual cluster on host context ${clusterContext}.
7. Connect it so kubeconfig gets a usable vCluster context without replacing the current host context.
8. Verify the vCluster context is reachable and visible to the Console cluster list.
`,
      })
    })
  }

  // Cluster mission: deploy KubeVirt operator to a specific host cluster
  const handleInstallKubeVirtOnCluster = (clusterContext: string) => {
    const displayName = (healthyClusters || []).find(c => (c.context || c.name) === clusterContext)?.name || clusterContext
    checkKeyAndRun(() => {
      startMission({
        title: `Install KubeVirt on ${displayName}`,
        description: `Install the KubeVirt operator on ${displayName}`,
        type: 'deploy',
        cluster: clusterContext,
        initialPrompt: `Install KubeVirt on cluster "${displayName}" (context: ${clusterContext}).

IMPORTANT: All kubectl commands MUST use --context=${clusterContext}

Steps:
1. Verify connectivity: kubectl --context=${clusterContext} cluster-info
2. Get the latest KubeVirt release version: export KUBEVIRT_VERSION=$(curl -s https://api.github.com/repos/kubevirt/kubevirt/releases/latest | grep tag_name | cut -d '"' -f 4)
3. Deploy the KubeVirt operator: kubectl --context=${clusterContext} apply -f https://github.com/kubevirt/kubevirt/releases/download/\${KUBEVIRT_VERSION}/kubevirt-operator.yaml
4. Deploy the KubeVirt custom resource: kubectl --context=${clusterContext} apply -f https://github.com/kubevirt/kubevirt/releases/download/\${KUBEVIRT_VERSION}/kubevirt-cr.yaml
5. Wait for KubeVirt to be ready: kubectl --context=${clusterContext} -n kubevirt wait kv kubevirt --for condition=Available --timeout=300s
6. Verify the installation: kubectl --context=${clusterContext} get pods -n kubevirt

After installation, ask:
- "KubeVirt is ready — want to create a VM?"
- "Something went wrong — want to see details?"`,
      })
    })
  }

  return {
    // Spread all tool state and actions from useLocalClusterTools
    ...tools,
    // Derived values
    healthyClusters,
    hasVClusterTool,
    localClusterTools,
    // Form state
    selectedTool,
    setSelectedTool,
    clusterName,
    setClusterName,
    vclusterName,
    setVclusterName,
    vclusterNamespace,
    setVclusterNamespace,
    vclusterHostCluster,
    deleteClusterConfirm,
    setDeleteClusterConfirm,
    deleteVClusterConfirm,
    setDeleteVClusterConfirm,
    // API key prompt state
    showKeyPrompt,
    goToSettings,
    dismissPrompt,
    // Handlers
    handleCreate,
    handleDelete,
    handleCreateVCluster,
    handleDeleteVCluster,
    handleConnectVCluster,
    handleDisconnectVCluster,
    handleSetVclusterHostCluster,
    handleInstallVClusterCLI,
    handleInstallVClusterOnCluster,
    handleInstallKubeVirtOnCluster,
  }
}
