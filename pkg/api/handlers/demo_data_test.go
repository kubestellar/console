package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
)

func TestDemoDataHelpers(t *testing.T) {
	app := fiber.New()

	t.Run("isDemoMode", func(t *testing.T) {
		app.Get("/is-demo", func(c *fiber.Ctx) error {
			return c.JSON(fiber.Map{"isDemo": IsDemoMode(c)})
		})

		// Case 1: Header set to true
		req := httptest.NewRequest("GET", "/is-demo", nil)
		req.Host = "localhost"
		req.Header.Set("X-Demo-Mode", "true")
		resp, _ := app.Test(req)
		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.True(t, result["isDemo"].(bool))

		// Case 2: Header set to false
		req = httptest.NewRequest("GET", "/is-demo", nil)
		req.Host = "localhost"
		req.Header.Set("X-Demo-Mode", "false")
		resp, _ = app.Test(req)
		json.NewDecoder(resp.Body).Decode(&result)
		assert.False(t, result["isDemo"].(bool))

		// Case 3: Header missing
		req = httptest.NewRequest("GET", "/is-demo", nil)
		req.Host = "localhost"
		resp, _ = app.Test(req)
		json.NewDecoder(resp.Body).Decode(&result)
		assert.False(t, result["isDemo"].(bool))
	})

	t.Run("errNoClusterAccess", func(t *testing.T) {
		app.Get("/no-access", func(c *fiber.Ctx) error {
			return ErrNoClusterAccess(c)
		})

		req := httptest.NewRequest("GET", "/no-access", nil)
		req.Host = "localhost"
		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.Equal(t, "No cluster access", result["error"])
	})

	t.Run("demoResponse", func(t *testing.T) {
		app.Get("/demo-resp", func(c *fiber.Ctx) error {
			return DemoResponse(c, "test-key", []string{"a", "b"})
		})

		req := httptest.NewRequest("GET", "/demo-resp", nil)
		req.Host = "localhost"
		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		assert.Equal(t, "demo", result["source"])
		assert.Equal(t, []interface{}{"a", "b"}, result["test-key"])
	})
}

func TestGetDemoFunctions(t *testing.T) {
	// Smoke tests for some demo data functions to ensure they don't panic and return something
	assert.NotEmpty(t, GetDemoClusters())
	assert.NotNil(t, GetDemoClusterHealth("kind-local"))
	assert.NotEmpty(t, GetDemoPods())
	assert.NotEmpty(t, GetDemoPodIssues())
	assert.NotEmpty(t, GetDemoEvents())
	assert.NotEmpty(t, GetDemoNodes())
	assert.NotEmpty(t, GetDemoDeployments())
	assert.NotEmpty(t, GetDemoServices())
	assert.NotEmpty(t, GetDemoGPUNodes())
	assert.NotEmpty(t, GetDemoGPUNodeHealth())
}

