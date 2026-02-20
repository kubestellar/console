package k8s

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
)

func TestConsoleResources(t *testing.T) {
	scheme := runtime.NewScheme()

	// Create dummy objects for each GVR to avoid List panics in fake dynamic client
	mw := &v1alpha1.ManagedWorkload{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "console.kubestellar.io/v1alpha1",
			Kind:       "ManagedWorkload",
		},
		ObjectMeta: metav1.ObjectMeta{Name: "mw1", Namespace: "default"},
	}
	mwU, _ := mw.ToUnstructured()

	cg := &v1alpha1.ClusterGroup{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "console.kubestellar.io/v1alpha1",
			Kind:       "ClusterGroup",
		},
		ObjectMeta: metav1.ObjectMeta{Name: "cg1", Namespace: "default"},
	}
	cgU, _ := cg.ToUnstructured()

	wd := &v1alpha1.WorkloadDeployment{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "console.kubestellar.io/v1alpha1",
			Kind:       "WorkloadDeployment",
		},
		ObjectMeta: metav1.ObjectMeta{Name: "wd1", Namespace: "default"},
	}
	wdU, _ := wd.ToUnstructured()

	fakeDyn := fake.NewSimpleDynamicClient(scheme, mwU, cgU, wdU)
	cp := NewConsolePersistence(fakeDyn)

	ctx := context.Background()
	ns := "default"

	// 1. Test EnsureNamespace
	err := cp.(*consolePersistenceImpl).EnsureNamespace(ctx, "new-ns")
	if err != nil {
		t.Fatalf("EnsureNamespace failed: %v", err)
	}

	// 2. Test ManagedWorkload CRUD
	listMW, err := cp.ListManagedWorkloads(ctx, ns)
	if err != nil || len(listMW) != 1 {
		t.Errorf("ListManagedWorkloads failed: %v, len=%d", err, len(listMW))
	}

	getMW, err := cp.GetManagedWorkload(ctx, ns, "mw1")
	if err != nil {
		t.Fatalf("GetManagedWorkload failed: %v", err)
	}
	if getMW == nil || getMW.Name != "mw1" {
		t.Errorf("GetManagedWorkload returned unexpected result: %v", getMW)
	}

	getMW.Labels = map[string]string{"foo": "bar"}
	updatedMW, err := cp.UpdateManagedWorkload(ctx, getMW)
	if err != nil || updatedMW == nil || updatedMW.Labels["foo"] != "bar" {
		t.Errorf("UpdateManagedWorkload failed: %v", err)
	}

	// 3. Test ClusterGroup CRUD
	listCG, err := cp.ListClusterGroups(ctx, ns)
	if err != nil || len(listCG) != 1 {
		t.Errorf("ListClusterGroups failed: %v", err)
	}

	// 4. Test WorkloadDeployment CRUD
	listWD, err := cp.ListWorkloadDeployments(ctx, ns)
	if err != nil || len(listWD) != 1 {
		t.Errorf("ListWorkloadDeployments failed: %v", err)
	}

	// Update Status
	respWD, err := cp.GetWorkloadDeployment(ctx, ns, "wd1")
	if err != nil || respWD == nil {
		t.Fatalf("GetWorkloadDeployment failed: %v", err)
	}
	respWD.Status.Phase = "Deployed"
	_, err = cp.UpdateWorkloadDeploymentStatus(ctx, respWD)
	if err != nil {
		t.Errorf("UpdateWorkloadDeploymentStatus failed: %v", err)
	}

	// Cleanup
	cp.DeleteManagedWorkload(ctx, ns, "mw1")
	cp.DeleteClusterGroup(ctx, ns, "cg1")
	cp.DeleteWorkloadDeployment(ctx, ns, "wd1")
}
