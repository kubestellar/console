package k8s

import (
	"context"
	"sync"
	"testing"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"
)

const workloadTestContext = "test-ctx"

func newWorkloadsTestClient(objects ...k8sruntime.Object) *MultiClusterClient {
	return &MultiClusterClient{
		mu: sync.RWMutex{},
		clients: map[string]kubernetes.Interface{
			workloadTestContext: k8sfake.NewSimpleClientset(objects...),
		},
		configs: map[string]*rest.Config{
			workloadTestContext: &rest.Config{},
		},
		rawConfig:   &api.Config{},
		healthCache: make(map[string]*ClusterHealth),
		cacheTime:   make(map[string]time.Time),
	}
}

func int32Ptr(v int32) *int32 {
	return &v
}

func boolPtr(v bool) *bool {
	return &v
}

func TestMultiClusterClient_FindDeploymentIssues(t *testing.T) {
	t.Parallel()

	now := metav1.NewTime(time.Now().Add(-2 * time.Hour))

	testCases := []struct {
		name         string
		objects      []k8sruntime.Object
		wantEmpty    bool
		wantReason   string
		wantMessage  string
		wantReplicas int32
		wantReady    int32
	}{
		{
			name: "happy path returns empty when all replicas ready",
			objects: []k8sruntime.Object{
				&appsv1.Deployment{
					ObjectMeta: metav1.ObjectMeta{Name: "ready", Namespace: "default", CreationTimestamp: now},
					Spec:       appsv1.DeploymentSpec{Replicas: int32Ptr(3)},
					Status:     appsv1.DeploymentStatus{ReadyReplicas: 3},
				},
			},
			wantEmpty: true,
		},
		{
			name: "detects unavailable when ready replicas are below desired",
			objects: []k8sruntime.Object{
				&appsv1.Deployment{
					ObjectMeta: metav1.ObjectMeta{Name: "unavailable", Namespace: "default", CreationTimestamp: now},
					Spec:       appsv1.DeploymentSpec{Replicas: int32Ptr(3)},
					Status:     appsv1.DeploymentStatus{ReadyReplicas: 1},
				},
			},
			wantReason:   "Unavailable",
			wantMessage:  "1/3 replicas ready",
			wantReplicas: 3,
			wantReady:    1,
		},
		{
			name: "progressing false takes precedence over available false",
			objects: []k8sruntime.Object{
				&appsv1.Deployment{
					ObjectMeta: metav1.ObjectMeta{Name: "precedence", Namespace: "default", CreationTimestamp: now},
					Spec:       appsv1.DeploymentSpec{Replicas: int32Ptr(4)},
					Status: appsv1.DeploymentStatus{
						ReadyReplicas: 2,
						Conditions: []appsv1.DeploymentCondition{
							{
								Type:    appsv1.DeploymentAvailable,
								Status:  corev1.ConditionFalse,
								Message: "available condition should not win",
							},
							{
								Type:    appsv1.DeploymentProgressing,
								Status:  corev1.ConditionFalse,
								Message: "progress deadline exceeded",
							},
						},
					},
				},
			},
			wantReason:   "ProgressDeadlineExceeded",
			wantMessage:  "progress deadline exceeded",
			wantReplicas: 4,
			wantReady:    2,
		},
		{
			name: "nil spec replicas defaults to one",
			objects: []k8sruntime.Object{
				&appsv1.Deployment{
					ObjectMeta: metav1.ObjectMeta{Name: "default-one", Namespace: "default", CreationTimestamp: now},
					Status:     appsv1.DeploymentStatus{ReadyReplicas: 0},
				},
			},
			wantReason:   "Unavailable",
			wantMessage:  "0/1 replicas ready",
			wantReplicas: 1,
			wantReady:    0,
		},
		{
			name:      "empty deployment list returns empty",
			wantEmpty: true,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			client := newWorkloadsTestClient(tc.objects...)
			got, err := client.FindDeploymentIssues(context.Background(), workloadTestContext, "default")
			if err != nil {
				t.Fatalf("FindDeploymentIssues returned error: %v", err)
			}

			if tc.wantEmpty {
				if len(got) != 0 {
					t.Fatalf("FindDeploymentIssues() = %#v, want empty slice", got)
				}
				return
			}

			if len(got) != 1 {
				t.Fatalf("FindDeploymentIssues() returned %d issues, want 1", len(got))
			}

			issue := got[0]
			if issue.Name == "" {
				t.Fatalf("FindDeploymentIssues() returned empty deployment name")
			}
			if issue.Namespace != "default" {
				t.Fatalf("issue.Namespace = %q, want %q", issue.Namespace, "default")
			}
			if issue.Cluster != workloadTestContext {
				t.Fatalf("issue.Cluster = %q, want %q", issue.Cluster, workloadTestContext)
			}
			if issue.Reason != tc.wantReason {
				t.Fatalf("issue.Reason = %q, want %q", issue.Reason, tc.wantReason)
			}
			if issue.Message != tc.wantMessage {
				t.Fatalf("issue.Message = %q, want %q", issue.Message, tc.wantMessage)
			}
			if issue.Replicas != tc.wantReplicas {
				t.Fatalf("issue.Replicas = %d, want %d", issue.Replicas, tc.wantReplicas)
			}
			if issue.ReadyReplicas != tc.wantReady {
				t.Fatalf("issue.ReadyReplicas = %d, want %d", issue.ReadyReplicas, tc.wantReady)
			}
		})
	}
}

