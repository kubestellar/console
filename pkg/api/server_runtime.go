package api

import (
	"context"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/api/handlers/auth"
	"github.com/kubestellar/console/pkg/api/handlers/rewards"
	"github.com/kubestellar/console/pkg/api/handlers/workloads"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
)

const (
	quantumWorkloadCacheTTL   = 30 * time.Second
	quantumDetectionTimeout   = 5 * time.Second
	quantumWorkloadNamespace  = "quantum"
	quantumWorkloadDeployment = "quantum-kc-demo"
)

type serverLifecycle struct {
	loadingSrv   *http.Server
	done         chan struct{}
	shutdownOnce sync.Once
	shuttingDown int32
}

type authRuntime struct {
	handler        *auth.AuthHandler
	failureTracker *middleware.FailureTracker
	oauthMu        sync.RWMutex
}

type backgroundServices struct {
	gpuUtilWorker    *GPUUtilizationWorker
	workloadHandlers *workloads.WorkloadHandlers
	rewardsHandler   *rewards.RewardsHandler
}

type quantumWorkloadCache struct {
	mu          sync.RWMutex
	available   bool
	refreshedAt time.Time
}

func newServerLifecycle(loadingSrv *http.Server) *serverLifecycle {
	return &serverLifecycle{
		loadingSrv: loadingSrv,
		done:       make(chan struct{}),
	}
}

func newAuthRuntime() *authRuntime {
	return &authRuntime{}
}

func newBackgroundServices() *backgroundServices {
	return &backgroundServices{}
}

func newQuantumWorkloadCache() *quantumWorkloadCache {
	return &quantumWorkloadCache{}
}

func (q *quantumWorkloadCache) isRunning(k8sClient *k8s.MultiClusterClient) bool {
	if os.Getenv("QUANTUM_WORKLOAD_DISABLED") == "true" {
		return false
	}
	if os.Getenv("QUANTUM_WORKLOAD_RUNNING") == "true" {
		return true
	}

	q.mu.RLock()
	if time.Since(q.refreshedAt) < quantumWorkloadCacheTTL {
		defer q.mu.RUnlock()
		return q.available
	}
	q.mu.RUnlock()

	available := false
	if k8sClient != nil {
		ctx, cancel := context.WithTimeout(context.Background(), quantumDetectionTimeout)
		defer cancel()

		clusters, err := k8sClient.ListClusters(ctx)
		if err == nil {
			for _, cluster := range clusters {
				deployments, err := k8sClient.GetDeployments(ctx, cluster.Context, quantumWorkloadNamespace)
				if err != nil {
					continue
				}
				for _, deploy := range deployments {
					if deploy.Name == quantumWorkloadDeployment && deploy.AvailableReplicas > 0 {
						available = true
						break
					}
				}
				if available {
					break
				}
			}
		}
	}

	q.mu.Lock()
	q.available = available
	q.refreshedAt = time.Now()
	q.mu.Unlock()

	return available
}
