package k8s

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

const testStorageCluster = "storage-cluster"

func newStorageClient(clientset *k8sfake.Clientset) *MultiClusterClient {
	client := &MultiClusterClient{
		noClusterMode: true,
	}
	client.SetClient(testStorageCluster, clientset)
	return client
}

// --- GetPVCs tests ---

func TestGetPVCs_HappyPath(t *testing.T) {
	t.Parallel()

	now := time.Now().Add(-3 * time.Hour)
	volumeMode := corev1.PersistentVolumeFilesystem
	storageClass := "gp3"

	pvcs := []runtime.Object{
		&corev1.PersistentVolumeClaim{
			ObjectMeta: metav1.ObjectMeta{
				Name:              "data-pvc",
				Namespace:         "default",
				CreationTimestamp: metav1.NewTime(now),
				Labels:            map[string]string{"app": "db"},
			},
			Spec: corev1.PersistentVolumeClaimSpec{
				StorageClassName: &storageClass,
				VolumeName:       "pv-001",
				AccessModes:      []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
				VolumeMode:       &volumeMode,
			},
			Status: corev1.PersistentVolumeClaimStatus{
				Phase: corev1.ClaimBound,
				Capacity: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse("10Gi"),
				},
			},
		},
	}

	clientset := k8sfake.NewSimpleClientset(pvcs...)
	client := newStorageClient(clientset)

	result, err := client.GetPVCs(context.Background(), testStorageCluster, "default")

	require.NoError(t, err)
	require.Len(t, result, 1)

	pvc := result[0]
	assert.Equal(t, "data-pvc", pvc.Name)
	assert.Equal(t, "default", pvc.Namespace)
	assert.Equal(t, testStorageCluster, pvc.Cluster)
	assert.Equal(t, "Bound", pvc.Status)
	assert.Equal(t, "10Gi", pvc.Capacity)
	assert.Equal(t, "gp3", pvc.StorageClass)
	assert.Equal(t, "pv-001", pvc.VolumeName)
	assert.Equal(t, []string{"ReadWriteOnce"}, pvc.AccessModes)
	assert.NotEmpty(t, pvc.Age)
	assert.Equal(t, map[string]string{"app": "db"}, pvc.Labels)
}

func TestGetPVCs_AllNamespaces(t *testing.T) {
	t.Parallel()

	now := time.Now().Add(-1 * time.Hour)

	pvcs := []runtime.Object{
		&corev1.PersistentVolumeClaim{
			ObjectMeta: metav1.ObjectMeta{
				Name:              "pvc-a",
				Namespace:         "ns-a",
				CreationTimestamp: metav1.NewTime(now),
			},
			Spec: corev1.PersistentVolumeClaimSpec{
				AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteMany},
			},
			Status: corev1.PersistentVolumeClaimStatus{Phase: corev1.ClaimBound},
		},
		&corev1.PersistentVolumeClaim{
			ObjectMeta: metav1.ObjectMeta{
				Name:              "pvc-b",
				Namespace:         "ns-b",
				CreationTimestamp: metav1.NewTime(now),
			},
			Spec: corev1.PersistentVolumeClaimSpec{
				AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadOnlyMany},
			},
			Status: corev1.PersistentVolumeClaimStatus{Phase: corev1.ClaimPending},
		},
	}

	clientset := k8sfake.NewSimpleClientset(pvcs...)
	client := newStorageClient(clientset)

	// Empty namespace = all namespaces
	result, err := client.GetPVCs(context.Background(), testStorageCluster, "")

	require.NoError(t, err)
	require.Len(t, result, 2)

	// Verify both namespaces present
	namespaces := map[string]bool{}
	for _, p := range result {
		namespaces[p.Namespace] = true
	}
	assert.True(t, namespaces["ns-a"])
	assert.True(t, namespaces["ns-b"])
}

func TestGetPVCs_NoCapacity(t *testing.T) {
	t.Parallel()

	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "pending-pvc",
			Namespace:         "default",
			CreationTimestamp: metav1.NewTime(time.Now()),
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
		},
		Status: corev1.PersistentVolumeClaimStatus{
			Phase:    corev1.ClaimPending,
			Capacity: nil,
		},
	}

	clientset := k8sfake.NewSimpleClientset(pvc)
	client := newStorageClient(clientset)

	result, err := client.GetPVCs(context.Background(), testStorageCluster, "default")

	require.NoError(t, err)
	require.Len(t, result, 1)
	assert.Equal(t, "", result[0].Capacity)
	assert.Equal(t, "Pending", result[0].Status)
}

