package k8s

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ConfigMap represents a Kubernetes ConfigMap
type ConfigMap struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	DataCount   int               `json:"dataCount"`
	Age         string            `json:"age,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
}

// Secret represents a Kubernetes Secret
type Secret struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	Type        string            `json:"type"`
	DataCount   int               `json:"dataCount"`
	Age         string            `json:"age,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
}

// ResourceQuota represents a Kubernetes ResourceQuota
type ResourceQuota struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	Hard        map[string]string `json:"hard"` // Resource limits
	Used        map[string]string `json:"used"` // Current usage
	Age         string            `json:"age,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"` // Reservation metadata
}

// LimitRange represents a Kubernetes LimitRange
type LimitRange struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Cluster   string            `json:"cluster,omitempty"`
	Limits    []LimitRangeItem  `json:"limits"`
	Age       string            `json:"age,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// LimitRangeItem represents a single limit in a LimitRange
type LimitRangeItem struct {
	Type           string            `json:"type"` // Pod, Container, PersistentVolumeClaim
	Default        map[string]string `json:"default,omitempty"`
	DefaultRequest map[string]string `json:"defaultRequest,omitempty"`
	Max            map[string]string `json:"max,omitempty"`
	Min            map[string]string `json:"min,omitempty"`
}

// GetConfigMaps returns all ConfigMaps in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetConfigMaps(ctx context.Context, contextName, namespace string) ([]ConfigMap, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	configmaps, err := client.CoreV1().ConfigMaps(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ConfigMap
	for _, cm := range configmaps.Items {
		// Calculate age
		age := formatAge(cm.CreationTimestamp.Time)

		result = append(result, ConfigMap{
			Name:        cm.Name,
			Namespace:   cm.Namespace,
			Cluster:     contextName,
			DataCount:   len(cm.Data) + len(cm.BinaryData),
			Age:         age,
			Labels:      cm.Labels,
			Annotations: cm.Annotations,
		})
	}

	return result, nil
}

// GetSecrets returns all Secrets in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetSecrets(ctx context.Context, contextName, namespace string) ([]Secret, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	secrets, err := client.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Secret
	for _, secret := range secrets.Items {
		// Calculate age
		age := formatAge(secret.CreationTimestamp.Time)

		result = append(result, Secret{
			Name:        secret.Name,
			Namespace:   secret.Namespace,
			Cluster:     contextName,
			Type:        string(secret.Type),
			DataCount:   len(secret.Data),
			Age:         age,
			Labels:      secret.Labels,
			Annotations: secret.Annotations,
		})
	}

	return result, nil
}

// GetResourceQuotas returns all ResourceQuotas in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetResourceQuotas(ctx context.Context, contextName, namespace string) ([]ResourceQuota, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	quotas, err := client.CoreV1().ResourceQuotas(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ResourceQuota
	for _, quota := range quotas.Items {
		age := formatAge(quota.CreationTimestamp.Time)

		// Convert resource quantities to strings
		hard := make(map[string]string)
		for name, quantity := range quota.Status.Hard {
			hard[string(name)] = quantity.String()
		}

		used := make(map[string]string)
		for name, quantity := range quota.Status.Used {
			used[string(name)] = quantity.String()
		}

		result = append(result, ResourceQuota{
			Name:        quota.Name,
			Namespace:   quota.Namespace,
			Cluster:     contextName,
			Hard:        hard,
			Used:        used,
			Age:         age,
			Labels:      quota.Labels,
			Annotations: quota.Annotations,
		})
	}

	return result, nil
}

// GetLimitRanges returns all LimitRanges in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetLimitRanges(ctx context.Context, contextName, namespace string) ([]LimitRange, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	limitRanges, err := client.CoreV1().LimitRanges(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []LimitRange
	for _, lr := range limitRanges.Items {
		age := formatAge(lr.CreationTimestamp.Time)

		var limits []LimitRangeItem
		for _, limit := range lr.Spec.Limits {
			item := LimitRangeItem{
				Type: string(limit.Type),
			}

			// Convert Default
			if limit.Default != nil {
				item.Default = make(map[string]string)
				for name, quantity := range limit.Default {
					item.Default[string(name)] = quantity.String()
				}
			}

			// Convert DefaultRequest
			if limit.DefaultRequest != nil {
				item.DefaultRequest = make(map[string]string)
				for name, quantity := range limit.DefaultRequest {
					item.DefaultRequest[string(name)] = quantity.String()
				}
			}

			// Convert Max
			if limit.Max != nil {
				item.Max = make(map[string]string)
				for name, quantity := range limit.Max {
					item.Max[string(name)] = quantity.String()
				}
			}

			// Convert Min
			if limit.Min != nil {
				item.Min = make(map[string]string)
				for name, quantity := range limit.Min {
					item.Min[string(name)] = quantity.String()
				}
			}

			limits = append(limits, item)
		}

		result = append(result, LimitRange{
			Name:      lr.Name,
			Namespace: lr.Namespace,
			Cluster:   contextName,
			Limits:    limits,
			Age:       age,
			Labels:    lr.Labels,
		})
	}

	return result, nil
}

// ResourceQuotaSpec represents the desired spec for creating/updating a ResourceQuota
type ResourceQuotaSpec struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Hard        map[string]string `json:"hard"` // Resource limits to set
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"` // Reservation metadata
}

