package k8s

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestEnsureNamespaceExists(t *testing.T) {
	ctx := context.Background()
	clientset := k8sfake.NewSimpleClientset()
	client := &MultiClusterClient{clients: map[string]kubernetes.Interface{"ctx": clientset}}

	require.NoError(t, client.EnsureNamespaceExists(ctx, "ctx", "demo"))

	ns, err := clientset.CoreV1().Namespaces().Get(ctx, "demo", metav1.GetOptions{})
	require.NoError(t, err)
	require.Equal(t, "kubestellar-console", ns.Labels["kubestellar.io/managed-by"])

	require.NoError(t, client.EnsureNamespaceExists(ctx, "ctx", "demo"))
	list, err := clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	require.NoError(t, err)
	require.Len(t, list.Items, 1)
}

func TestLoadConfigWithInClusterFallback(t *testing.T) {
	kubeconfigPath := filepath.Join(t.TempDir(), "missing-config")
	client := &MultiClusterClient{
		kubeconfig:       kubeconfigPath,
		inClusterConfig:  &rest.Config{Host: "https://cluster.example"},
		clients:          map[string]kubernetes.Interface{"stale": k8sfake.NewSimpleClientset()},
		dynamicClients:   map[string]dynamic.Interface{},
		configs:          map[string]*rest.Config{"stale": {Host: "https://stale.example"}},
		healthCache:      map[string]*ClusterHealth{"stale": {Cluster: "stale"}},
		cacheTime:        map[string]time.Time{"stale": time.Now()},
		slowClusters:     map[string]time.Time{},
	}

	require.NoError(t, client.LoadConfig())
	require.Nil(t, client.rawConfig)
	require.False(t, client.noClusterMode)
	require.Empty(t, client.clients)
	require.Empty(t, client.configs)
	require.True(t, client.HasClusterConfig())
}

func TestLoadConfigWithoutAnyClusterConfigReturnsSentinel(t *testing.T) {
	client := &MultiClusterClient{kubeconfig: filepath.Join(t.TempDir(), "missing-config")}

	err := client.LoadConfig()
	require.ErrorIs(t, err, ErrNoClusterConfigured)
	require.True(t, client.noClusterMode)
	require.False(t, client.HasClusterConfig())
}

func TestRemoveContextRemovesUnusedEntries(t *testing.T) {
	kubeconfigPath := filepath.Join(t.TempDir(), "config")
	config := api.NewConfig()
	config.CurrentContext = "keep"
	config.Contexts["keep"] = &api.Context{Cluster: "shared-cluster", AuthInfo: "shared-user"}
	config.Contexts["remove"] = &api.Context{Cluster: "remove-cluster", AuthInfo: "remove-user"}
	config.Clusters["shared-cluster"] = &api.Cluster{Server: "https://shared.example"}
	config.Clusters["remove-cluster"] = &api.Cluster{Server: "https://remove.example"}
	config.AuthInfos["shared-user"] = &api.AuthInfo{Token: "shared-token"}
	config.AuthInfos["remove-user"] = &api.AuthInfo{Token: "remove-token"}
	require.NoError(t, clientcmd.WriteToFile(*config, kubeconfigPath))

	client := &MultiClusterClient{
		kubeconfig:     kubeconfigPath,
		clients:        map[string]kubernetes.Interface{"remove": k8sfake.NewSimpleClientset()},
		dynamicClients: map[string]dynamic.Interface{},
		configs:        map[string]*rest.Config{"remove": {Host: "https://remove.example"}},
		healthCache:    map[string]*ClusterHealth{"remove": {Cluster: "remove"}},
		cacheTime:      map[string]time.Time{"remove": time.Now()},
	}

	require.NoError(t, client.RemoveContext("remove"))

	updated, err := clientcmd.LoadFromFile(kubeconfigPath)
	require.NoError(t, err)
	require.Contains(t, updated.Contexts, "keep")
	require.NotContains(t, updated.Contexts, "remove")
	require.Contains(t, updated.Clusters, "shared-cluster")
	require.NotContains(t, updated.Clusters, "remove-cluster")
	require.Contains(t, updated.AuthInfos, "shared-user")
	require.NotContains(t, updated.AuthInfos, "remove-user")
	require.NotContains(t, client.clients, "remove")
	require.NotContains(t, client.configs, "remove")
}

func TestClusterNameFromAPIURL(t *testing.T) {
	require.Equal(t, "fmaas-vllm-d", clusterNameFromAPIURL("https://api.fmaas-vllm-d.example.com:6443"))
	require.Equal(t, "plain-host", clusterNameFromAPIURL("plain-host:6443"))
}
