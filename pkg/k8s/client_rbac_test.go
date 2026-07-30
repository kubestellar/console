package k8s

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

func TestGetServiceAccounts_ParsesSecretsAndMetadata(t *testing.T) {
	sa := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "builder",
			Namespace:         "team-a",
			CreationTimestamp: metav1.NewTime(time.Now().Add(-(2*time.Hour + 10*time.Minute))),
			Labels:            map[string]string{"team": "platform"},
			Annotations:       map[string]string{"owner": "rbac-admin"},
		},
		Secrets:          []corev1.ObjectReference{{Name: "builder-token"}, {Name: "builder-dockercfg"}},
		ImagePullSecrets: []corev1.LocalObjectReference{{Name: "registry-creds"}},
	}

	client := &MultiClusterClient{}
	client.SetClient("cluster-a", k8sfake.NewSimpleClientset(sa))

	serviceAccounts, err := client.GetServiceAccounts(context.Background(), "cluster-a", "team-a")
	require.NoError(t, err)
	require.Len(t, serviceAccounts, 1)

	info := serviceAccounts[0]
	assert.Equal(t, "builder", info.Name)
	assert.Equal(t, "team-a", info.Namespace)
	assert.Equal(t, "cluster-a", info.Cluster)
	assert.Equal(t, []string{"builder-token", "builder-dockercfg"}, info.Secrets)
	assert.Equal(t, []string{"registry-creds"}, info.ImagePullSecrets)
	assert.Equal(t, "2h", info.Age)
	assert.Equal(t, "platform", info.Labels["team"])
	assert.Equal(t, "rbac-admin", info.Annotations["owner"])
}
