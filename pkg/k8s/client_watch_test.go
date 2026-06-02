package k8s

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"
)

type recordingWatch struct {
	result   chan watch.Event
	stopped  chan struct{}
	stopOnce sync.Once
}

func newRecordingWatch() *recordingWatch {
	return &recordingWatch{
		result:  make(chan watch.Event),
		stopped: make(chan struct{}),
	}
}

func (w *recordingWatch) Stop() {
	w.stopOnce.Do(func() {
		close(w.stopped)
		close(w.result)
	})
}

func (w *recordingWatch) ResultChan() <-chan watch.Event {
	return w.result
}

func TestConsoleWatcher_DoWatch_CleansUpOnContextCancellation(t *testing.T) {
	resource := &unstructured.Unstructured{}
	resource.SetGroupVersionKind(v1alpha1.GroupVersion.WithKind("ManagedWorkload"))
	resource.SetNamespace("default")
	resource.SetName("mw1")
	resource.SetResourceVersion("1")

	fakeDyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(k8sruntime.NewScheme(), consoleGVRListKinds, resource)
	recording := newRecordingWatch()
	fakeDyn.PrependWatchReactor("managedworkloads", func(action k8stesting.Action) (bool, watch.Interface, error) {
		return true, recording, nil
	})

	watcher := NewConsoleWatcher(fakeDyn, "default", func(ConsoleResourceEvent) {})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- watcher.doWatch(ctx, watcher.stopCh, v1alpha1.ManagedWorkloadGVR, "ManagedWorkload")
	}()

	require.Eventually(t, func() bool {
		watcher.mu.Lock()
		defer watcher.mu.Unlock()
		_, ok := watcher.watchers[v1alpha1.ManagedWorkloadGVR]
		return ok
	}, time.Second, 10*time.Millisecond)

	cancel()

	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(time.Second):
		t.Fatal("doWatch did not return after context cancellation")
	}

	require.Eventually(t, func() bool {
		watcher.mu.Lock()
		defer watcher.mu.Unlock()
		return len(watcher.watchers) == 0
	}, time.Second, 10*time.Millisecond)

	select {
	case <-recording.stopped:
	case <-time.After(time.Second):
		t.Fatal("watch interface was not stopped during cleanup")
	}
}