func TestMultiClusterClient_GetDeployments(t *testing.T) {
	t.Parallel()

	now := metav1.NewTime(time.Now().Add(-90 * time.Minute))

	testCases := []struct {
		name         string
		deployment   *appsv1.Deployment
		wantStatus   string
		wantReplicas int32
		wantProgress int
		wantImage    string
	}{
		{
			name: "status running when ready equals desired",
			deployment: &appsv1.Deployment{
				ObjectMeta: metav1.ObjectMeta{Name: "running", Namespace: "default", CreationTimestamp: now},
				Spec: appsv1.DeploymentSpec{
					Replicas: int32Ptr(2),
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{Containers: []corev1.Container{{Image: "nginx:1.27"}}},
					},
				},
				Status: appsv1.DeploymentStatus{
					ReadyReplicas:     2,
					UpdatedReplicas:   2,
					AvailableReplicas: 2,
				},
			},
			wantStatus:   "running",
			wantReplicas: 2,
			wantProgress: 100,
			wantImage:    "nginx:1.27",
		},
		{
			name: "status deploying when ready below desired without progressing false",
			deployment: &appsv1.Deployment{
				ObjectMeta: metav1.ObjectMeta{Name: "deploying", Namespace: "default", CreationTimestamp: now},
				Spec: appsv1.DeploymentSpec{
					Replicas: int32Ptr(4),
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{Containers: []corev1.Container{
							{Image: "primary:v1"},
							{Image: "sidecar:v1"},
						}},
					},
				},
				Status: appsv1.DeploymentStatus{
					ReadyReplicas:     2,
					UpdatedReplicas:   3,
					AvailableReplicas: 2,
					Conditions: []appsv1.DeploymentCondition{{
						Type:    appsv1.DeploymentAvailable,
						Status:  corev1.ConditionFalse,
						Message: "rolling update in progress",
					}},
				},
			},
			wantStatus:   "deploying",
			wantReplicas: 4,
			wantProgress: 50,
			wantImage:    "primary:v1",
		},
		{
			name: "status failed when progressing false",
			deployment: &appsv1.Deployment{
				ObjectMeta: metav1.ObjectMeta{Name: "failed", Namespace: "default", CreationTimestamp: now},
				Spec: appsv1.DeploymentSpec{
					Replicas: int32Ptr(3),
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{Containers: []corev1.Container{{Image: "broken:v1"}}},
					},
				},
				Status: appsv1.DeploymentStatus{
					ReadyReplicas: 1,
					Conditions: []appsv1.DeploymentCondition{{
						Type:   appsv1.DeploymentProgressing,
						Status: corev1.ConditionFalse,
					}},
				},
			},
			wantStatus:   "failed",
			wantReplicas: 3,
			wantProgress: 33,
			wantImage:    "broken:v1",
		},
		{
			name: "nil spec replicas defaults to one",
			deployment: &appsv1.Deployment{
				ObjectMeta: metav1.ObjectMeta{Name: "default-replicas", Namespace: "default", CreationTimestamp: now},
				Spec: appsv1.DeploymentSpec{
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{Containers: []corev1.Container{{Image: "single:v1"}}},
					},
				},
				Status: appsv1.DeploymentStatus{ReadyReplicas: 1},
			},
			wantStatus:   "running",
			wantReplicas: 1,
			wantProgress: 100,
			wantImage:    "single:v1",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			client := newWorkloadsTestClient(tc.deployment)
			got, err := client.GetDeployments(context.Background(), workloadTestContext, "default")
			if err != nil {
				t.Fatalf("GetDeployments returned error: %v", err)
			}
			if len(got) != 1 {
				t.Fatalf("GetDeployments() returned %d deployments, want 1", len(got))
			}

			deployment := got[0]
			if deployment.Status != tc.wantStatus {
				t.Fatalf("deployment.Status = %q, want %q", deployment.Status, tc.wantStatus)
			}
			if deployment.Replicas != tc.wantReplicas {
				t.Fatalf("deployment.Replicas = %d, want %d", deployment.Replicas, tc.wantReplicas)
			}
			if deployment.Progress != tc.wantProgress {
				t.Fatalf("deployment.Progress = %d, want %d", deployment.Progress, tc.wantProgress)
			}
			if deployment.Image != tc.wantImage {
				t.Fatalf("deployment.Image = %q, want %q", deployment.Image, tc.wantImage)
			}
			if deployment.Cluster != workloadTestContext {
				t.Fatalf("deployment.Cluster = %q, want %q", deployment.Cluster, workloadTestContext)
			}
		})
	}
}

