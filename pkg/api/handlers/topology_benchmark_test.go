package handlers

import (
	"fmt"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

func BenchmarkBuildTopologyGraph(b *testing.B) {
	numExports := 100
	numImports := 100
	numGateways := 50
	numRoutes := 100

	exports := &v1alpha1.ServiceExportList{}
	for i := 0; i < numExports; i++ {
		exports.Items = append(exports.Items, v1alpha1.ServiceExport{
			Name:      fmt.Sprintf("export-%d", i),
			Namespace: "default",
			Cluster:   fmt.Sprintf("cluster-%d", i%5),
			Status:    v1alpha1.ServiceExportStatusReady,
			CreatedAt: time.Now(),
		})
	}

	imports := &v1alpha1.ServiceImportList{}
	for i := 0; i < numImports; i++ {
		imports.Items = append(imports.Items, v1alpha1.ServiceImport{
			Name:          fmt.Sprintf("import-%d", i),
			Namespace:     "default",
			Cluster:       fmt.Sprintf("cluster-%d", (i+1)%5),
			SourceCluster: fmt.Sprintf("cluster-%d", i%5),
			Endpoints:     1,
			CreatedAt:     time.Now(),
		})
	}

	gateways := &v1alpha1.GatewayList{}
	for i := 0; i < numGateways; i++ {
		gateways.Items = append(gateways.Items, v1alpha1.Gateway{
			Name:      fmt.Sprintf("gw-%d", i),
			Namespace: "default",
			Cluster:   fmt.Sprintf("cluster-%d", i%5),
			Status:    v1alpha1.GatewayStatusAccepted,
			CreatedAt: time.Now(),
		})
	}

	routes := &v1alpha1.HTTPRouteList{}
	for i := 0; i < numRoutes; i++ {
		routes.Items = append(routes.Items, v1alpha1.HTTPRoute{
			Name:      fmt.Sprintf("route-%d", i),
			Namespace: "default",
			Cluster:   fmt.Sprintf("cluster-%d", i%5),
			ParentRefs: []v1alpha1.RouteParent{
				{
					Name: fmt.Sprintf("gw-%d", i%numGateways),
					Kind: "Gateway",
				},
			},
			CreatedAt: time.Now(),
		})
	}

	h := &TopologyHandlers{}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		h.buildTopologyGraph(exports, imports, gateways, routes)
	}
}
