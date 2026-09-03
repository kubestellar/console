package k8s

import (
	"context"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

func phaseCensusPod(name string, phase corev1.PodPhase, age time.Duration) *corev1.Pod {
	return &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:              name,
			Namespace:         "default",
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-age)},
		},
		Spec:   corev1.PodSpec{Containers: []corev1.Container{{Name: "c1", Image: "img"}}},
		Status: corev1.PodStatus{Phase: phase},
	}
}

// The invariant this change exists to protect: a Pending pod younger than
// podPendingAgeThreshold is deliberately absent from the issues feed, and must
// nevertheless be counted by the phase census. Before #23097 the phase stat was
// derived from the feed, so it inherited the feed's age gate and under-counted.
func TestCountPodPhases_CountsFreshPendingPodSuppressedByIssuesFeed(t *testing.T) {
	fresh := phaseCensusPod("fresh-pending", corev1.PodPending, 5*time.Second)

	census := CountPodPhases([]corev1.Pod{*fresh})
	if census.Pending != 1 {
		t.Fatalf("phase census must count a freshly-created Pending pod, got pending=%d", census.Pending)
	}

	// ...and the issues feed must still suppress it. If this half ever starts
	// failing, the feed's 2-minute threshold has been removed, which is not the
	// fix we want.
	m, _ := NewMultiClusterClient("")
	m.clients["c1"] = k8sfake.NewSimpleClientset(fresh)
	issues, err := m.FindPodIssues(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("FindPodIssues failed: %v", err)
	}
	if len(issues) != 0 {
		t.Fatalf("issues feed must keep suppressing a pod younger than podPendingAgeThreshold, got %d rows", len(issues))
	}
}

// The two sources are only allowed to disagree because of the age gate. An aged
// Pending pod appears in both.
func TestCountPodPhases_AgedPendingPodAppearsInBothSources(t *testing.T) {
	aged := phaseCensusPod("aged-pending", corev1.PodPending, 10*time.Minute)

	if census := CountPodPhases([]corev1.Pod{*aged}); census.Pending != 1 {
		t.Fatalf("expected pending=1, got %d", census.Pending)
	}

	m, _ := NewMultiClusterClient("")
	m.clients["c1"] = k8sfake.NewSimpleClientset(aged)
	issues, err := m.FindPodIssues(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("FindPodIssues failed: %v", err)
	}
	if len(issues) != 1 || issues[0].Reason != "Pending" {
		t.Fatalf("expected one Pending issue row, got %+v", issues)
	}
}

// Kubernetes reports an unschedulable pod as Pending — it never got a node — so
// the census counts it as Pending without any special case. This is the
// behaviour #23096 had to reconstruct from issue *reasons*; reading the phase
// directly gets it right for free.
func TestCountPodPhases_UnschedulablePodCountsAsPending(t *testing.T) {
	unschedulable := phaseCensusPod("unschedulable", corev1.PodPending, 30*time.Second)
	unschedulable.Status.Conditions = []corev1.PodCondition{{
		Type:    corev1.PodScheduled,
		Status:  corev1.ConditionFalse,
		Reason:  "Unschedulable",
		Message: "0/6 nodes are available: insufficient cpu.",
	}}

	census := CountPodPhases([]corev1.Pod{*unschedulable})
	if census.Pending != 1 {
		t.Fatalf("unschedulable pod is Pending phase, got pending=%d", census.Pending)
	}
	if census.Failed != 0 || census.Running != 0 {
		t.Fatalf("unschedulable pod must not land in another bucket: %+v", census)
	}
}

// Terminal and Running-but-unready pods must not leak into the Pending bucket.
func TestCountPodPhases_DoesNotMiscountTerminalOrUnreadyPods(t *testing.T) {
	runningUnready := phaseCensusPod("running-unready", corev1.PodRunning, 20*time.Minute)
	runningUnready.Status.ContainerStatuses = []corev1.ContainerStatus{{
		Name:  "c1",
		Ready: false,
		State: corev1.ContainerState{Running: &corev1.ContainerStateRunning{
			StartedAt: metav1.Time{Time: time.Now().Add(-20 * time.Minute)},
		}},
	}}

	pods := []corev1.Pod{
		*runningUnready,
		*phaseCensusPod("failed", corev1.PodFailed, time.Hour),
		*phaseCensusPod("succeeded", corev1.PodSucceeded, time.Hour),
		*phaseCensusPod("unknown", corev1.PodUnknown, time.Hour),
	}

	census := CountPodPhases(pods)
	want := PodPhaseCensus{Running: 1, Pending: 0, Failed: 1, Succeeded: 1, Unknown: 1}
	if census != want {
		t.Fatalf("expected %+v, got %+v", want, census)
	}
}

// Every pod lands in exactly one bucket, so a phase breakdown is always a
// partition of the same listing that yields PodCount.
func TestCountPodPhases_BucketsPartitionThePodListing(t *testing.T) {
	pods := []corev1.Pod{
		*phaseCensusPod("r1", corev1.PodRunning, time.Hour),
		*phaseCensusPod("r2", corev1.PodRunning, time.Hour),
		*phaseCensusPod("p1", corev1.PodPending, time.Second),
		*phaseCensusPod("f1", corev1.PodFailed, time.Hour),
		*phaseCensusPod("s1", corev1.PodSucceeded, time.Hour),
		*phaseCensusPod("u1", corev1.PodUnknown, time.Hour),
	}

	census := CountPodPhases(pods)
	sum := census.Running + census.Pending + census.Failed + census.Succeeded + census.Unknown
	if sum != len(pods) {
		t.Fatalf("phase buckets must sum to the pod count: %d != %d (%+v)", sum, len(pods), census)
	}
}

func TestCountPodPhases_EmptyListing(t *testing.T) {
	if census := CountPodPhases(nil); census != (PodPhaseCensus{}) {
		t.Fatalf("expected zero census, got %+v", census)
	}
}
