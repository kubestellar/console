package agent

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestGracefulShutdown_CompletesWhenNoOps(t *testing.T) {
	s := newTestServer(t)

	// No in-flight operations — shutdown should complete immediately
	done := make(chan struct{})
	go func() {
		s.GracefulShutdown()
		close(done)
	}()

	select {
	case <-done:
		// success
	case <-time.After(2 * time.Second):
		t.Fatal("GracefulShutdown did not complete within 2s with no in-flight ops")
	}
}

func TestGracefulShutdown_WaitsForClusterOps(t *testing.T) {
	s := newTestServer(t)

	// Simulate an in-flight cluster operation
	opDone := make(chan struct{})
	s.clusterOpsWG.Add(1)
	go func() {
		defer s.clusterOpsWG.Done()
		<-opDone // block until we release
	}()

	shutdownComplete := make(chan struct{})
	go func() {
		s.GracefulShutdown()
		close(shutdownComplete)
	}()

	// Shutdown should NOT complete yet
	select {
	case <-shutdownComplete:
		t.Fatal("GracefulShutdown completed before cluster op finished")
	case <-time.After(100 * time.Millisecond):
		// expected — still waiting
	}

	// Release the operation
	close(opDone)

	select {
	case <-shutdownComplete:
		// success — shutdown completed after op finished
	case <-time.After(2 * time.Second):
		t.Fatal("GracefulShutdown did not complete after cluster op finished")
	}
}

func TestGracefulShutdown_Idempotent(t *testing.T) {
	s := newTestServer(t)

	// Calling GracefulShutdown multiple times should not panic
	var wg sync.WaitGroup
	const concurrentCalls = 5
	for i := 0; i < concurrentCalls; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s.GracefulShutdown()
		}()
	}
	wg.Wait()
	// If we get here without panic, the test passes
}

func TestGracefulShutdown_ClosesStopCh(t *testing.T) {
	s := newTestServer(t)

	// stopCh should be open initially
	select {
	case <-s.stopCh:
		t.Fatal("stopCh already closed before GracefulShutdown")
	default:
		// expected
	}

	s.GracefulShutdown()

	// stopCh should now be closed
	select {
	case <-s.stopCh:
		// expected
	default:
		t.Fatal("stopCh not closed after GracefulShutdown")
	}
}

func TestSendStateDigest_IncrementsSequence(t *testing.T) {
	s := newTestServer(t, withContexts("cluster-a"))

	// sendStateDigest increments the sequence counter each call
	before := s.digestSequence.Load()
	s.sendStateDigest()
	after := s.digestSequence.Load()
	assert.Equal(t, before+1, after)

	s.sendStateDigest()
	assert.Equal(t, before+2, s.digestSequence.Load())
}

func TestStartStateDigestWorker_StopsOnClose(t *testing.T) {
	s := newTestServer(t)

	workerDone := make(chan struct{})
	go func() {
		s.startStateDigestWorker()
		close(workerDone)
	}()

	// Give worker time to start
	time.Sleep(50 * time.Millisecond)
	s.GracefulShutdown() // closes stopCh

	select {
	case <-workerDone:
		// worker exited cleanly
	case <-time.After(2 * time.Second):
		t.Fatal("startStateDigestWorker did not exit after stopCh closed")
	}
}

func TestLifecycleConstants(t *testing.T) {
	assert.Equal(t, 30*time.Second, clusterOpsShutdownTimeout)
	assert.Equal(t, 15*time.Second, stateDigestInterval)
}
