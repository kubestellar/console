package k8s

import (
	"context"
	"sync"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

// ListGateways lists all Gateway resources across all clusters
func (m *MultiClusterClient) ListGateways(ctx context.Context) (*v1alpha1.GatewayList, error) {
	m.mu.RLock()
	clusters := make([]string, 0, len(m.clients))
	for name := range m.clients {
		clusters = append(clusters, name)
	}
	m.mu.RUnlock()

	var wg sync.WaitGroup
	var mu sync.Mutex
	gateways := make([]v1alpha1.Gateway, 0)

	for _, clusterName := range clusters {
		wg.Add(1)
		go func(cluster string) {
			defer wg.Done()

			clusterGateways, err := m.ListGatewaysForCluster(ctx, cluster, "")
			if err != nil {
				return
			}

			mu.Lock()
			gateways = append(gateways, clusterGateways...)
			mu.Unlock()
		}(clusterName)
	}

	wg.Wait()

	return &v1alpha1.GatewayList{
		Items:      gateways,
		TotalCount: len(gateways),
	}, nil
}

// ListGatewaysForCluster lists Gateway resources in a specific cluster
func (m *MultiClusterClient) ListGatewaysForCluster(ctx context.Context, contextName, namespace string) ([]v1alpha1.Gateway, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return nil, err
	}

	// Try v1 first, then fall back to v1beta1
	var list interface{}
	if namespace == "" {
		list, err = dynamicClient.Resource(v1alpha1.GatewayGVR).List(ctx, metav1.ListOptions{})
		if err != nil {
			// Try v1beta1 fallback
			list, err = dynamicClient.Resource(v1alpha1.GatewayGVRv1beta1).List(ctx, metav1.ListOptions{})
		}
	} else {
		list, err = dynamicClient.Resource(v1alpha1.GatewayGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			// Try v1beta1 fallback
			list, err = dynamicClient.Resource(v1alpha1.GatewayGVRv1beta1).Namespace(namespace).List(ctx, metav1.ListOptions{})
		}
	}

	if err != nil {
		// Gateway API CRDs might not be installed - return empty list instead of error
		return []v1alpha1.Gateway{}, nil
	}

	return m.parseGatewaysFromList(list, contextName)
}

// parseGatewaysFromList parses Gateways from an unstructured list
func (m *MultiClusterClient) parseGatewaysFromList(list interface{}, contextName string) ([]v1alpha1.Gateway, error) {
	gateways := make([]v1alpha1.Gateway, 0)

	if listMap, ok := list.(interface{ EachListItem(func(interface{}) error) error }); ok {
		_ = listMap.EachListItem(func(obj interface{}) error {
			if item, ok := obj.(interface {
				GetName() string
				GetNamespace() string
				GetCreationTimestamp() metav1.Time
				UnstructuredContent() map[string]interface{}
			}); ok {
				gw := v1alpha1.Gateway{
					Name:      item.GetName(),
					Namespace: item.GetNamespace(),
					Cluster:   contextName,
					Status:    v1alpha1.GatewayStatusUnknown,
					CreatedAt: item.GetCreationTimestamp().Time,
				}

				content := item.UnstructuredContent()

				// Parse spec
				if spec, found, _ := unstructuredNestedMap(content, "spec"); found {
					if gatewayClassName, ok := spec["gatewayClassName"].(string); ok {
						gw.GatewayClass = gatewayClassName
					}
					if listeners, found, _ := unstructuredNestedSlice(content, "spec", "listeners"); found {
						gw.Listeners = parseListeners(listeners)
					}
				}

				// Parse status
				if addresses, found, _ := unstructuredNestedSlice(content, "status", "addresses"); found {
					gw.Addresses = parseAddresses(addresses)
				}

				if conditions, found, _ := unstructuredNestedSlice(content, "status", "conditions"); found {
					gw.Conditions = parseConditions(conditions)
					gw.Status = determineGatewayStatus(gw.Conditions)
				}

				// Count attached routes from listeners status
				if listenerStatuses, found, _ := unstructuredNestedSlice(content, "status", "listeners"); found {
					for _, ls := range listenerStatuses {
						if lsMap, ok := ls.(map[string]interface{}); ok {
							if attachedRoutes, ok := lsMap["attachedRoutes"].(int64); ok {
								gw.AttachedRoutes += int(attachedRoutes)
							} else if attachedRoutes, ok := lsMap["attachedRoutes"].(float64); ok {
								gw.AttachedRoutes += int(attachedRoutes)
							}
						}
					}
				}

				gateways = append(gateways, gw)
			}
			return nil
		})
	}

	return gateways, nil
}

