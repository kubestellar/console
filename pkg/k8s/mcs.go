package k8s

import (
	"context"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

// ListServiceExports lists all ServiceExport resources across all clusters
func (m *MultiClusterClient) ListServiceExports(ctx context.Context) (*v1alpha1.ServiceExportList, error) {
	m.mu.RLock()
	clusters := make([]string, 0, len(m.clients))
	for name := range m.clients {
		clusters = append(clusters, name)
	}
	m.mu.RUnlock()

	var wg sync.WaitGroup
	var mu sync.Mutex
	exports := make([]v1alpha1.ServiceExport, 0)

	for _, clusterName := range clusters {
		wg.Add(1)
		go func(cluster string) {
			defer wg.Done()

			clusterExports, err := m.ListServiceExportsForCluster(ctx, cluster, "")
			if err != nil {
				return
			}

			mu.Lock()
			exports = append(exports, clusterExports...)
			mu.Unlock()
		}(clusterName)
	}

	wg.Wait()

	return &v1alpha1.ServiceExportList{
		Items:      exports,
		TotalCount: len(exports),
	}, nil
}

// ListServiceExportsForCluster lists ServiceExport resources in a specific cluster
func (m *MultiClusterClient) ListServiceExportsForCluster(ctx context.Context, contextName, namespace string) ([]v1alpha1.ServiceExport, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return nil, err
	}

	var list interface{}
	if namespace == "" {
		list, err = dynamicClient.Resource(v1alpha1.ServiceExportGVR).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynamicClient.Resource(v1alpha1.ServiceExportGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	}

	if err != nil {
		// MCS CRDs might not be installed - return empty list instead of error
		return []v1alpha1.ServiceExport{}, nil
	}

	// Use type assertion with the concrete unstructured list type
	unstructuredList, ok := list.(interface {
		GetItems() []interface{ GetName() string }
	})
	if !ok {
		// Fall back to accessing Items directly via interface
		return m.parseServiceExportsFromList(list, contextName)
	}

	_ = unstructuredList // Avoid unused variable
	return m.parseServiceExportsFromList(list, contextName)
}

// parseServiceExportsFromList parses ServiceExports from an unstructured list
func (m *MultiClusterClient) parseServiceExportsFromList(list interface{}, contextName string) ([]v1alpha1.ServiceExport, error) {
	// The dynamic client returns *unstructured.UnstructuredList
	// We access it via reflection/type assertion on the Items field
	type unstructuredList interface {
		GetItems() []map[string]interface{}
	}

	// Try direct access via the UnstructuredList type pattern
	type itemsHolder struct {
		Items []struct {
			Object map[string]interface{}
		}
	}

	exports := make([]v1alpha1.ServiceExport, 0)

	// Use reflection-free approach by checking for Items field
	if listMap, ok := list.(interface{ EachListItem(func(interface{}) error) error }); ok {
		_ = listMap.EachListItem(func(obj interface{}) error {
			if item, ok := obj.(interface {
				GetName() string
				GetNamespace() string
				GetCreationTimestamp() metav1.Time
				UnstructuredContent() map[string]interface{}
			}); ok {
				export := v1alpha1.ServiceExport{
					Name:        item.GetName(),
					Namespace:   item.GetNamespace(),
					Cluster:     contextName,
					ServiceName: item.GetName(),
					Status:      v1alpha1.ServiceExportStatusUnknown,
					CreatedAt:   item.GetCreationTimestamp().Time,
				}

				// Parse conditions from the unstructured content
				content := item.UnstructuredContent()
				if conditions, found, _ := unstructuredNestedSlice(content, "status", "conditions"); found {
					export.Conditions = parseConditions(conditions)
					export.Status = determineServiceExportStatus(export.Conditions)
				}

				exports = append(exports, export)
			}
			return nil
		})
	}

	return exports, nil
}

// ListServiceImports lists all ServiceImport resources across all clusters
func (m *MultiClusterClient) ListServiceImports(ctx context.Context) (*v1alpha1.ServiceImportList, error) {
	m.mu.RLock()
	clusters := make([]string, 0, len(m.clients))
	for name := range m.clients {
		clusters = append(clusters, name)
	}
	m.mu.RUnlock()

	var wg sync.WaitGroup
	var mu sync.Mutex
	imports := make([]v1alpha1.ServiceImport, 0)

	for _, clusterName := range clusters {
		wg.Add(1)
		go func(cluster string) {
			defer wg.Done()

			clusterImports, err := m.ListServiceImportsForCluster(ctx, cluster, "")
			if err != nil {
				return
			}

			mu.Lock()
			imports = append(imports, clusterImports...)
			mu.Unlock()
		}(clusterName)
	}

	wg.Wait()

	return &v1alpha1.ServiceImportList{
		Items:      imports,
		TotalCount: len(imports),
	}, nil
}

// ListServiceImportsForCluster lists ServiceImport resources in a specific cluster
func (m *MultiClusterClient) ListServiceImportsForCluster(ctx context.Context, contextName, namespace string) ([]v1alpha1.ServiceImport, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return nil, err
	}

	var list interface{}
	if namespace == "" {
		list, err = dynamicClient.Resource(v1alpha1.ServiceImportGVR).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynamicClient.Resource(v1alpha1.ServiceImportGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	}

	if err != nil {
		// MCS CRDs might not be installed - return empty list instead of error
		return []v1alpha1.ServiceImport{}, nil
	}

	return m.parseServiceImportsFromList(list, contextName)
}

// parseServiceImportsFromList parses ServiceImports from an unstructured list
func (m *MultiClusterClient) parseServiceImportsFromList(list interface{}, contextName string) ([]v1alpha1.ServiceImport, error) {
	imports := make([]v1alpha1.ServiceImport, 0)

	if listMap, ok := list.(interface{ EachListItem(func(interface{}) error) error }); ok {
		_ = listMap.EachListItem(func(obj interface{}) error {
			if item, ok := obj.(interface {
				GetName() string
				GetNamespace() string
				GetCreationTimestamp() metav1.Time
				UnstructuredContent() map[string]interface{}
			}); ok {
				imp := v1alpha1.ServiceImport{
					Name:      item.GetName(),
					Namespace: item.GetNamespace(),
					Cluster:   contextName,
					Type:      v1alpha1.ServiceImportTypeClusterSetIP,
					CreatedAt: item.GetCreationTimestamp().Time,
				}

				content := item.UnstructuredContent()

				// Parse spec
				if spec, found, _ := unstructuredNestedMap(content, "spec"); found {
					if t, ok := spec["type"].(string); ok {
						imp.Type = v1alpha1.ServiceImportType(t)
					}
					if ports, found, _ := unstructuredNestedSlice(content, "spec", "ports"); found {
						imp.Ports = parsePorts(ports)
					}
				}

				// Parse status for source cluster
				if clusters, found, _ := unstructuredNestedSlice(content, "status", "clusters"); found {
					if len(clusters) > 0 {
						if cluster, ok := clusters[0].(map[string]interface{}); ok {
							if name, ok := cluster["cluster"].(string); ok {
								imp.SourceCluster = name
							}
						}
					}
				}

				// Generate DNS name
				imp.DNSName = imp.Name + "." + imp.Namespace + ".svc.clusterset.local"

				// Parse conditions
				if conditions, found, _ := unstructuredNestedSlice(content, "status", "conditions"); found {
					imp.Conditions = parseConditions(conditions)
				}

				imports = append(imports, imp)
			}
			return nil
		})
	}

	return imports, nil
}

// CreateServiceExport creates a new ServiceExport to export an existing service
func (m *MultiClusterClient) CreateServiceExport(ctx context.Context, contextName, namespace, serviceName string) error {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return err
	}

	// Create the ServiceExport with the same name as the service being exported
	serviceExport := map[string]interface{}{
		"apiVersion": v1alpha1.ServiceExportGVR.Group + "/" + v1alpha1.ServiceExportGVR.Version,
		"kind":       "ServiceExport",
		"metadata": map[string]interface{}{
			"name":      serviceName,
			"namespace": namespace,
		},
	}

	// Convert to unstructured and create
	unstructuredObj := &unstructured.Unstructured{Object: serviceExport}
	_, err = dynamicClient.Resource(v1alpha1.ServiceExportGVR).Namespace(namespace).Create(ctx, unstructuredObj, metav1.CreateOptions{})
	return err
}