func TestMultiClusterClient_GetStatefulSets(t *testing.T) {
	t.Parallel()

	now := metav1.NewTime(time.Now().Add(-3 * time.Hour))

	testCases := []struct {
		name         string
		statefulSet  *appsv1.StatefulSet
		wantStatus   string
		wantReplicas int32
	}{
		{
			name: "status running when ready equals desired",
			statefulSet: &appsv1.StatefulSet{
				ObjectMeta: metav1.ObjectMeta{Name: "running", Namespace: "default", CreationTimestamp: now},
				Spec: appsv1.StatefulSetSpec{
					Replicas: int32Ptr(3),
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{Containers: []corev1.Container{{Image: "db:v1"}}},
					},
				},
				Status: appsv1.StatefulSetStatus{ReadyReplicas: 3},
			},
			wantStatus:   "running",
			wantReplicas: 3,
		},
		{
			name: "status deploying when ready below desired but above zero",
			statefulSet: &appsv1.StatefulSet{
				ObjectMeta: metav1.ObjectMeta{Name: "deploying", Namespace: "default", CreationTimestamp: now},
				Spec: appsv1.StatefulSetSpec{
					Replicas: int32Ptr(4),
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{Containers: []corev1.Container{{Image: "cache:v1"}}},
					},
				},
				Status: appsv1.StatefulSetStatus{ReadyReplicas: 2},
			},
			wantStatus:   "deploying",
			wantReplicas: 4,
		},
		{
			name: "status failed when ready is zero and desired is positive",
			statefulSet: &appsv1.StatefulSet{
				ObjectMeta: metav1.ObjectMeta{Name: "failed", Namespace: "default", CreationTimestamp: now},
				Spec: appsv1.StatefulSetSpec{
					Replicas: int32Ptr(2),
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{Containers: []corev1.Container{{Image: "queue:v1"}}},
					},
				},
				Status: appsv1.StatefulSetStatus{ReadyReplicas: 0},
			},
			wantStatus:   "failed",
			wantReplicas: 2,
		},
		{
			name: "nil spec replicas is handled",
			statefulSet: &appsv1.StatefulSet{
				ObjectMeta: metav1.ObjectMeta{Name: "nil-replicas", Namespace: "default", CreationTimestamp: now},
				Spec: appsv1.StatefulSetSpec{
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{Containers: []corev1.Container{{Image: "worker:v1"}}},
					},
				},
				Status: appsv1.StatefulSetStatus{ReadyReplicas: 0},
			},
			wantStatus:   "running",
			wantReplicas: 0,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			client := newWorkloadsTestClient(tc.statefulSet)
			got, err := client.GetStatefulSets(context.Background(), workloadTestContext, "default")
			if err != nil {
				t.Fatalf("GetStatefulSets returned error: %v", err)
			}
			if len(got) != 1 {
				t.Fatalf("GetStatefulSets() returned %d items, want 1", len(got))
			}
			statefulSet := got[0]
			if statefulSet.Status != tc.wantStatus {
				t.Fatalf("statefulSet.Status = %q, want %q", statefulSet.Status, tc.wantStatus)
			}
			if statefulSet.Replicas != tc.wantReplicas {
				t.Fatalf("statefulSet.Replicas = %d, want %d", statefulSet.Replicas, tc.wantReplicas)
			}
		})
	}
}

