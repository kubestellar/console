package k8s

import (
	"context"
	"sort"
	"testing"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestGetClient_ReturnsInjectedClient(t *testing.T) {
	m, err := NewMultiClusterClient("")
	if err != nil {
		t.Fatalf("NewMultiClusterClient failed: %v", err)
	}

	fakeClient := k8sfake.NewSimpleClientset()
	m.clients["test-ctx"] = fakeClient

	retrieved, err := m.GetClient("test-ctx")
	if err != nil {
		t.Fatalf("GetClient failed: %v", err)
	}

	if retrieved != fakeClient {
		t.Error("GetClient did not return the injected client")
	}
}

func TestMultiClusterClient_ListClusters(t *testing.T) {
	// Setup a config with multiple contexts
	rawConfig := &api.Config{
		CurrentContext: "cluster-1",
		Contexts: map[string]*api.Context{
			"cluster-1": {Cluster: "c1", AuthInfo: "u1"},
			"cluster-2": {Cluster: "c2", AuthInfo: "u2"},
		},
		Clusters: map[string]*api.Cluster{
			"c1": {Server: "https://c1.com"},
			"c2": {Server: "https://c2.com"},
		},
		AuthInfos: map[string]*api.AuthInfo{
			"u1": {Username: "admin"},
			"u2": {Username: "dev"},
		},
	}

	m := &MultiClusterClient{
		rawConfig: rawConfig,
		clients:   make(map[string]kubernetes.Interface),
	}

	clusters, err := m.ListClusters(context.Background())
	if err != nil {
		t.Fatalf("ListClusters failed: %v", err)
	}

	if len(clusters) != 2 {
		t.Fatalf("Got %d clusters, want 2", len(clusters))
	}

	// Validate sorting and content
	// "cluster-1" comes before "cluster-2" alphabetically
	if clusters[0].Name != "cluster-1" {
		t.Errorf("Expected first cluster to be cluster-1, got %s", clusters[0].Name)
	}
	if !clusters[0].IsCurrent {
		t.Error("Expected cluster-1 to be current")
	}
	if clusters[0].Server != "https://c1.com" {
		t.Errorf("Expected server https://c1.com, got %s", clusters[0].Server)
	}
}

func TestMultiClusterClient_DeduplicatedClusters(t *testing.T) {
	rawConfig := &api.Config{
		Contexts: map[string]*api.Context{
			"short-name":                      {Cluster: "c1"},
			"long/auto/generated/name/for/c1": {Cluster: "c1"},
			"unique-cluster":                  {Cluster: "c2"},
		},
		Clusters: map[string]*api.Cluster{
			"c1": {Server: "https://shared.com"},
			"c2": {Server: "https://unique.com"},
		},
	}

	m := &MultiClusterClient{
		rawConfig: rawConfig,
		clients:   make(map[string]kubernetes.Interface),
	}

	clusters, err := m.DeduplicatedClusters(context.Background())
	if err != nil {
		t.Fatalf("DeduplicatedClusters failed: %v", err)
	}

	if len(clusters) != 2 {
		t.Fatalf("Expected 2 unique clusters, got %d", len(clusters))
	}

	// Verify that the short name was picked for the duplicate server
	names := []string{clusters[0].Name, clusters[1].Name}
	sort.Strings(names)

	if names[0] != "short-name" {
		t.Errorf("Expected 'short-name' to be preserved, got %v", names)
	}
	if names[1] != "unique-cluster" {
		t.Errorf("Expected 'unique-cluster' to be preserved, got %v", names)
	}
}

func TestMultiClusterClient_GetDynamicClient(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	fakeDyn := fake.NewSimpleDynamicClient(runScheme())
	m.dynamicClients["test-dyn"] = fakeDyn

	retrieved, err := m.GetDynamicClient("test-dyn")
	if err != nil {
		t.Fatalf("GetDynamicClient failed: %v", err)
	}
	if retrieved != fakeDyn {
		t.Error("GetDynamicClient did not return injected client")
	}
}

func TestMultiClusterClient_Concurrency(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.clients["ctx"] = k8sfake.NewSimpleClientset()

	// Simulate concurrent access
	concurrency := 10
	errCh := make(chan error, concurrency)

	for i := 0; i < concurrency; i++ {
		go func() {
			_, err := m.GetClient("ctx")
			errCh <- err
		}()
	}

	for i := 0; i < concurrency; i++ {
		err := <-errCh
		if err != nil {
			t.Errorf("Concurrent GetClient failed: %v", err)
		}
	}
}

func TestIsBetterClusterName(t *testing.T) {
	tests := []struct {
		candidate string
		current   string
		want      bool
	}{
		{"short", "long/complicated/name:port", true},
		{"long/complicated/name:port", "short", false},
		{"abc", "defg", true},
		{"defg", "abc", false},
	}

	for _, tt := range tests {
		if got := isBetterClusterName(tt.candidate, tt.current); got != tt.want {
			t.Errorf("isBetterClusterName(%q, %q) = %v, want %v", tt.candidate, tt.current, got, tt.want)
		}
	}
}

func TestMultiClusterClient_InCluster(t *testing.T) {
	m := &MultiClusterClient{
		inClusterConfig: &rest.Config{Host: "https://kubernetes.default"},
	}

	if !m.IsInCluster() {
		t.Error("Msg IsInCluster() should range true when inClusterConfig is set")
	}

	clusters, _ := m.ListClusters(context.Background())
	found := false
	for _, c := range clusters {
		if c.Name == "in-cluster" {
			found = true
			if c.Server != "https://kubernetes.default" {
				t.Errorf("In-cluster server mismatch: %s", c.Server)
			}
		}
	}
	if !found {
		t.Error("ListClusters did not return in-cluster config")
	}
}

func TestGetNodes(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "node1",
			Labels: map[string]string{
				"node-role.kubernetes.io/control-plane": "",
				"topology.kubernetes.io/region":         "us-east-1",
			},
		},
		Status: corev1.NodeStatus{
			NodeInfo: corev1.NodeSystemInfo{
				KubeletVersion: "v1.28.0",
				Architecture:   "amd64",
			},
			Addresses: []corev1.NodeAddress{
				{Type: corev1.NodeInternalIP, Address: "10.0.0.1"},
			},
			Capacity: corev1.ResourceList{
				corev1.ResourceCPU: resource.MustParse("4"),
			},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(node)
	m.clients["c1"] = fakeCS

	nodes, err := m.GetNodes(context.Background(), "c1")
	if err != nil {
		t.Fatalf("GetNodes failed: %v", err)
	}

	if len(nodes) != 1 {
		t.Fatalf("Expected 1 node, got %d", len(nodes))
	}

	if nodes[0].Name != "node1" {
		t.Errorf("Expected node1, got %s", nodes[0].Name)
	}
	if nodes[0].InternalIP != "10.0.0.1" {
		t.Errorf("Expected 10.0.0.1, got %s", nodes[0].InternalIP)
	}
	if len(nodes[0].Roles) != 1 || nodes[0].Roles[0] != "control-plane" {
		t.Errorf("Expected control-plane role, got %v", nodes[0].Roles)
	}
}

func TestGetPods(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "pod1",
			Namespace: "default",
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{Name: "c1", Image: "nginx"},
			},
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{
				{Name: "c1", Ready: true, RestartCount: 2},
			},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(pod)
	m.clients["c1"] = fakeCS

	pods, err := m.GetPods(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetPods failed: %v", err)
	}

	if len(pods) != 1 {
		t.Fatalf("Expected 1 pod, got %d", len(pods))
	}
	if pods[0].Name != "pod1" {
		t.Errorf("Expected pod1, got %s", pods[0].Name)
	}
	if pods[0].Restarts != 2 {
		t.Errorf("Expected 2 restarts, got %d", pods[0].Restarts)
	}
}