// DeleteServiceExport deletes a ServiceExport by name
func (m *MultiClusterClient) DeleteServiceExport(ctx context.Context, contextName, namespace, name string) error {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return err
	}

	return dynamicClient.Resource(v1alpha1.ServiceExportGVR).Namespace(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

// IsMCSAvailable checks if MCS CRDs are installed in a cluster
func (m *MultiClusterClient) IsMCSAvailable(ctx context.Context, contextName string) bool {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return false
	}

	// Try to list ServiceExports - if it works, MCS is available
	_, err = dynamicClient.Resource(v1alpha1.ServiceExportGVR).List(ctx, metav1.ListOptions{Limit: 1})
	return err == nil
}

// parseConditions converts unstructured conditions to typed Condition slice
func parseConditions(conditions []interface{}) []v1alpha1.Condition {
	result := make([]v1alpha1.Condition, 0, len(conditions))
	for _, cond := range conditions {
		if condMap, ok := cond.(map[string]interface{}); ok {
			c := v1alpha1.Condition{}
			if t, ok := condMap["type"].(string); ok {
				c.Type = t
			}
			if status, ok := condMap["status"].(string); ok {
				c.Status = status
			}
			if reason, ok := condMap["reason"].(string); ok {
				c.Reason = reason
			}
			if message, ok := condMap["message"].(string); ok {
				c.Message = message
			}
			if lastTransition, ok := condMap["lastTransitionTime"].(string); ok {
				if t, err := time.Parse(time.RFC3339, lastTransition); err == nil {
					c.LastTransitionTime = t
				}
			}
			result = append(result, c)
		}
	}
	return result
}

