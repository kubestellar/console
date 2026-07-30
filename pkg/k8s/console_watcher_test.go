package k8s

import (
	"encoding/json"
	"testing"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

// TestNewConsoleWatcher verifies the constructor wires all fields and
// leaves the watcher in a runnable, un-started state.
func TestNewConsoleWatcher(t *testing.T) {
	fakeDyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(k8sruntime.NewScheme(), consoleGVRListKinds)
	handler := func(ConsoleResourceEvent) {}

	w := NewConsoleWatcher(fakeDyn, "ns-a", handler)

	if w == nil {
		t.Fatal("NewConsoleWatcher returned nil")
	}
	if w.client != fakeDyn {
		t.Error("client not wired")
	}
	if w.namespace != "ns-a" {
		t.Errorf("namespace=%q, want ns-a", w.namespace)
	}
	if w.handler == nil {
		t.Error("handler not wired")
	}
	if w.stopCh == nil {
		t.Error("stopCh must be initialized so a caller-side close never nil-panics")
	}
	if w.watchers == nil {
		t.Error("watchers map must be initialized so Start/Stop don't nil-panic")
	}
	if w.started {
		t.Error("newly constructed watcher must not report started")
	}
}

// TestConsoleResourceEventToJSON_PreservesResourcePayload confirms that
// the Resource field survives round-trip serialization. utils_coverage_test.go
// only asserts Type/ResourceType/Name are preserved; if a refactor accidentally
// drops the `resource` JSON tag, that test would still pass but this one fails.
func TestConsoleResourceEventToJSON_PreservesResourcePayload(t *testing.T) {
	evt := ConsoleResourceEvent{
		Type:         "ADDED",
		ResourceType: "ManagedWorkload",
		Name:         "widget",
		Namespace:    "prod",
		Resource:     map[string]string{"foo": "bar"},
	}
	data, err := ConsoleResourceEventToJSON(evt)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got map[string]interface{}
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	res, ok := got["resource"].(map[string]interface{})
	if !ok || res["foo"] != "bar" {
		t.Fatalf("resource field lost during marshal: %v", got["resource"])
	}
}

// TestConsoleResourceEventToJSON_OmitsResourceWhenNil confirms that DELETED
// events (which carry no resource) do not emit an empty "resource" object —
// the JSON tag is `omitempty` and consumers depend on that.
func TestConsoleResourceEventToJSON_OmitsResourceWhenNil(t *testing.T) {
	evt := ConsoleResourceEvent{
		Type:         "DELETED",
		ResourceType: "ClusterGroup",
		Name:         "cg1",
		Namespace:    "default",
	}
	data, err := ConsoleResourceEventToJSON(evt)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, present := raw["resource"]; present {
		t.Errorf("resource key must be omitted when nil; got payload: %s", data)
	}
}

// TestNewConsoleResourceChangedMessage_DataFieldIsEvent — utils_coverage_test
// only asserts msg.Data == event via assert.Equal (which does a deep compare);
// this test asserts that the concrete type assertion path also works, so
// consumers can `msg.Data.(ConsoleResourceEvent)` without reflection.
func TestNewConsoleResourceChangedMessage_DataFieldIsEvent(t *testing.T) {
	evt := ConsoleResourceEvent{Type: "MODIFIED", ResourceType: "WorkloadDeployment", Name: "wd", Namespace: "ns"}
	msg := NewConsoleResourceChangedMessage(evt)
	if msg.Type != "console_resource_changed" {
		t.Errorf("Type=%q, want console_resource_changed", msg.Type)
	}
	gotEvt, ok := msg.Data.(ConsoleResourceEvent)
	if !ok {
		t.Fatalf("Data is not a ConsoleResourceEvent: %T", msg.Data)
	}
	if gotEvt != evt {
		t.Errorf("Data=%+v, want %+v", gotEvt, evt)
	}
}

// makeUnstructured builds a minimal unstructured object with the given
// name/namespace so handleEvent's type conversion path has something to chew on.
func makeUnstructured(kind, apiVersion, name, ns string) *unstructured.Unstructured {
	u := &unstructured.Unstructured{}
	u.SetAPIVersion(apiVersion)
	u.SetKind(kind)
	u.SetName(name)
	u.SetNamespace(ns)
	return u
}

func newTestWatcher(handler ConsoleResourceEventHandler) *ConsoleWatcher {
	fakeDyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(k8sruntime.NewScheme(), consoleGVRListKinds)
	return NewConsoleWatcher(fakeDyn, "default", handler)
}

// TestHandleEvent_Added confirms an ADDED watch event fires the handler
// with a fully-populated ConsoleResourceEvent whose Resource is the typed
// ManagedWorkload converted from the unstructured payload.
func TestHandleEvent_Added(t *testing.T) {
	var got ConsoleResourceEvent
	var called int
	w := newTestWatcher(func(e ConsoleResourceEvent) { got = e; called++ })

	u := makeUnstructured("ManagedWorkload", "console.kubestellar.io/v1alpha1", "mw1", "team-a")
	err := w.handleEvent(watch.Event{Type: watch.Added, Object: u}, "ManagedWorkload")
	if err != nil {
		t.Fatalf("handleEvent: %v", err)
	}
	if called != 1 {
		t.Fatalf("handler called %d times, want 1", called)
	}
	if got.Type != "ADDED" || got.ResourceType != "ManagedWorkload" ||
		got.Name != "mw1" || got.Namespace != "team-a" {
		t.Fatalf("event payload wrong: %+v", got)
	}
	if _, ok := got.Resource.(*v1alpha1.ManagedWorkload); !ok {
		t.Fatalf("Resource should be *ManagedWorkload, got %T", got.Resource)
	}
}

// TestHandleEvent_Modified maps watch.Modified → "MODIFIED".
func TestHandleEvent_Modified(t *testing.T) {
	var got ConsoleResourceEvent
	w := newTestWatcher(func(e ConsoleResourceEvent) { got = e })
	u := makeUnstructured("ClusterGroup", "console.kubestellar.io/v1alpha1", "cg1", "default")
	if err := w.handleEvent(watch.Event{Type: watch.Modified, Object: u}, "ClusterGroup"); err != nil {
		t.Fatalf("handleEvent: %v", err)
	}
	if got.Type != "MODIFIED" {
		t.Errorf("Type=%q, want MODIFIED", got.Type)
	}
	if _, ok := got.Resource.(*v1alpha1.ClusterGroup); !ok {
		t.Errorf("Resource should be *ClusterGroup, got %T", got.Resource)
	}
}

// TestHandleEvent_Deleted maps watch.Deleted → "DELETED" and MUST leave
// Resource nil, since the deleted object body is not converted (the caller
// still needs Name/Namespace to reconcile).
func TestHandleEvent_Deleted(t *testing.T) {
	var got ConsoleResourceEvent
	w := newTestWatcher(func(e ConsoleResourceEvent) { got = e })
	u := makeUnstructured("WorkloadDeployment", "console.kubestellar.io/v1alpha1", "wd1", "prod")
	if err := w.handleEvent(watch.Event{Type: watch.Deleted, Object: u}, "WorkloadDeployment"); err != nil {
		t.Fatalf("handleEvent: %v", err)
	}
	if got.Type != "DELETED" {
		t.Errorf("Type=%q, want DELETED", got.Type)
	}
	if got.Resource != nil {
		t.Errorf("Resource should be nil for DELETED, got %v", got.Resource)
	}
	if got.Name != "wd1" || got.Namespace != "prod" {
		t.Errorf("name/namespace lost: %+v", got)
	}
}

// TestHandleEvent_UnknownWatchType returns nil without invoking the handler.
// watch.Bookmark and any future event types must be silently ignored so
// they never leak into the WebSocket stream.
func TestHandleEvent_UnknownWatchType(t *testing.T) {
	called := 0
	w := newTestWatcher(func(ConsoleResourceEvent) { called++ })
	u := makeUnstructured("ManagedWorkload", "console.kubestellar.io/v1alpha1", "mw1", "default")
	if err := w.handleEvent(watch.Event{Type: watch.Bookmark, Object: u}, "ManagedWorkload"); err != nil {
		t.Fatalf("handleEvent(bookmark) returned err: %v", err)
	}
	if called != 0 {
		t.Errorf("handler must not fire on watch.Bookmark; called=%d", called)
	}
}

// TestHandleEvent_ErrorGone — issue #6687 regression guard. A watch.Error
// carrying HTTP 410 must surface errWatchGone so the retry loop re-lists
// to obtain a fresh ResourceVersion. Collapsing it to a generic error
// (as the pre-fix code did) leads to an infinite retry loop against a
// stale RV.
func TestHandleEvent_ErrorGone(t *testing.T) {
	w := newTestWatcher(nil)
	status := &metav1.Status{Status: "Failure", Code: 410, Reason: "Expired", Message: "too old resource version"}
	err := w.handleEvent(watch.Event{Type: watch.Error, Object: status}, "ManagedWorkload")
	if err != errWatchGone {
		t.Fatalf("expected errWatchGone for HTTP 410, got %v", err)
	}
}

// TestHandleEvent_ErrorTransient — non-410 error events must NOT return
// errWatchGone, so the watch loop treats them as retryable rather than
// forcing a needless re-list.
func TestHandleEvent_ErrorTransient(t *testing.T) {
	w := newTestWatcher(nil)
	status := &metav1.Status{Status: "Failure", Code: 500, Reason: "InternalError", Message: "boom"}
	err := w.handleEvent(watch.Event{Type: watch.Error, Object: status}, "ManagedWorkload")
	if err == nil {
		t.Fatal("expected error for non-410 watch.Error, got nil")
	}
	if err == errWatchGone {
		t.Fatalf("non-410 status must not be reported as errWatchGone; got %v", err)
	}
}

// TestHandleEvent_ErrorUnknownObject — the watch.Error contract does not
// guarantee a *metav1.Status object. When it isn't, we must still return
// a descriptive error and MUST NOT return errWatchGone.
func TestHandleEvent_ErrorUnknownObject(t *testing.T) {
	w := newTestWatcher(nil)
	err := w.handleEvent(watch.Event{Type: watch.Error, Object: &unstructured.Unstructured{}}, "ManagedWorkload")
	if err == nil {
		t.Fatal("expected error for watch.Error with unknown object type")
	}
	if err == errWatchGone {
		t.Fatalf("unknown-object error must not masquerade as errWatchGone; got %v", err)
	}
}

// TestHandleEvent_UnexpectedObjectType — a non-Error event whose Object is
// not *unstructured.Unstructured must return an error and MUST NOT invoke
// the handler with garbage data.
func TestHandleEvent_UnexpectedObjectType(t *testing.T) {
	called := 0
	w := newTestWatcher(func(ConsoleResourceEvent) { called++ })
	err := w.handleEvent(watch.Event{Type: watch.Added, Object: &metav1.Status{}}, "ManagedWorkload")
	if err == nil {
		t.Fatal("expected error for non-Unstructured object on watch.Added")
	}
	if called != 0 {
		t.Errorf("handler must not fire on type-mismatch; called=%d", called)
	}
}

// TestHandleEvent_UnknownResourceType — a resourceType label that is not
// one of the three console CRDs must NOT crash and MUST still notify the
// handler with Resource == nil so the frontend can decide what to do.
// Regression guard: if the switch grows a default that logs+drops instead
// of continuing, DELETED-only downstream code silently breaks.
func TestHandleEvent_UnknownResourceType(t *testing.T) {
	var got ConsoleResourceEvent
	w := newTestWatcher(func(e ConsoleResourceEvent) { got = e })
	u := makeUnstructured("Widget", "example.com/v1", "w1", "ns")
	if err := w.handleEvent(watch.Event{Type: watch.Added, Object: u}, "Widget"); err != nil {
		t.Fatalf("handleEvent: %v", err)
	}
	if got.Type != "ADDED" || got.Name != "w1" || got.Namespace != "ns" {
		t.Errorf("event payload wrong: %+v", got)
	}
	if got.Resource != nil {
		t.Errorf("Resource must be nil for unknown resource type, got %v", got.Resource)
	}
}

// TestHandleEvent_NilHandler — the watcher must not panic if it was
// constructed with a nil handler, e.g. during shutdown races where the
// listener has been detached but a final event still arrives.
func TestHandleEvent_NilHandler(t *testing.T) {
	w := newTestWatcher(nil)
	u := makeUnstructured("ManagedWorkload", "console.kubestellar.io/v1alpha1", "mw1", "default")
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("handleEvent panicked with nil handler: %v", r)
		}
	}()
	if err := w.handleEvent(watch.Event{Type: watch.Added, Object: u}, "ManagedWorkload"); err != nil {
		t.Fatalf("handleEvent: %v", err)
	}
}