func TestGetEvents(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	event := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "event1",
			Namespace: "default",
		},
		InvolvedObject: corev1.ObjectReference{
			Kind: "Pod",
			Name: "pod1",
		},
		Reason:        "Started",
		Message:       "Started container",
		LastTimestamp: metav1.Time{Time: time.Now()},
	}

	fakeCS := k8sfake.NewSimpleClientset(event)
	m.clients["c1"] = fakeCS

	events, err := m.GetEvents(context.Background(), "c1", "default", 10)
	if err != nil {
		t.Fatalf("GetEvents failed: %v", err)
	}

	if len(events) != 1 {
		t.Fatalf("Expected 1 event, got %d", len(events))
	}
	if events[0].Reason != "Started" {
		t.Errorf("Expected Started reason, got %s", events[0].Reason)
	}
}

func TestGetClusterHealth(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node1"},
		Status: corev1.NodeStatus{
			Conditions: []corev1.NodeCondition{
				{Type: corev1.NodeReady, Status: corev1.ConditionTrue},
			},
			Allocatable: corev1.ResourceList{
				corev1.ResourceCPU: resource.MustParse("2"),
			},
		},
	}

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod1", Namespace: "default"},
		Status:     corev1.PodStatus{Phase: corev1.PodRunning},
	}

	fakeCS := k8sfake.NewSimpleClientset(node, pod)
	m.clients["c1"] = fakeCS

	health, err := m.GetClusterHealth(context.Background(), "c1")
	if err != nil {
		t.Fatalf("GetClusterHealth failed: %v", err)
	}

	if !health.Healthy {
		t.Error("Expected cluster to be healthy")
	}
	if health.NodeCount != 1 || health.ReadyNodes != 1 {
		t.Errorf("Node counts mismatch: %+v", health)
	}
	if health.PodCount != 1 {
		t.Errorf("Pod count mismatch: %d", health.PodCount)
	}
}