func TestGetPVCs_NilStorageClass(t *testing.T) {
	t.Parallel()

	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "no-sc-pvc",
			Namespace:         "default",
			CreationTimestamp: metav1.NewTime(time.Now()),
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			StorageClassName: nil,
			AccessModes:      []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
		},
		Status: corev1.PersistentVolumeClaimStatus{Phase: corev1.ClaimBound},
	}

	clientset := k8sfake.NewSimpleClientset(pvc)
	client := newStorageClient(clientset)

	result, err := client.GetPVCs(context.Background(), testStorageCluster, "default")

	require.NoError(t, err)
	require.Len(t, result, 1)
	assert.Equal(t, "", result[0].StorageClass)
}

func TestGetPVCs_InvalidCluster(t *testing.T) {
	t.Parallel()

	clientset := k8sfake.NewSimpleClientset()
	client := newStorageClient(clientset)

	_, err := client.GetPVCs(context.Background(), "nonexistent-cluster", "default")
	assert.Error(t, err)
}

func TestGetPVCs_ListError(t *testing.T) {
	t.Parallel()

	clientset := k8sfake.NewSimpleClientset()
	clientset.PrependReactor("list", "persistentvolumeclaims", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("forbidden")
	})

	client := newStorageClient(clientset)

	_, err := client.GetPVCs(context.Background(), testStorageCluster, "default")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "forbidden")
}

func TestGetPVCs_MultipleAccessModes(t *testing.T) {
	t.Parallel()

	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "multi-mode-pvc",
			Namespace:         "default",
			CreationTimestamp: metav1.NewTime(time.Now()),
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{
				corev1.ReadWriteOnce,
				corev1.ReadOnlyMany,
			},
		},
		Status: corev1.PersistentVolumeClaimStatus{Phase: corev1.ClaimBound},
	}

	clientset := k8sfake.NewSimpleClientset(pvc)
	client := newStorageClient(clientset)

	result, err := client.GetPVCs(context.Background(), testStorageCluster, "default")

	require.NoError(t, err)
	require.Len(t, result, 1)
	assert.Equal(t, []string{"ReadWriteOnce", "ReadOnlyMany"}, result[0].AccessModes)
}

// --- GetPVs tests ---

func TestGetPVs_HappyPath(t *testing.T) {
	t.Parallel()

	now := time.Now().Add(-24 * time.Hour)
	volumeMode := corev1.PersistentVolumeFilesystem

	pvs := []runtime.Object{
		&corev1.PersistentVolume{
			ObjectMeta: metav1.ObjectMeta{
				Name:              "pv-001",
				CreationTimestamp: metav1.NewTime(now),
				Labels:            map[string]string{"tier": "standard"},
			},
			Spec: corev1.PersistentVolumeSpec{
				Capacity: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse("50Gi"),
				},
				StorageClassName:              "gp3",
				PersistentVolumeReclaimPolicy: corev1.PersistentVolumeReclaimRetain,
				AccessModes:                   []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
				VolumeMode:                    &volumeMode,
				ClaimRef: &corev1.ObjectReference{
					Namespace: "default",
					Name:      "data-pvc",
				},
			},
			Status: corev1.PersistentVolumeStatus{
				Phase: corev1.VolumeBound,
			},
		},
	}

	clientset := k8sfake.NewSimpleClientset(pvs...)
	client := newStorageClient(clientset)

	result, err := client.GetPVs(context.Background(), testStorageCluster)

	require.NoError(t, err)
	require.Len(t, result, 1)

	pv := result[0]
	assert.Equal(t, "pv-001", pv.Name)
	assert.Equal(t, testStorageCluster, pv.Cluster)
	assert.Equal(t, "Bound", pv.Status)
	assert.Equal(t, "50Gi", pv.Capacity)
	assert.Equal(t, "gp3", pv.StorageClass)
	assert.Equal(t, "Retain", pv.ReclaimPolicy)
	assert.Equal(t, []string{"ReadWriteOnce"}, pv.AccessModes)
	assert.Equal(t, "default/data-pvc", pv.ClaimRef)
	assert.Equal(t, "Filesystem", pv.VolumeMode)
	assert.NotEmpty(t, pv.Age)
	assert.Equal(t, map[string]string{"tier": "standard"}, pv.Labels)
}

func TestGetPVs_NilClaimRef(t *testing.T) {
	t.Parallel()

	pv := &corev1.PersistentVolume{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "pv-available",
			CreationTimestamp: metav1.NewTime(time.Now()),
		},
		Spec: corev1.PersistentVolumeSpec{
			Capacity: corev1.ResourceList{
				corev1.ResourceStorage: resource.MustParse("20Gi"),
			},
			StorageClassName:              "standard",
			PersistentVolumeReclaimPolicy: corev1.PersistentVolumeReclaimDelete,
			AccessModes:                   []corev1.PersistentVolumeAccessMode{corev1.ReadWriteMany},
			ClaimRef:                      nil,
		},
		Status: corev1.PersistentVolumeStatus{
			Phase: corev1.VolumeAvailable,
		},
	}

	clientset := k8sfake.NewSimpleClientset(pv)
	client := newStorageClient(clientset)

	result, err := client.GetPVs(context.Background(), testStorageCluster)

	require.NoError(t, err)
	require.Len(t, result, 1)
	assert.Equal(t, "", result[0].ClaimRef)
	assert.Equal(t, "Available", result[0].Status)
}