// determineServiceExportStatus determines the overall status from conditions
func determineServiceExportStatus(conditions []v1alpha1.Condition) v1alpha1.ServiceExportStatus {
	for _, c := range conditions {
		if c.Type == "Valid" || c.Type == "Ready" {
			if c.Status == "True" {
				return v1alpha1.ServiceExportStatusReady
			} else if c.Status == "False" {
				return v1alpha1.ServiceExportStatusFailed
			}
		}
	}
	if len(conditions) == 0 {
		return v1alpha1.ServiceExportStatusPending
	}
	return v1alpha1.ServiceExportStatusUnknown
}

// parsePorts converts unstructured ports to typed ServicePort slice
func parsePorts(ports []interface{}) []v1alpha1.ServicePort {
	result := make([]v1alpha1.ServicePort, 0, len(ports))
	for _, p := range ports {
		if portMap, ok := p.(map[string]interface{}); ok {
			port := v1alpha1.ServicePort{
				Protocol: "TCP", // default
			}
			if name, ok := portMap["name"].(string); ok {
				port.Name = name
			}
			if protocol, ok := portMap["protocol"].(string); ok {
				port.Protocol = protocol
			}
			if portNum, ok := portMap["port"].(int64); ok {
				port.Port = int32(portNum)
			} else if portNum, ok := portMap["port"].(float64); ok {
				port.Port = int32(portNum)
			}
			if appProtocol, ok := portMap["appProtocol"].(string); ok {
				port.AppProtocol = appProtocol
			}
			result = append(result, port)
		}
	}
	return result
}
