package workloads

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/apis/v1alpha1"
)

const (
	noClusterAccessMsg               = "No cluster access"
	defaultClusterFanoutConcurrency = 4
)

func isDemoMode(c *fiber.Ctx) bool {
	return c.Get("X-Demo-Mode") == "true"
}

func errNoClusterAccess(c *fiber.Ctx) error {
	return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": noClusterAccessMsg})
}

func demoResponse(c *fiber.Ctx, key string, data interface{}) error {
	return c.JSON(fiber.Map{key: data, "source": "demo"})
}

func handleK8sError(c *fiber.Ctx, err error) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
}

func getDemoWorkloads() []v1alpha1.Workload {
	now := time.Now()
	return []v1alpha1.Workload{
		{Name: "nginx-ingress", Namespace: "ingress-system", Type: "Deployment", Status: "Running", Replicas: 3, ReadyReplicas: 3, Image: "nginx/nginx-ingress:3.4.0", Labels: map[string]string{"app": "nginx-ingress"}, CreatedAt: now.Add(-30 * 24 * time.Hour)},
		{Name: "api-gateway", Namespace: "production", Type: "Deployment", Status: "Degraded", Replicas: 5, ReadyReplicas: 3, Image: "company/api-gateway:v2.5.1", Labels: map[string]string{"app": "api-gateway"}, CreatedAt: now.Add(-14 * 24 * time.Hour)},
		{Name: "redis-cluster", Namespace: "data", Type: "StatefulSet", Status: "Running", Replicas: 3, ReadyReplicas: 3, Image: "redis:7.2-alpine", Labels: map[string]string{"app": "redis"}, CreatedAt: now.Add(-60 * 24 * time.Hour)},
		{Name: "monitoring-agent", Namespace: "monitoring", Type: "DaemonSet", Status: "Running", Replicas: 4, ReadyReplicas: 4, Image: "prom/node-exporter:v1.7.0", Labels: map[string]string{"app": "node-exporter"}, CreatedAt: now.Add(-90 * 24 * time.Hour)},
	}
}