func TestGetDeployments(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	replicas := int32(3)
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "dep1",
			Namespace:         "default",
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-10 * time.Minute)},
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{Image: "nginx"}},
				},
			},
		},
		Status: appsv1.DeploymentStatus{
			ReadyReplicas: 3,
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(dep)
	m.clients["c1"] = fakeCS

	deps, err := m.GetDeployments(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetDeployments failed: %v", err)
	}

	if len(deps) != 1 {
		t.Fatalf("Expected 1 deployment, got %d", len(deps))
	}
	if deps[0].Name != "dep1" {
		t.Errorf("Expected dep1, got %s", deps[0].Name)
	}
	if deps[0].Status != "running" {
		t.Errorf("Expected running status, got %s", deps[0].Status)
	}
}

func TestGetServices(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "svc1", Namespace: "default"},
		Spec: corev1.ServiceSpec{
			Type:  corev1.ServiceTypeClusterIP,
			Ports: []corev1.ServicePort{{Port: 80}},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(svc)
	m.clients["c1"] = fakeCS

	svcs, err := m.GetServices(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetServices failed: %v", err)
	}

	if len(svcs) != 1 {
		t.Fatalf("Expected 1 service, got %d", len(svcs))
	}
	if svcs[0].Name != "svc1" {
		t.Errorf("Expected svc1, got %s", svcs[0].Name)
	}
	if svcs[0].Type != "ClusterIP" {
		t.Errorf("Expected ClusterIP, got %s", svcs[0].Type)
	}
}

func TestGetJobs(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "job1",
			Namespace:         "default",
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-5 * time.Minute)},
		},
		Status: batchv1.JobStatus{
			Succeeded:      1,
			StartTime:      &metav1.Time{Time: time.Now().Add(-5 * time.Minute)},
			CompletionTime: &metav1.Time{Time: time.Now().Add(-4 * time.Minute)},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(job)
	m.clients["c1"] = fakeCS

	jobs, err := m.GetJobs(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetJobs failed: %v", err)
	}

	if len(jobs) != 1 {
		t.Fatalf("Expected 1 job, got %d", len(jobs))
	}
	if jobs[0].Status != "Complete" {
		t.Errorf("Expected Complete status, got %s", jobs[0].Status)
	}
}

func TestGetHPAs(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	hpa := &autoscalingv2.HorizontalPodAutoscaler{
		ObjectMeta: metav1.ObjectMeta{Name: "hpa1", Namespace: "default"},
		Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
			ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
				Kind: "Deployment",
				Name: "dep1",
			},
			MaxReplicas: 10,
		},
		Status: autoscalingv2.HorizontalPodAutoscalerStatus{
			CurrentReplicas: 5,
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(hpa)
	m.clients["c1"] = fakeCS

	hpas, err := m.GetHPAs(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetHPAs failed: %v", err)
	}

	if len(hpas) != 1 {
		t.Fatalf("Expected 1 HPA, got %d", len(hpas))
	}
}

