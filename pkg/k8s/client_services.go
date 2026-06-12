package k8s

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ServicePortDetail is a structured view of a ServicePort that preserves
// the optional port name (issue #6163). The legacy Ports []string field is
// retained for backwards compatibility; new code should prefer this.
type ServicePortDetail struct {
	// Name of the port as defined on the k8s ServicePort (may be empty).
	// When present it is a well-known name like "http" or "metrics" that
	// operators configure to identify a port across the cluster.
	Name string `json:"name,omitempty"`
	// Port is the service-level port (spec.ports[].port).
	Port int32 `json:"port"`
	// Protocol is TCP / UDP / SCTP.
	Protocol string `json:"protocol,omitempty"`
	// NodePort is the externally-exposed port for NodePort / LoadBalancer
	// services. Zero for ClusterIP services.
	NodePort int32 `json:"nodePort,omitempty"`
}

// Service represents a Kubernetes service
type Service struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Cluster    string `json:"cluster,omitempty"`
	Type       string `json:"type"` // ClusterIP, NodePort, LoadBalancer, ExternalName
	ClusterIP  string `json:"clusterIP,omitempty"`
	ExternalIP string `json:"externalIP,omitempty"`
	// Ports is the legacy flat string representation of the ports, kept
	// for existing consumers. Format: "80/TCP" or "80:30080/TCP" when a
	// NodePort is allocated. Prefer PortDetails for new code.
	Ports []string `json:"ports,omitempty"`
	// PortDetails is the structured representation of the ServicePorts
	// including the optional name field (issue #6163). Same length and
	// ordering as Ports.
	PortDetails []ServicePortDetail `json:"portDetails,omitempty"`
	// Endpoints is the number of ready backend addresses summed across all
	// subsets of the matching core/v1 Endpoints object (i.e. actual pod
	// endpoints backing the service, NOT the number of services themselves).
	// Issue #6150: the Services dashboard stat should sum this value across
	// services instead of counting services.
	Endpoints int `json:"endpoints"`
	// LBStatus describes the provisioning state of a LoadBalancer service.
	// For non-LoadBalancer services this is the empty string. For a
	// LoadBalancer service this is either LBStatusReady (ingress IP/hostname
	// has been assigned) or LBStatusProvisioning (cloud provider has not yet
	// provisioned an address). Issue #6153.
	LBStatus string `json:"lbStatus,omitempty"`
	// Selector is the label selector used by the service to match backing
	// pods (corev1.ServiceSpec.Selector). Surfaced so the frontend can
	// detect orphaned services (selector present but no matching pods,
	// issue #6164) and services with an empty selector that are not
	// ExternalName (config bug, issue #6166). nil for ExternalName.
	Selector    map[string]string `json:"selector,omitempty"`
	Age         string            `json:"age,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
}

// LoadBalancer provisioning status values. Defined as exported constants so
// the frontend/backend agree on the wire format and there are no magic
// strings sprinkled through the code.
const (
	// LBStatusProvisioning means the service is type=LoadBalancer but the
	// cloud provider has not yet populated status.loadBalancer.ingress.
	LBStatusProvisioning = "Provisioning"
	// LBStatusReady means status.loadBalancer.ingress has at least one
	// IP or hostname populated.
	LBStatusReady = "Ready"
)

// Ingress represents a Kubernetes Ingress
type Ingress struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Cluster   string            `json:"cluster,omitempty"`
	Class     string            `json:"class,omitempty"`
	Hosts     []string          `json:"hosts"`
	Address   string            `json:"address,omitempty"`
	Age       string            `json:"age,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// NetworkPolicy represents a Kubernetes NetworkPolicy