func TestGetDemoFunctions_All(t *testing.T) {
	t.Run("GetDemoWarningEvents", func(t *testing.T) {
		events := GetDemoWarningEvents()
		assert.NotEmpty(t, events)
		for _, e := range events {
			assert.Equal(t, "Warning", e.Type)
		}
	})

	t.Run("GetDemoDeploymentIssues", func(t *testing.T) {
		issues := GetDemoDeploymentIssues()
		assert.NotEmpty(t, issues)
		assert.Equal(t, "worker", issues[0].Name)
	})

	t.Run("GetDemoSecurityIssues", func(t *testing.T) {
		issues := GetDemoSecurityIssues()
		assert.NotEmpty(t, issues)
		assert.Equal(t, "RunningAsRoot", issues[0].Issue)
	})

	t.Run("GetDemoJobs", func(t *testing.T) {
		jobs := GetDemoJobs()
		assert.NotEmpty(t, jobs)
		assert.Equal(t, "data-migration-job", jobs[0].Name)
	})

	t.Run("GetDemoHPAs", func(t *testing.T) {
		hpas := GetDemoHPAs()
		assert.NotEmpty(t, hpas)
		assert.Equal(t, "frontend-hpa", hpas[0].Name)
	})

	t.Run("GetDemoConfigMaps", func(t *testing.T) {
		cms := GetDemoConfigMaps()
		assert.NotEmpty(t, cms)
		assert.Equal(t, "app-config", cms[0].Name)
	})

	t.Run("GetDemoSecrets", func(t *testing.T) {
		secrets := GetDemoSecrets()
		assert.NotEmpty(t, secrets)
		assert.Equal(t, "db-credentials", secrets[0].Name)
	})

	t.Run("GetDemoServiceAccounts", func(t *testing.T) {
		sas := GetDemoServiceAccounts()
		assert.NotEmpty(t, sas)
		assert.Equal(t, "default", sas[0].Name)
	})

	t.Run("GetDemoPVCs", func(t *testing.T) {
		pvcs := GetDemoPVCs()
		assert.NotEmpty(t, pvcs)
		assert.Equal(t, "postgres-data", pvcs[0].Name)
	})

	t.Run("GetDemoPVs", func(t *testing.T) {
		pvs := GetDemoPVs()
		assert.NotEmpty(t, pvs)
		assert.Equal(t, "pv-postgres-data", pvs[0].Name)
	})

	t.Run("GetDemoResourceQuotas", func(t *testing.T) {
		quotas := GetDemoResourceQuotas()
		assert.NotEmpty(t, quotas)
		assert.Equal(t, "production-quota", quotas[0].Name)
	})

	t.Run("GetDemoLimitRanges", func(t *testing.T) {
		limits := GetDemoLimitRanges()
		assert.NotEmpty(t, limits)
		assert.Equal(t, "default-limits", limits[0].Name)
	})

	t.Run("GetDemoReplicaSets", func(t *testing.T) {
		rs := GetDemoReplicaSets()
		assert.NotEmpty(t, rs)
		assert.Equal(t, "frontend-7d8f9c6b5", rs[0].Name)
	})

	t.Run("GetDemoStatefulSets", func(t *testing.T) {
		sts := GetDemoStatefulSets()
		assert.NotEmpty(t, sts)
		assert.Equal(t, "postgres", sts[0].Name)
	})

	t.Run("GetDemoDaemonSets", func(t *testing.T) {
		ds := GetDemoDaemonSets()
		assert.NotEmpty(t, ds)
		assert.Equal(t, "fluentd", ds[0].Name)
	})

	t.Run("GetDemoCronJobs", func(t *testing.T) {
		cronJobs := GetDemoCronJobs()
		assert.NotEmpty(t, cronJobs)
		assert.Equal(t, "db-backup", cronJobs[0].Name)
	})

	t.Run("GetDemoIngresses", func(t *testing.T) {
		ingresses := GetDemoIngresses()
		assert.NotEmpty(t, ingresses)
		assert.Equal(t, "frontend-ingress", ingresses[0].Name)
	})

	t.Run("GetDemoNetworkPolicies", func(t *testing.T) {
		policies := GetDemoNetworkPolicies()
		assert.NotEmpty(t, policies)
		assert.Equal(t, "deny-all", policies[0].Name)
	})

	t.Run("GetDemoFlatcarNodes", func(t *testing.T) {
		nodes := GetDemoFlatcarNodes()
		assert.NotEmpty(t, nodes)
		assert.Equal(t, "flatcar-worker-1", nodes[0].NodeName)
	})

	t.Run("GetDemoLimaInstances", func(t *testing.T) {
		instances := GetDemoLimaInstances()
		assert.NotEmpty(t, instances)
		assert.Equal(t, "lima-k3s", instances[0].Name)
	})

	t.Run("GetDemoNVIDIAOperatorStatus", func(t *testing.T) {
		statuses := GetDemoNVIDIAOperatorStatus()
		assert.NotEmpty(t, statuses)
		for _, s := range statuses {
			assert.NotNil(t, s)
		}
	})

	t.Run("GetDemoPodLogs", func(t *testing.T) {
		logs := GetDemoPodLogs()
		assert.NotEmpty(t, logs)
	})

	t.Run("GetDemoAllClusterHealth", func(t *testing.T) {
		health := GetDemoAllClusterHealth()
		assert.NotEmpty(t, health)
		assert.Equal(t, len(GetDemoClusters()), len(health))
	})

	t.Run("GetDemoWorkloads", func(t *testing.T) {
		workloads := GetDemoWorkloads()
		assert.NotEmpty(t, workloads)
		assert.Equal(t, "nginx-ingress", workloads[0].Name)
	})

	t.Run("GetDemoPodNetworkStats", func(t *testing.T) {
		stats := GetDemoPodNetworkStats()
		assert.NotEmpty(t, stats)
		assert.Equal(t, "tenant-1-vm-virt-launcher-abc12", stats[0].PodName)
	})

	t.Run("GetDemoCRDs", func(t *testing.T) {
		crds := GetDemoCRDs()
		assert.NotEmpty(t, crds)
		assert.Equal(t, "certificates", crds[0].Name)
	})

	t.Run("GetDemoWebhooks", func(t *testing.T) {
		webhooks := GetDemoWebhooks()
		assert.NotEmpty(t, webhooks)
		assert.Equal(t, "cert-manager-webhook", webhooks[0].Name)
	})

	t.Run("GetWasmCloudHosts", func(t *testing.T) {
		hosts := GetWasmCloudHosts()
		assert.NotEmpty(t, hosts)
		assert.Equal(t, "Nxyz1-host-prod-01", hosts[0]["id"])
	})

	t.Run("GetWasmCloudActors", func(t *testing.T) {
		actors := GetWasmCloudActors()
		assert.NotEmpty(t, actors)
		assert.Equal(t, "Mactor-http-server", actors[0]["id"])
	})
}

func TestGetDemoClusterHealth_UnknownCluster(t *testing.T) {
	health := GetDemoClusterHealth("nonexistent-cluster")
	assert.NotNil(t, health)
	assert.Equal(t, "nonexistent-cluster", health.Cluster)
	assert.True(t, health.Healthy)
	assert.True(t, health.Reachable)
}
