package k8stest

import (
	"context"
	"time"

	authv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/clientcmd/api"
)

// FakeMultiClusterSetup provides a test-friendly MultiClusterClient configuration
// without attempting to load real kubeconfig files or use in-cluster config.
// Use this in unit tests to avoid KUBERNETES_SERVICE_HOST detection and RBAC errors.
//
// Example:
//
//	setup := k8stest.NewFakeMultiClusterSetup()
//	setup.SetFakeClient("c1", k8sfake.NewSimpleClientset(nodes...))
//	// Then manually set fields on your MultiClusterClient test instance
type FakeMultiClusterSetup struct {
	Clients        map[string]kubernetes.Interface
	DynamicClients map[string]dynamic.Interface
	RawConfig      *api.Config
}

// NewFakeMultiClusterSetup creates an empty test MultiClusterClient configuration.
// Use SetFakeClient or InjectTestClusters to add clusters.
func NewFakeMultiClusterSetup() *FakeMultiClusterSetup {
	return &FakeMultiClusterSetup{
		Clients:        make(map[string]kubernetes.Interface),
		DynamicClients: make(map[string]dynamic.Interface),
		RawConfig: &api.Config{
			Contexts: map[string]*api.Context{},
			Clusters: map[string]*api.Cluster{},
		},
	}
}

// SetFakeClient injects a fake typed client for the given context name.
// Automatically creates rawConfig entries so DeduplicatedClusters sees this cluster.
func (f *FakeMultiClusterSetup) SetFakeClient(contextName string, client kubernetes.Interface) {
	f.Clients[contextName] = client
	if f.RawConfig.Contexts[contextName] == nil {
		clusterKey := "cl-" + contextName
		f.RawConfig.Contexts[contextName] = &api.Context{Cluster: clusterKey}
		// Each cluster gets a unique server URL to prevent deduplication
		f.RawConfig.Clusters[clusterKey] = &api.Cluster{Server: "https://" + contextName + ".test"}
	}
}

// SetFakeDynamicClient injects a fake dynamic client for the given context name.
func (f *FakeMultiClusterSetup) SetFakeDynamicClient(contextName string, client dynamic.Interface) {
	f.DynamicClients[contextName] = client
	if f.RawConfig.Contexts[contextName] == nil {
		clusterKey := "cl-" + contextName
		f.RawConfig.Contexts[contextName] = &api.Context{Cluster: clusterKey}
		f.RawConfig.Clusters[clusterKey] = &api.Cluster{Server: "https://" + contextName + ".test"}
	}
}

// InjectTestClusters adds minimal kubeconfig entries for the given context names
// so that DeduplicatedClusters / ListClusters returns them without attempting
// to load real kubeconfig from disk. Each cluster gets a unique fake server URL
// to prevent deduplication.
func (f *FakeMultiClusterSetup) InjectTestClusters(names ...string) {
	for _, name := range names {
		clusterKey := "cl-" + name
		f.RawConfig.Contexts[name] = &api.Context{Cluster: clusterKey}
		f.RawConfig.Clusters[clusterKey] = &api.Cluster{Server: "https://" + name + ".test"}
	}
}

// NewFakeClientWithNodes returns a fake typed client pre-populated with the
// given nodes. Useful for health/capacity tests.
func NewFakeClientWithNodes(nodes ...*corev1.Node) *k8sfake.Clientset {
	objects := make([]runtime.Object, len(nodes))
	for i, n := range nodes {
		objects[i] = n
	}
	return k8sfake.NewSimpleClientset(objects...)
}

// NewFakeClientWithPods returns a fake typed client pre-populated with the
// given pods.
func NewFakeClientWithPods(pods ...*corev1.Pod) *k8sfake.Clientset {
	objects := make([]runtime.Object, len(pods))
	for i, p := range pods {
		objects[i] = p
	}
	return k8sfake.NewSimpleClientset(objects...)
}

// NewFakeClientAllowAll returns a fake client that allows all RBAC checks
// (SelfSubjectAccessReview). Use for permission summary tests.
func NewFakeClientAllowAll() *k8sfake.Clientset {
	fc := k8sfake.NewSimpleClientset()
	fc.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &authv1.SelfSubjectAccessReview{
			Status: authv1.SubjectAccessReviewStatus{Allowed: true},
		}, nil
	})
	return fc
}