func TestMultiClusterClient_GetDaemonSets(t *testing.T) {
	t.Parallel()

	now := metav1.NewTime(time.Now().Add(-4 * time.Hour))

	testCases := []struct {
		name      string
		daemonSet *appsv1.DaemonSet
		want      string
	}{
		{
			name: "status running when ready equals desired",
			daemonSet: &appsv1.DaemonSet{
				ObjectMeta: metav1.ObjectMeta{Name: "running", Namespace: "default", CreationTimestamp: now},
				Status: appsv1.DaemonSetStatus{
					DesiredNumberScheduled: 3,
					CurrentNumberScheduled: 3,
					NumberReady:            3,
				},
			},
			want: "running",
		},
		{
			name: "status degraded when ready below desired",
			daemonSet: &appsv1.DaemonSet{
				ObjectMeta: metav1.ObjectMeta{Name: "degraded", Namespace: "default", CreationTimestamp: now},
				Status: appsv1.DaemonSetStatus{
					DesiredNumberScheduled: 4,
					CurrentNumberScheduled: 4,
					NumberReady:            2,
				},
			},
			want: "degraded",
		},
		{
			name: "status failed when nothing is ready and desired is positive",
			daemonSet: &appsv1.DaemonSet{
				ObjectMeta: metav1.ObjectMeta{Name: "failed", Namespace: "default", CreationTimestamp: now},
				Status: appsv1.DaemonSetStatus{
					DesiredNumberScheduled: 5,
					CurrentNumberScheduled: 5,
					NumberReady:            0,
				},
			},
			want: "failed",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			client := newWorkloadsTestClient(tc.daemonSet)
			got, err := client.GetDaemonSets(context.Background(), workloadTestContext, "default")
			if err != nil {
				t.Fatalf("GetDaemonSets returned error: %v", err)
			}
			if len(got) != 1 {
				t.Fatalf("GetDaemonSets() returned %d items, want 1", len(got))
			}
			if got[0].Status != tc.want {
				t.Fatalf("daemonSet.Status = %q, want %q", got[0].Status, tc.want)
			}
		})
	}
}

func TestMultiClusterClient_GetJobs(t *testing.T) {
	t.Parallel()

	now := time.Now().Add(-45 * time.Minute)
	start := metav1.NewTime(now.Add(-10 * time.Minute))
	completion := metav1.NewTime(now)

	testCases := []struct {
		name            string
		job             *batchv1.Job
		wantStatus      string
		wantCompletions string
	}{
		{
			name: "running job",
			job: &batchv1.Job{
				ObjectMeta: metav1.ObjectMeta{Name: "running", Namespace: "default", CreationTimestamp: metav1.NewTime(now.Add(-30 * time.Minute))},
				Spec:       batchv1.JobSpec{Completions: int32Ptr(1)},
				Status:     batchv1.JobStatus{StartTime: &start},
			},
			wantStatus:      "Running",
			wantCompletions: "0/1",
		},
		{
			name: "complete job",
			job: &batchv1.Job{
				ObjectMeta: metav1.ObjectMeta{Name: "complete", Namespace: "default", CreationTimestamp: metav1.NewTime(now.Add(-40 * time.Minute))},
				Spec:       batchv1.JobSpec{Completions: int32Ptr(3)},
				Status: batchv1.JobStatus{
					Succeeded:      3,
					StartTime:      &start,
					CompletionTime: &completion,
				},
			},
			wantStatus:      "Complete",
			wantCompletions: "3/3",
		},
		{
			name: "failed job",
			job: &batchv1.Job{
				ObjectMeta: metav1.ObjectMeta{Name: "failed", Namespace: "default", CreationTimestamp: metav1.NewTime(now.Add(-50 * time.Minute))},
				Spec:       batchv1.JobSpec{Completions: int32Ptr(2)},
				Status:     batchv1.JobStatus{Failed: 1, StartTime: &start},
			},
			wantStatus:      "Failed",
			wantCompletions: "0/2",
		},
		{
			name: "nil completions defaults to zero of one",
			job: &batchv1.Job{
				ObjectMeta: metav1.ObjectMeta{Name: "default-completions", Namespace: "default", CreationTimestamp: metav1.NewTime(now.Add(-20 * time.Minute))},
				Status:     batchv1.JobStatus{StartTime: &start},
			},
			wantStatus:      "Running",
			wantCompletions: "0/1",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			client := newWorkloadsTestClient(tc.job)
			got, err := client.GetJobs(context.Background(), workloadTestContext, "default")
			if err != nil {
				t.Fatalf("GetJobs returned error: %v", err)
			}
			if len(got) != 1 {
				t.Fatalf("GetJobs() returned %d jobs, want 1", len(got))
			}
			job := got[0]
			if job.Status != tc.wantStatus {
				t.Fatalf("job.Status = %q, want %q", job.Status, tc.wantStatus)
			}
			if job.Completions != tc.wantCompletions {
				t.Fatalf("job.Completions = %q, want %q", job.Completions, tc.wantCompletions)
			}
		})
	}
}

