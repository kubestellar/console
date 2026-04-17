/**
 * Mission prompts for AI-powered multi-tenancy configuration.
 */

export const MULTI_TENANCY_SETUP_PROMPT = `Configure the multi-tenancy framework on this cluster using OVN-Kubernetes, KubeFlex, K3s, and KubeVirt.

The architecture creates tenant isolation at three levels:
1. Control-plane isolation: KubeFlex creates dedicated control planes, K3s runs as lightweight clusters
2. Data-plane isolation: KubeVirt runs VMs as pods so tenants don't share compute nodes
3. Network isolation: OVN-Kubernetes User Defined Networks (UDN) with Layer-3 primary (data-plane traffic) and Layer-2 secondary (control-plane traffic)

For each tenant:
- Create a KubeFlex ControlPlane
- Deploy a KubeVirt VM in namespace-1 with dual NICs (eth0 on L3 UDN primary, eth1 on L2 UDN secondary)
- Deploy a K3s server pod in namespace-2 connected via KubeFlex controller (eth0 on default network, eth1 on L2 UDN secondary)
- Configure UDN primary for data-plane traffic and UDN secondary for control-plane traffic

Check which components are already installed and only install/configure what's missing.

After each component is configured, ask:
- "Ready for the next component?"
- "Something went wrong — want to see details?"`

export const OVN_INSTALL_PROMPT = `Install OVN-Kubernetes on this cluster.
OVN-Kubernetes provides software-defined networking with User Defined Networks (UDN) support.
Check if OVN is already installed. If not, install the OVN-Kubernetes operator and configure it for multi-tenancy with UDN support.

After installation, ask:
- "OVN is ready — move on to the next step?"
- "Something went wrong — want to see details?"`

export const KUBEFLEX_INSTALL_PROMPT = `Install KubeFlex on this cluster.
KubeFlex enables multi-tenancy through dedicated control planes per tenant.
Check if KubeFlex is already installed. If not, install the KubeFlex operator and verify the ControlPlane CRD is available.

After installation, ask:
- "KubeFlex is ready — move on to the next step?"
- "Something went wrong — want to see details?"`

export const K3S_INSTALL_PROMPT = `Install K3s server pods on this cluster.
K3s provides lightweight Kubernetes clusters that run as pods, used for control-plane isolation.
Check if K3s server pods are already running. If not, deploy a K3s server pod and verify it can accept agent connections.

After installation, ask:
- "K3s is ready — move on to the next step?"
- "Something went wrong — want to see details?"`

export const KUBEVIRT_INSTALL_PROMPT = `Install KubeVirt on this cluster.
KubeVirt enables running virtual machines as Kubernetes pods, providing data-plane isolation.
Check if KubeVirt is already installed. If not, install the KubeVirt operator and verify VirtualMachine CRDs are available.

After installation, ask:
- "KubeVirt is ready — move on to the next step?"
- "Something went wrong — want to see details?"`