// ListHTTPRoutes lists all HTTPRoute resources across all clusters
func (m *MultiClusterClient) ListHTTPRoutes(ctx context.Context) (*v1alpha1.HTTPRouteList, error) {
	m.mu.RLock()
	clusters := make([]string, 0, len(m.clients))
	for name := range m.clients {
		clusters = append(clusters, name)
	}
	m.mu.RUnlock()

	var wg sync.WaitGroup
	var mu sync.Mutex
	routes := make([]v1alpha1.HTTPRoute, 0)

	for _, clusterName := range clusters {
		wg.Add(1)
		go func(cluster string) {
			defer wg.Done()

			clusterRoutes, err := m.ListHTTPRoutesForCluster(ctx, cluster, "")
			if err != nil {
				return
			}

			mu.Lock()
			routes = append(routes, clusterRoutes...)
			mu.Unlock()
		}(clusterName)
	}

	wg.Wait()

	return &v1alpha1.HTTPRouteList{
		Items:      routes,
		TotalCount: len(routes),
	}, nil
}

// ListHTTPRoutesForCluster lists HTTPRoute resources in a specific cluster
func (m *MultiClusterClient) ListHTTPRoutesForCluster(ctx context.Context, contextName, namespace string) ([]v1alpha1.HTTPRoute, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return nil, err
	}

	// Try v1 first, then fall back to v1beta1
	var list interface{}
	if namespace == "" {
		list, err = dynamicClient.Resource(v1alpha1.HTTPRouteGVR).List(ctx, metav1.ListOptions{})
		if err != nil {
			// Try v1beta1 fallback
			list, err = dynamicClient.Resource(v1alpha1.HTTPRouteGVRv1beta1).List(ctx, metav1.ListOptions{})
		}
	} else {
		list, err = dynamicClient.Resource(v1alpha1.HTTPRouteGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			// Try v1beta1 fallback
			list, err = dynamicClient.Resource(v1alpha1.HTTPRouteGVRv1beta1).Namespace(namespace).List(ctx, metav1.ListOptions{})
		}
	}

	if err != nil {
		// Gateway API CRDs might not be installed - return empty list instead of error
		return []v1alpha1.HTTPRoute{}, nil
	}

	return m.parseHTTPRoutesFromList(list, contextName)
}

// parseHTTPRoutesFromList parses HTTPRoutes from an unstructured list
func (m *MultiClusterClient) parseHTTPRoutesFromList(list interface{}, contextName string) ([]v1alpha1.HTTPRoute, error) {
	routes := make([]v1alpha1.HTTPRoute, 0)

	if listMap, ok := list.(interface{ EachListItem(func(interface{}) error) error }); ok {
		_ = listMap.EachListItem(func(obj interface{}) error {
			if item, ok := obj.(interface {
				GetName() string
				GetNamespace() string
				GetCreationTimestamp() metav1.Time
				UnstructuredContent() map[string]interface{}
			}); ok {
				route := v1alpha1.HTTPRoute{
					Name:      item.GetName(),
					Namespace: item.GetNamespace(),
					Cluster:   contextName,
					Status:    v1alpha1.HTTPRouteStatusUnknown,
					CreatedAt: item.GetCreationTimestamp().Time,
				}

				content := item.UnstructuredContent()

				// Parse spec
				if hostnames, found, _ := unstructuredNestedSlice(content, "spec", "hostnames"); found {
					for _, h := range hostnames {
						if hostname, ok := h.(string); ok {
							route.Hostnames = append(route.Hostnames, hostname)
						}
					}
				}

				if parentRefs, found, _ := unstructuredNestedSlice(content, "spec", "parentRefs"); found {
					route.ParentRefs = parseParentRefs(parentRefs)
				}

				// Parse conditions from status
				if conditions, found, _ := unstructuredNestedSlice(content, "status", "parents"); found {
					// HTTPRoute has parent-specific conditions
					for _, parent := range conditions {
						if parentMap, ok := parent.(map[string]interface{}); ok {
							if parentConditions, ok := parentMap["conditions"].([]interface{}); ok {
								route.Conditions = append(route.Conditions, parseConditions(parentConditions)...)
							}
						}
					}
					route.Status = determineHTTPRouteStatus(route.Conditions)
				}

				routes = append(routes, route)
			}
			return nil
		})
	}

	return routes, nil
}