func TestGetPVs_NilVolumeMode(t *testing.T) {
	t.Parallel()

	pv := &corev1.PersistentVolume{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "pv-no-mode",
			CreationTimestamp: metav1.NewTime(time.Now()),
		},
		Spec: corev1.PersistentVolumeSpec{
			Capacity: corev1.ResourceList{
				corev1.ResourceStorage: resource.MustParse("5Gi"),
			},
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			VolumeMode:  nil,
		},
		Status: corev1.PersistentVolumeStatus{Phase: corev1.VolumeBound},
	}

	clientset := k8sfake.NewSimpleClientset(pv)
	client := newStorageClient(clientset)

	result, err := client.GetPVs(context.Background(), testStorageCluster)

	require.NoError(t, err)
	require.Len(t, result, 1)
	assert.Equal(t, "", result[0].VolumeMode)
}

func TestGetPVs_NilCapacity(t *testing.T) {
	t.Parallel()

	pv := &corev1.PersistentVolume{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "pv-no-cap",
			CreationTimestamp: metav1.NewTime(time.Now()),
		},
		Spec: corev1.PersistentVolumeSpec{
			Capacity:    nil,
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
		},
		Status: corev1.PersistentVolumeStatus{Phase: corev1.VolumeAvailable},
	}

	clientset := k8sfake.NewSimpleClientset(pv)
	client := newStorageClient(clientset)

	result, err := client.GetPVs(context.Background(), testStorageCluster)

	require.NoError(t, err)
	require.Len(t, result, 1)
	assert.Equal(t, "", result[0].Capacity)
}

func TestGetPVs_InvalidCluster(t *testing.T) {
	t.Parallel()

	clientset := k8sfake.NewSimpleClientset()
	client := newStorageClient(clientset)

	_, err := client.GetPVs(context.Background(), "nonexistent-cluster")
	assert.Error(t, err)
}

func TestGetPVs_ListError(t *testing.T) {
	t.Parallel()

	clientset := k8sfake.NewSimpleClientset()
	clientset.PrependReactor("list", "persistentvolumes", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("server timeout")
	})

	client := newStorageClient(clientset)

	_, err := client.GetPVs(context.Background(), testStorageCluster)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "server timeout")
}

func TestGetPVs_MultipleVolumes(t *testing.T) {
	t.Parallel()

	now := time.Now()
	blockMode := corev1.PersistentVolumeBlock

	pvs := []runtime.Object{
		&corev1.PersistentVolume{
			ObjectMeta: metav1.ObjectMeta{
				Name:              "pv-fs",
				CreationTimestamp: metav1.NewTime(now),
			},
			Spec: corev1.PersistentVolumeSpec{
				Capacity: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse("100Gi"),
				},
				AccessModes:                   []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
				PersistentVolumeReclaimPolicy: corev1.PersistentVolumeReclaimRetain,
			},
			Status: corev1.PersistentVolumeStatus{Phase: corev1.VolumeBound},
		},
		&corev1.PersistentVolume{
			ObjectMeta: metav1.ObjectMeta{
				Name:              "pv-block",
				CreationTimestamp: metav1.NewTime(now),
			},
			Spec: corev1.PersistentVolumeSpec{
				Capacity: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse("200Gi"),
				},
				AccessModes:                   []corev1.PersistentVolumeAccessMode{corev1.ReadWriteMany},
				VolumeMode:                    &blockMode,
				PersistentVolumeReclaimPolicy: corev1.PersistentVolumeReclaimDelete,
			},
			Status: corev1.PersistentVolumeStatus{Phase: corev1.VolumeAvailable},
		},
	}

	clientset := k8sfake.NewSimpleClientset(pvs...)
	client := newStorageClient(clientset)

	result, err := client.GetPVs(context.Background(), testStorageCluster)

	require.NoError(t, err)
	require.Len(t, result, 2)

	// Find each PV by name
	pvMap := map[string]PV{}
	for _, p := range result {
		pvMap[p.Name] = p
	}

	assert.Equal(t, "100Gi", pvMap["pv-fs"].Capacity)
	assert.Equal(t, "Retain", pvMap["pv-fs"].ReclaimPolicy)
	assert.Equal(t, "", pvMap["pv-fs"].VolumeMode)

	assert.Equal(t, "200Gi", pvMap["pv-block"].Capacity)
	assert.Equal(t, "Block", pvMap["pv-block"].VolumeMode)
	assert.Equal(t, "Delete", pvMap["pv-block"].ReclaimPolicy)
	assert.Equal(t, []string{"ReadWriteMany"}, pvMap["pv-block"].AccessModes)
}
