package k8s

import (
	"context"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// PVC represents a Kubernetes PersistentVolumeClaim
type PVC struct {
	Name         string            `json:"name"`
	Namespace    string            `json:"namespace"`
	Cluster      string            `json:"cluster,omitempty"`
	Status       string            `json:"status"`
	Capacity     string            `json:"capacity,omitempty"`
	StorageClass string            `json:"storageClass,omitempty"`
	VolumeName   string            `json:"volumeName,omitempty"`
	AccessModes  []string          `json:"accessModes,omitempty"`
	Age          string            `json:"age,omitempty"`
	Labels       map[string]string `json:"labels,omitempty"`
}

// PV represents a Kubernetes PersistentVolume
type PV struct {
	Name          string            `json:"name"`
	Cluster       string            `json:"cluster,omitempty"`
	Status        string            `json:"status"`
	Capacity      string            `json:"capacity,omitempty"`
	StorageClass  string            `json:"storageClass,omitempty"`
	ReclaimPolicy string            `json:"reclaimPolicy,omitempty"`
	AccessModes   []string          `json:"accessModes,omitempty"`
	ClaimRef      string            `json:"claimRef,omitempty"`
	VolumeMode    string            `json:"volumeMode,omitempty"`
	Age           string            `json:"age,omitempty"`
	Labels        map[string]string `json:"labels,omitempty"`
}

// GetPVCs returns all PersistentVolumeClaims in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetPVCs(ctx context.Context, contextName, namespace string) ([]PVC, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pvcs, err := client.CoreV1().PersistentVolumeClaims(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []PVC
	for _, pvc := range pvcs.Items {
		age := formatAge(pvc.CreationTimestamp.Time)

		// Get capacity
		var capacity string
		if pvc.Status.Capacity != nil {
			if storage, ok := pvc.Status.Capacity[corev1.ResourceStorage]; ok {
				capacity = storage.String()
			}
		}

		// Get access modes
		var accessModes []string
		for _, mode := range pvc.Spec.AccessModes {
			accessModes = append(accessModes, string(mode))
		}

		// Get storage class
		storageClass := ""
		if pvc.Spec.StorageClassName != nil {
			storageClass = *pvc.Spec.StorageClassName
		}

		result = append(result, PVC{
			Name:         pvc.Name,
			Namespace:    pvc.Namespace,
			Cluster:      contextName,
			Status:       string(pvc.Status.Phase),
			Capacity:     capacity,
			StorageClass: storageClass,
			VolumeName:   pvc.Spec.VolumeName,
			AccessModes:  accessModes,
			Age:          age,
			Labels:       pvc.Labels,
		})
	}

	return result, nil
}

// GetPVs returns all PersistentVolumes
func (m *MultiClusterClient) GetPVs(ctx context.Context, contextName string) ([]PV, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pvs, err := client.CoreV1().PersistentVolumes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []PV
	for _, pv := range pvs.Items {
		age := formatAge(pv.CreationTimestamp.Time)

		// Get capacity
		var capacity string
		if pv.Spec.Capacity != nil {
			if storage, ok := pv.Spec.Capacity[corev1.ResourceStorage]; ok {
				capacity = storage.String()
			}
		}

		// Get access modes
		var accessModes []string
		for _, mode := range pv.Spec.AccessModes {
			accessModes = append(accessModes, string(mode))
		}

		// Get claim reference
		claimRef := ""
		if pv.Spec.ClaimRef != nil {
			claimRef = pv.Spec.ClaimRef.Namespace + "/" + pv.Spec.ClaimRef.Name
		}

		// Get volume mode
		volumeMode := ""
		if pv.Spec.VolumeMode != nil {
			volumeMode = string(*pv.Spec.VolumeMode)
		}

		result = append(result, PV{
			Name:          pv.Name,
			Cluster:       contextName,
			Status:        string(pv.Status.Phase),
			Capacity:      capacity,
			StorageClass:  pv.Spec.StorageClassName,
			ReclaimPolicy: string(pv.Spec.PersistentVolumeReclaimPolicy),
			AccessModes:   accessModes,
			ClaimRef:      claimRef,
			VolumeMode:    volumeMode,
			Age:           age,
			Labels:        pv.Labels,
		})
	}

	return result, nil
}