// IsGatewayAPIAvailable checks if Gateway API CRDs are installed in a cluster
func (m *MultiClusterClient) IsGatewayAPIAvailable(ctx context.Context, contextName string) bool {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return false
	}

	// Try to list Gateways - if it works, Gateway API is available
	_, err = dynamicClient.Resource(v1alpha1.GatewayGVR).List(ctx, metav1.ListOptions{Limit: 1})
	if err == nil {
		return true
	}

	// Try v1beta1 fallback
	_, err = dynamicClient.Resource(v1alpha1.GatewayGVRv1beta1).List(ctx, metav1.ListOptions{Limit: 1})
	return err == nil
}

// parseListeners parses listeners from unstructured data
func parseListeners(listeners []interface{}) []v1alpha1.Listener {
	result := make([]v1alpha1.Listener, 0, len(listeners))
	for _, l := range listeners {
		if lMap, ok := l.(map[string]interface{}); ok {
			listener := v1alpha1.Listener{
				Protocol: "HTTP", // default
			}
			if name, ok := lMap["name"].(string); ok {
				listener.Name = name
			}
			if protocol, ok := lMap["protocol"].(string); ok {
				listener.Protocol = protocol
			}
			if port, ok := lMap["port"].(int64); ok {
				listener.Port = int32(port)
			} else if port, ok := lMap["port"].(float64); ok {
				listener.Port = int32(port)
			}
			if hostname, ok := lMap["hostname"].(string); ok {
				listener.Hostname = hostname
			}
			result = append(result, listener)
		}
	}
	return result
}

// parseAddresses parses addresses from unstructured data
func parseAddresses(addresses []interface{}) []string {
	result := make([]string, 0, len(addresses))
	for _, a := range addresses {
		if aMap, ok := a.(map[string]interface{}); ok {
			if value, ok := aMap["value"].(string); ok {
				result = append(result, value)
			}
		}
	}
	return result
}

// parseParentRefs parses parent references from unstructured data
func parseParentRefs(parentRefs []interface{}) []v1alpha1.RouteParent {
	result := make([]v1alpha1.RouteParent, 0, len(parentRefs))
	for _, p := range parentRefs {
		if pMap, ok := p.(map[string]interface{}); ok {
			parent := v1alpha1.RouteParent{
				Kind: "Gateway", // default
			}
			if kind, ok := pMap["kind"].(string); ok {
				parent.Kind = kind
			}
			if name, ok := pMap["name"].(string); ok {
				parent.Name = name
			}
			if namespace, ok := pMap["namespace"].(string); ok {
				parent.Namespace = namespace
			}
			result = append(result, parent)
		}
	}
	return result
}

// determineGatewayStatus determines the overall status from conditions
func determineGatewayStatus(conditions []v1alpha1.Condition) v1alpha1.GatewayStatus {
	var isProgrammed, isAccepted bool
	for _, c := range conditions {
		if c.Type == "Programmed" && c.Status == "True" {
			isProgrammed = true
		}
		if c.Type == "Accepted" && c.Status == "True" {
			isAccepted = true
		}
		if c.Type == "Accepted" && c.Status == "False" {
			return v1alpha1.GatewayStatusNotAccepted
		}
	}
	if isProgrammed {
		return v1alpha1.GatewayStatusProgrammed
	}
	if isAccepted {
		return v1alpha1.GatewayStatusAccepted
	}
	if len(conditions) == 0 {
		return v1alpha1.GatewayStatusPending
	}
	return v1alpha1.GatewayStatusUnknown
}

// determineHTTPRouteStatus determines the overall status from conditions
func determineHTTPRouteStatus(conditions []v1alpha1.Condition) v1alpha1.HTTPRouteStatus {
	acceptedCount := 0
	totalParents := 0
	for _, c := range conditions {
		if c.Type == "Accepted" {
			totalParents++
			if c.Status == "True" {
				acceptedCount++
			}
		}
	}
	if totalParents == 0 {
		return v1alpha1.HTTPRouteStatusUnknown
	}
	if acceptedCount == totalParents {
		return v1alpha1.HTTPRouteStatusAccepted
	}
	if acceptedCount > 0 {
		return v1alpha1.HTTPRouteStatusPartiallyValid
	}
	return v1alpha1.HTTPRouteStatusNotAccepted
}