type NetworkPolicy struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	PolicyTypes []string          `json:"policyTypes"`
	PodSelector string            `json:"podSelector"`
	Age         string            `json:"age,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
}

// GetServices returns all services in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetServices(ctx context.Context, contextName, namespace string) ([]Service, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	services, err := client.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	// Fetch the corresponding core/v1 Endpoints objects so we can report the
	// real number of ready addresses backing each service. We list in the
	// same namespace scope as the Services list call so the result set is
	// comparable. If this call fails we still return services with
	// Endpoints=0 rather than failing the whole request (issue #6150), but
	// we log the error so operators can see RBAC / connectivity problems
	// instead of silently seeing every service report zero ready endpoints
	// (issue #9091).
	endpointReadyCounts := make(map[string]int) // key: "<namespace>/<name>"
	if epList, epErr := client.CoreV1().Endpoints(namespace).List(ctx, metav1.ListOptions{}); epErr == nil {
		for _, ep := range epList.Items {
			ready := 0
			for _, subset := range ep.Subsets {
				ready += len(subset.Addresses)
			}
			endpointReadyCounts[ep.Namespace+"/"+ep.Name] = ready
		}
	} else {
		slog.Error("[Services] failed to list endpoints for readiness counts",
			"cluster", contextName, "namespace", namespace, "error", epErr)
	}

	var result []Service
	for _, svc := range services.Items {
		// Build ports list. We populate both the legacy flat []string
		// form (existing consumers) and the structured PortDetails form
		// which preserves the port Name (issue #6163).
		var ports []string
		var portDetails []ServicePortDetail
		for _, p := range svc.Spec.Ports {
			portStr := fmt.Sprintf("%d/%s", p.Port, p.Protocol)
			if p.NodePort != 0 {
				portStr = fmt.Sprintf("%d:%d/%s", p.Port, p.NodePort, p.Protocol)
			}
			ports = append(ports, portStr)
			portDetails = append(portDetails, ServicePortDetail{
				Name:     p.Name,
				Port:     p.Port,
				Protocol: string(p.Protocol),
				NodePort: p.NodePort,
			})
		}

		// Resolve external IP and LoadBalancer provisioning status.
		// For LoadBalancer services, if status.loadBalancer.ingress is
		// empty we mark the service as Provisioning and leave ExternalIP
		// blank (issue #6153). status.loadBalancer.ingress.ip takes
		// precedence over hostname, and spec.externalIPs (statically
		// assigned) overrides both.
		externalIP := ""
		lbStatus := ""
		if len(svc.Status.LoadBalancer.Ingress) > 0 {
			if svc.Status.LoadBalancer.Ingress[0].IP != "" {
				externalIP = svc.Status.LoadBalancer.Ingress[0].IP
			} else if svc.Status.LoadBalancer.Ingress[0].Hostname != "" {
				externalIP = svc.Status.LoadBalancer.Ingress[0].Hostname
			}
		}
		if len(svc.Spec.ExternalIPs) > 0 {
			externalIP = svc.Spec.ExternalIPs[0]
		}
		if svc.Spec.Type == corev1.ServiceTypeLoadBalancer {
			if externalIP == "" {
				lbStatus = LBStatusProvisioning
			} else {
				lbStatus = LBStatusReady
			}
		}

		// Calculate age
		age := formatAge(svc.CreationTimestamp.Time)

		result = append(result, Service{
			Name:        svc.Name,
			Namespace:   svc.Namespace,
			Cluster:     contextName,
			Type:        string(svc.Spec.Type),
			ClusterIP:   svc.Spec.ClusterIP,
			ExternalIP:  externalIP,
			Ports:       ports,
			PortDetails: portDetails,
			Endpoints:   endpointReadyCounts[svc.Namespace+"/"+svc.Name],
			LBStatus:    lbStatus,
			Selector:    svc.Spec.Selector,
			Age:         age,
			Labels:      svc.Labels,
			Annotations: svc.Annotations,
		})
	}

	return result, nil
}

// GetIngresses returns all Ingresses in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetIngresses(ctx context.Context, contextName, namespace string) ([]Ingress, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	ingList, err := client.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Ingress
	for _, ing := range ingList.Items {
		var hosts []string
		for _, rule := range ing.Spec.Rules {
			if rule.Host != "" {
				hosts = append(hosts, rule.Host)
			}
		}
		var address string
		if len(ing.Status.LoadBalancer.Ingress) > 0 {
			lb := ing.Status.LoadBalancer.Ingress[0]
			if lb.Hostname != "" {
				address = lb.Hostname
			} else if lb.IP != "" {
				address = lb.IP
			}
		}
		ingressClass := ""
		if ing.Spec.IngressClassName != nil {
			ingressClass = *ing.Spec.IngressClassName
		}
		result = append(result, Ingress{
			Name:      ing.Name,
			Namespace: ing.Namespace,
			Cluster:   contextName,
			Class:     ingressClass,
			Hosts:     hosts,
			Address:   address,
			Age:       formatAge(ing.CreationTimestamp.Time),
			Labels:    ing.Labels,
		})
	}

	return result, nil
}

// GetNetworkPolicies returns all NetworkPolicies in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetNetworkPolicies(ctx context.Context, contextName, namespace string) ([]NetworkPolicy, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	npList, err := client.NetworkingV1().NetworkPolicies(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []NetworkPolicy
	for _, np := range npList.Items {
		var policyTypes []string
		for _, pt := range np.Spec.PolicyTypes {
			policyTypes = append(policyTypes, string(pt))
		}
		podSelector := ""
		if len(np.Spec.PodSelector.MatchLabels) > 0 {
			var parts []string
			for k, v := range np.Spec.PodSelector.MatchLabels {
				parts = append(parts, k+"="+v)
			}
			podSelector = strings.Join(parts, ",")
		} else {
			podSelector = "(all pods)"
		}
		result = append(result, NetworkPolicy{
			Name:        np.Name,
			Namespace:   np.Namespace,
			Cluster:     contextName,
			PolicyTypes: policyTypes,
			PodSelector: podSelector,
			Age:         formatAge(np.CreationTimestamp.Time),
			Labels:      np.Labels,
		})
	}

	return result, nil
}