func TestGetConfigMapsAndSecrets(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "cm1", Namespace: "default"},
	}
	sec := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "sec1", Namespace: "default"},
	}

	fakeCS := k8sfake.NewSimpleClientset(cm, sec)
	m.clients["c1"] = fakeCS

	cms, _ := m.GetConfigMaps(context.Background(), "c1", "default")
	if len(cms) != 1 {
		t.Errorf("Expected 1 CM, got %d", len(cms))
	}

	secs, _ := m.GetSecrets(context.Background(), "c1", "default")
	if len(secs) != 1 {
		t.Errorf("Expected 1 Secret, got %d", len(secs))
	}
}

func TestGetStatefulSetsAndDaemonSets(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	sts := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{Name: "sts1", Namespace: "default"},
	}
	ds := &appsv1.DaemonSet{
		ObjectMeta: metav1.ObjectMeta{Name: "ds1", Namespace: "default"},
	}

	fakeCS := k8sfake.NewSimpleClientset(sts, ds)
	m.clients["c1"] = fakeCS

	stss, _ := m.GetStatefulSets(context.Background(), "c1", "default")
	if len(stss) != 1 {
		t.Errorf("Expected 1 STS, got %d", len(stss))
	}

	dss, _ := m.GetDaemonSets(context.Background(), "c1", "default")
	if len(dss) != 1 {
		t.Errorf("Expected 1 DS, got %d", len(dss))
	}
}

func TestGetIngressesAndNetworkPolicies(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	ing := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{Name: "ing1", Namespace: "default"},
	}
	np := &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{Name: "np1", Namespace: "default"},
	}

	fakeCS := k8sfake.NewSimpleClientset(ing, np)
	m.clients["c1"] = fakeCS

	ings, _ := m.GetIngresses(context.Background(), "c1", "default")
	if len(ings) != 1 {
		t.Errorf("Expected 1 Ingress, got %d", len(ings))
	}

	nps, _ := m.GetNetworkPolicies(context.Background(), "c1", "default")
	if len(nps) != 1 {
		t.Errorf("Expected 1 NP, got %d", len(nps))
	}
}

func TestGetGPUNodes(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "gpu-node",
			Labels: map[string]string{
				"nvidia.com/gpu.product": "Tesla T4",
			},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("2"),
			},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(node)
	m.clients["c1"] = fakeCS

	nodes, err := m.GetGPUNodes(context.Background(), "c1")
	if err != nil {
		t.Fatalf("GetGPUNodes failed: %v", err)
	}

	if len(nodes) != 1 {
		t.Fatalf("Expected 1 GPU node, got %d", len(nodes))
	}
	if nodes[0].Manufacturer != "NVIDIA" || nodes[0].GPUType != "Tesla T4" {
		t.Errorf("Unexpected GPU node info: %+v", nodes[0])
	}
}

func TestGetReplicaSets(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	rs := &appsv1.ReplicaSet{
		ObjectMeta: metav1.ObjectMeta{Name: "rs1", Namespace: "default"},
	}
	fakeCS := k8sfake.NewSimpleClientset(rs)
	m.clients["c1"] = fakeCS
	rss, _ := m.GetReplicaSets(context.Background(), "c1", "default")
	if len(rss) != 1 {
		t.Errorf("Expected 1 RS, got %d", len(rss))
	}
}

func TestGetServiceAccounts(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	sa := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{Name: "sa1", Namespace: "default"},
	}
	fakeCS := k8sfake.NewSimpleClientset(sa)
	m.clients["c1"] = fakeCS
	sas, _ := m.GetServiceAccounts(context.Background(), "c1", "default")
	if len(sas) != 1 {
		t.Errorf("Expected 1 SA, got %d", len(sas))
	}
}