// NewFakeClientDenyAll returns a fake client that denies all RBAC checks.
func NewFakeClientDenyAll() *k8sfake.Clientset {
	fc := k8sfake.NewSimpleClientset()
	fc.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &authv1.SelfSubjectAccessReview{
			Status: authv1.SubjectAccessReviewStatus{Allowed: false, Reason: "test deny"},
		}, nil
	})
	return fc
}

// NewHealthyNode creates a node with Ready condition and the given resource capacity.
func NewHealthyNode(name string, cpuCores, memoryGiB int) *corev1.Node {
	cpuStr := resource.NewQuantity(int64(cpuCores), resource.DecimalSI).String()
	memStr := resource.NewQuantity(int64(memoryGiB)*1024*1024*1024, resource.BinarySI).String()
	return &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: name},
		Status: corev1.NodeStatus{
			Conditions: []corev1.NodeCondition{
				{Type: corev1.NodeReady, Status: corev1.ConditionTrue},
			},
			Capacity: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse(cpuStr),
				corev1.ResourceMemory: resource.MustParse(memStr),
			},
			Allocatable: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse(cpuStr),
				corev1.ResourceMemory: resource.MustParse(memStr),
			},
		},
	}
}

// NewRunningPod creates a pod in Running phase in the given namespace.
func NewRunningPod(name, namespace string) *corev1.Pod {
	return &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Status:     corev1.PodStatus{Phase: corev1.PodRunning},
	}
}

// BuildGVRMap returns a comprehensive GVR-to-ListKind map for fake dynamic
// clients. Covers common resources used in dependency resolution, monitoring,
// and workload tests.
func BuildGVRMap() map[schema.GroupVersionResource]string {
	return map[schema.GroupVersionResource]string{
		{Group: "apps", Version: "v1", Resource: "deployments"}:                                             "DeploymentList",
		{Group: "apps", Version: "v1", Resource: "statefulsets"}:                                            "StatefulSetList",
		{Group: "apps", Version: "v1", Resource: "daemonsets"}:                                              "DaemonSetList",
		{Group: "", Version: "v1", Resource: "pods"}:                                                        "PodList",
		{Group: "", Version: "v1", Resource: "services"}:                                                    "ServiceList",
		{Group: "", Version: "v1", Resource: "configmaps"}:                                                  "ConfigMapList",
		{Group: "", Version: "v1", Resource: "secrets"}:                                                     "SecretList",
		{Group: "", Version: "v1", Resource: "serviceaccounts"}:                                             "ServiceAccountList",
		{Group: "", Version: "v1", Resource: "persistentvolumeclaims"}:                                      "PersistentVolumeClaimList",
		{Group: "", Version: "v1", Resource: "namespaces"}:                                                  "NamespaceList",
		{Group: "", Version: "v1", Resource: "nodes"}:                                                       "NodeList",
		{Group: "", Version: "v1", Resource: "events"}:                                                      "EventList",
		{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}:                                  "IngressList",
		{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"}:                            "NetworkPolicyList",
		{Group: "autoscaling", Version: "v2", Resource: "horizontalpodautoscalers"}:                         "HorizontalPodAutoscalerList",
		{Group: "policy", Version: "v1", Resource: "poddisruptionbudgets"}:                                  "PodDisruptionBudgetList",
		{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "roles"}:                              "RoleList",
		{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "rolebindings"}:                       "RoleBindingList",
		{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterroles"}:                       "ClusterRoleList",
		{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterrolebindings"}:                "ClusterRoleBindingList",
		{Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"}:               "CustomResourceDefinitionList",
		{Group: "admissionregistration.k8s.io", Version: "v1", Resource: "validatingwebhookconfigurations"}: "ValidatingWebhookConfigurationList",
		{Group: "admissionregistration.k8s.io", Version: "v1", Resource: "mutatingwebhookconfigurations"}:   "MutatingWebhookConfigurationList",
		{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "gateways"}:                           "GatewayList",
		{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "httproutes"}:                         "HTTPRouteList",
	}
}

// NewFakeDynamicClient creates a fake dynamic client with the standard GVR map
// and optional pre-populated objects.
func NewFakeDynamicClient(objects ...runtime.Object) *dynamicfake.FakeDynamicClient {
	scheme := runtime.NewScheme()
	return dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, BuildGVRMap(), objects...)
}

// TestContextWithDeadline returns a context with a short deadline for tests.
// Use this to prevent tests from hanging if code has infinite retries.
func TestContextWithDeadline() (context.Context, context.CancelFunc) {
	const testDefaultTimeoutSeconds = 10
	return context.WithTimeout(context.Background(), testDefaultTimeoutSeconds*time.Second)
}
