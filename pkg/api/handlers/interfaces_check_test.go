package handlers

// Compile-time interface satisfaction checks.
// These verify that *k8s.MultiClusterClient implements the narrow
// consumer interfaces defined in this package. The check is performed
// at compile time — no test body is needed.
//
// Uncomment once the pkg/k8s import cycle (#17576) is resolved:
//
// import "github.com/kubestellar/console/pkg/k8s"
//
// var _ gatewayK8sClient = (*k8s.MultiClusterClient)(nil)
// var _ mcsK8sClient = (*k8s.MultiClusterClient)(nil)
// var _ namespaceK8sClient = (*k8s.MultiClusterClient)(nil)
// var _ rbacK8sClient = (*k8s.MultiClusterClient)(nil)