func TestGetPVCsAndPVs(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{Name: "pvc1", Namespace: "default"},
		Status:     corev1.PersistentVolumeClaimStatus{Phase: corev1.ClaimBound},
	}
	pv := &corev1.PersistentVolume{
		ObjectMeta: metav1.ObjectMeta{Name: "pv1"},
		Status:     corev1.PersistentVolumeStatus{Phase: corev1.VolumeBound},
	}

	fakeCS := k8sfake.NewSimpleClientset(pvc, pv)
	m.clients["c1"] = fakeCS

	pvcs, _ := m.GetPVCs(context.Background(), "c1", "default")
	if len(pvcs) != 1 {
		t.Errorf("Expected 1 PVC, got %d", len(pvcs))
	}

	pvs, _ := m.GetPVs(context.Background(), "c1")
	if len(pvs) != 1 {
		t.Errorf("Expected 1 PV, got %d", len(pvs))
	}
}

func TestGetCronJobs(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	cj := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{Name: "cj1", Namespace: "default"},
	}

	fakeCS := k8sfake.NewSimpleClientset(cj)
	m.clients["c1"] = fakeCS

	cjs, _ := m.GetCronJobs(context.Background(), "c1", "default")
	if len(cjs) != 1 {
		t.Errorf("Expected 1 CronJob, got %d", len(cjs))
	}
}

func TestClassifyError(t *testing.T) {
	tests := []struct {
		msg  string
		want string
	}{
		{"context deadline exceeded", "timeout"},
		{"401 Unauthorized", "auth"},
		{"connection refused", "network"},
		{"x509: certificate signed by unknown authority", "certificate"},
		{"something else", "unknown"},
	}

	for _, tt := range tests {
		if got := classifyError(tt.msg); got != tt.want {
			t.Errorf("classifyError(%q) = %q, want %q", tt.msg, got, tt.want)
		}
	}
}

func TestGetResourceQuotasAndLimitRanges(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	rq := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{Name: "rq1", Namespace: "default"},
	}
	lr := &corev1.LimitRange{
		ObjectMeta: metav1.ObjectMeta{Name: "lr1", Namespace: "default"},
	}

	fakeCS := k8sfake.NewSimpleClientset(rq, lr)
	m.clients["c1"] = fakeCS

	rqs, _ := m.GetResourceQuotas(context.Background(), "c1", "default")
	if len(rqs) != 1 {
		t.Errorf("Expected 1 RQ, got %d", len(rqs))
	}

	lrs, _ := m.GetLimitRanges(context.Background(), "c1", "default")
	if len(lrs) != 1 {
		t.Errorf("Expected 1 LR, got %d", len(lrs))
	}
}

func TestCreateOrUpdateResourceQuota(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	fakeCS := k8sfake.NewSimpleClientset()
	m.clients["c1"] = fakeCS

	spec := ResourceQuotaSpec{
		Name:      "rq1",
		Namespace: "default",
		Hard:      map[string]string{"cpu": "1"},
	}

	rq, err := m.CreateOrUpdateResourceQuota(context.Background(), "c1", spec)
	if err != nil {
		t.Fatalf("CreateOrUpdateResourceQuota (create) failed: %v", err)
	}
	if rq.Name != "rq1" {
		t.Errorf("Expected rq1, got %s", rq.Name)
	}

	// Test update
	spec.Hard["cpu"] = "2"
	rq, err = m.CreateOrUpdateResourceQuota(context.Background(), "c1", spec)
	if err != nil {
		t.Fatalf("CreateOrUpdateResourceQuota (update) failed: %v", err)
	}
	// In the update path, the code uses updated.Status.Hard, which might be empty in fake client
	// But the function should complete without error
}

func TestGetAllClusterHealth(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	// Setup 2 clusters in rawConfig
	m.rawConfig = &api.Config{
		Contexts: map[string]*api.Context{
			"c1": {Cluster: "cl1"},
			"c2": {Cluster: "cl2"},
		},
		Clusters: map[string]*api.Cluster{
			"cl1": {Server: "s1"},
			"cl2": {Server: "s2"},
		},
	}

	// Inject fake clients
	m.clients["c1"] = k8sfake.NewSimpleClientset()
	m.clients["c2"] = k8sfake.NewSimpleClientset()

	results, err := m.GetAllClusterHealth(context.Background())
	if err != nil {
		t.Fatalf("GetAllClusterHealth failed: %v", err)
	}

	if len(results) != 2 {
		t.Errorf("Expected 2 results, got %d", len(results))
	}
}

func runScheme() *k8sruntime.Scheme {
	return k8sruntime.NewScheme()
}