// CreateOrUpdateResourceQuota creates or updates a ResourceQuota in a namespace
func (m *MultiClusterClient) CreateOrUpdateResourceQuota(ctx context.Context, contextName string, spec ResourceQuotaSpec) (*ResourceQuota, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	// Convert string values to resource quantities
	hard := make(corev1.ResourceList)
	for name, value := range spec.Hard {
		quantity, err := resource.ParseQuantity(value)
		if err != nil {
			return nil, fmt.Errorf("invalid quantity for %s: %w", name, err)
		}
		hard[corev1.ResourceName(name)] = quantity
	}

	// Build the ResourceQuota object
	quota := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{
			Name:        spec.Name,
			Namespace:   spec.Namespace,
			Labels:      spec.Labels,
			Annotations: spec.Annotations,
		},
		Spec: corev1.ResourceQuotaSpec{
			Hard: hard,
		},
	}

	// Try to get existing quota first
	existing, err := client.CoreV1().ResourceQuotas(spec.Namespace).Get(ctx, spec.Name, metav1.GetOptions{})
	if err == nil {
		// Update existing quota
		existing.Spec.Hard = hard
		if spec.Labels != nil {
			existing.Labels = spec.Labels
		}
		if spec.Annotations != nil {
			if existing.Annotations == nil {
				existing.Annotations = make(map[string]string)
			}
			for k, v := range spec.Annotations {
				existing.Annotations[k] = v
			}
		}
		updated, err := client.CoreV1().ResourceQuotas(spec.Namespace).Update(ctx, existing, metav1.UpdateOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to update ResourceQuota: %w", err)
		}

		// Convert to our response type
		resultHard := make(map[string]string)
		for name, quantity := range updated.Status.Hard {
			resultHard[string(name)] = quantity.String()
		}
		used := make(map[string]string)
		for name, quantity := range updated.Status.Used {
			used[string(name)] = quantity.String()
		}

		return &ResourceQuota{
			Name:        updated.Name,
			Namespace:   updated.Namespace,
			Cluster:     contextName,
			Hard:        resultHard,
			Used:        used,
			Age:         formatAge(updated.CreationTimestamp.Time),
			Labels:      updated.Labels,
			Annotations: updated.Annotations,
		}, nil
	}

	// Create new quota
	created, err := client.CoreV1().ResourceQuotas(spec.Namespace).Create(ctx, quota, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create ResourceQuota: %w", err)
	}

	// Convert to our response type
	resultHard := make(map[string]string)
	for name, quantity := range created.Spec.Hard {
		resultHard[string(name)] = quantity.String()
	}

	return &ResourceQuota{
		Name:        created.Name,
		Namespace:   created.Namespace,
		Cluster:     contextName,
		Hard:        resultHard,
		Used:        make(map[string]string), // New quota has no usage yet
		Age:         formatAge(created.CreationTimestamp.Time),
		Labels:      created.Labels,
		Annotations: created.Annotations,
	}, nil
}

// DeleteResourceQuota deletes a ResourceQuota from a namespace
func (m *MultiClusterClient) DeleteResourceQuota(ctx context.Context, contextName, namespace, name string) error {
	client, err := m.GetClient(contextName)
	if err != nil {
		return err
	}

	err = client.CoreV1().ResourceQuotas(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete ResourceQuota: %w", err)
	}

	return nil
}