func TestMultiClusterClient_GetCronJobs(t *testing.T) {
	t.Parallel()

	now := metav1.NewTime(time.Now().Add(-2 * time.Hour))
	lastSchedule := metav1.NewTime(time.Now().Add(-15 * time.Minute))

	testCases := []struct {
		name        string
		cronJob     *batchv1.CronJob
		wantSuspend bool
		wantActive  int
	}{
		{
			name: "basic fields are populated",
			cronJob: &batchv1.CronJob{
				ObjectMeta: metav1.ObjectMeta{Name: "scheduled", Namespace: "default", CreationTimestamp: now},
				Spec: batchv1.CronJobSpec{
					Schedule: "*/5 * * * *",
					Suspend:  boolPtr(true),
				},
				Status: batchv1.CronJobStatus{
					Active:           []corev1.ObjectReference{{Name: "job-1"}, {Name: "job-2"}},
					LastScheduleTime: &lastSchedule,
				},
			},
			wantSuspend: true,
			wantActive:  2,
		},
		{
			name: "nil suspend defaults to false",
			cronJob: &batchv1.CronJob{
				ObjectMeta: metav1.ObjectMeta{Name: "default-suspend", Namespace: "default", CreationTimestamp: now},
				Spec: batchv1.CronJobSpec{
					Schedule: "0 * * * *",
				},
				Status: batchv1.CronJobStatus{
					Active: []corev1.ObjectReference{{Name: "job-3"}},
				},
			},
			wantSuspend: false,
			wantActive:  1,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			client := newWorkloadsTestClient(tc.cronJob)
			got, err := client.GetCronJobs(context.Background(), workloadTestContext, "default")
			if err != nil {
				t.Fatalf("GetCronJobs returned error: %v", err)
			}
			if len(got) != 1 {
				t.Fatalf("GetCronJobs() returned %d items, want 1", len(got))
			}
			cronJob := got[0]
			if cronJob.Schedule != tc.cronJob.Spec.Schedule {
				t.Fatalf("cronJob.Schedule = %q, want %q", cronJob.Schedule, tc.cronJob.Spec.Schedule)
			}
			if cronJob.Suspend != tc.wantSuspend {
				t.Fatalf("cronJob.Suspend = %t, want %t", cronJob.Suspend, tc.wantSuspend)
			}
			if cronJob.Active != tc.wantActive {
				t.Fatalf("cronJob.Active = %d, want %d", cronJob.Active, tc.wantActive)
			}
		})
	}
}

