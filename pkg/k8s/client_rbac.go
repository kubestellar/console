package k8s

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ServiceAccount represents a Kubernetes ServiceAccount
type ServiceAccount struct {
	Name             string            `json:"name"`
	Namespace        string            `json:"namespace"`
	Cluster          string            `json:"cluster,omitempty"`
	Secrets          []string          `json:"secrets,omitempty"`
	ImagePullSecrets []string          `json:"imagePullSecrets,omitempty"`
	Age              string            `json:"age,omitempty"`
	Labels           map[string]string `json:"labels,omitempty"`
	Annotations      map[string]string `json:"annotations,omitempty"`
}

// GetServiceAccounts returns ServiceAccounts from a cluster
func (m *MultiClusterClient) GetServiceAccounts(ctx context.Context, contextName, namespace string) ([]ServiceAccount, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	serviceAccounts, err := client.CoreV1().ServiceAccounts(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ServiceAccount
	for _, sa := range serviceAccounts.Items {
		// Calculate age
		age := formatAge(sa.CreationTimestamp.Time)

		// Get secret names
		var secrets []string
		for _, s := range sa.Secrets {
			secrets = append(secrets, s.Name)
		}

		// Get image pull secret names
		var imagePullSecrets []string
		for _, s := range sa.ImagePullSecrets {
			imagePullSecrets = append(imagePullSecrets, s.Name)
		}

		result = append(result, ServiceAccount{
			Name:             sa.Name,
			Namespace:        sa.Namespace,
			Cluster:          contextName,
			Secrets:          secrets,
			ImagePullSecrets: imagePullSecrets,
			Age:              age,
			Labels:           sa.Labels,
			Annotations:      sa.Annotations,
		})
	}

	return result, nil
}