func TestMultiClusterClient_GetHPAs(t *testing.T) {
	t.Parallel()

	now := metav1.NewTime(time.Now().Add(-1 * time.Hour))

	testCases := []struct {
		name            string
		objects         []k8sruntime.Object
		wantCount       int
		wantReference   string
		wantMinReplicas int32
		wantMaxReplicas int32
		wantTargetCPU   string
		wantCurrentCPU  string
	}{
		{
			name:      "empty HPA list returns empty slice",
			objects:   nil,
			wantCount: 0,
		},
		{
			name: "minReplicas defaults to 1 when nil",
			objects: []k8sruntime.Object{
				&autoscalingv2.HorizontalPodAutoscaler{
					ObjectMeta: metav1.ObjectMeta{Name: "web-hpa", Namespace: "default", CreationTimestamp: now},
					Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
						ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
							Kind: "Deployment",
							Name: "web",
						},
						MinReplicas: nil,
						MaxReplicas: 10,
					},
				},
			},
			wantCount:       1,
			wantReference:   "Deployment/web",
			wantMinReplicas: 1,
			wantMaxReplicas: 10,
			wantTargetCPU:   "",
			wantCurrentCPU:  "",
		},
		{
			name: "explicit minReplicas is respected",
			objects: []k8sruntime.Object{
				&autoscalingv2.HorizontalPodAutoscaler{
					ObjectMeta: metav1.ObjectMeta{Name: "api-hpa", Namespace: "default", CreationTimestamp: now},
					Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
						ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
							Kind: "Deployment",
							Name: "api",
						},
						MinReplicas: int32Ptr(3),
						MaxReplicas: 20,
					},
				},
			},
			wantCount:       1,
			wantReference:   "Deployment/api",
			wantMinReplicas: 3,
			wantMaxReplicas: 20,
		},
		{
			name: "CPU target and current utilization are extracted",
			objects: []k8sruntime.Object{
				&autoscalingv2.HorizontalPodAutoscaler{
					ObjectMeta: metav1.ObjectMeta{Name: "cpu-hpa", Namespace: "default", CreationTimestamp: now},
					Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
						ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
							Kind: "Deployment",
							Name: "worker",
						},
						MinReplicas: int32Ptr(2),
						MaxReplicas: 8,
						Metrics: []autoscalingv2.MetricSpec{
							{
								Type: autoscalingv2.ResourceMetricSourceType,
								Resource: &autoscalingv2.ResourceMetricSource{
									Name: corev1.ResourceCPU,
									Target: autoscalingv2.MetricTarget{
										AverageUtilization: int32Ptr(75),
									},
								},
							},
						},
					},
					Status: autoscalingv2.HorizontalPodAutoscalerStatus{
						CurrentReplicas: 4,
						CurrentMetrics: []autoscalingv2.MetricStatus{
							{
								Type: autoscalingv2.ResourceMetricSourceType,
								Resource: &autoscalingv2.ResourceMetricStatus{
									Name: corev1.ResourceCPU,
									Current: autoscalingv2.MetricValueStatus{
										AverageUtilization: int32Ptr(60),
									},
								},
							},
						},
					},
				},
			},
			wantCount:       1,
			wantReference:   "Deployment/worker",
			wantMinReplicas: 2,
			wantMaxReplicas: 8,
			wantTargetCPU:   "75%",
			wantCurrentCPU:  "60%",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			client := newWorkloadsTestClient(tc.objects...)
			got, err := client.GetHPAs(context.Background(), workloadTestContext, "default")
			if err != nil {
				t.Fatalf("GetHPAs returned error: %v", err)
			}
			if len(got) != tc.wantCount {
				t.Fatalf("GetHPAs() returned %d items, want %d", len(got), tc.wantCount)
			}
			if tc.wantCount == 0 {
				return
			}

			hpa := got[0]
			if hpa.Reference != tc.wantReference {
				t.Fatalf("hpa.Reference = %q, want %q", hpa.Reference, tc.wantReference)
			}
			if hpa.MinReplicas != tc.wantMinReplicas {
				t.Fatalf("hpa.MinReplicas = %d, want %d", hpa.MinReplicas, tc.wantMinReplicas)
			}
			if hpa.MaxReplicas != tc.wantMaxReplicas {
				t.Fatalf("hpa.MaxReplicas = %d, want %d", hpa.MaxReplicas, tc.wantMaxReplicas)
			}
			if tc.wantTargetCPU != "" && hpa.TargetCPU != tc.wantTargetCPU {
				t.Fatalf("hpa.TargetCPU = %q, want %q", hpa.TargetCPU, tc.wantTargetCPU)
			}
			if tc.wantCurrentCPU != "" && hpa.CurrentCPU != tc.wantCurrentCPU {
				t.Fatalf("hpa.CurrentCPU = %q, want %q", hpa.CurrentCPU, tc.wantCurrentCPU)
			}
		})
	}
}
