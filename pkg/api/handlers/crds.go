package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// crdGVR is the GroupVersionResource for CustomResourceDefinitions
var crdGVR = schema.GroupVersionResource{
	Group:    "apiextensions.k8s.io",
	Version:  "v1",
	Resource: "customresourcedefinitions",
}

// CRDHandlers handles Custom Resource Definition API endpoints
type CRDHandlers struct {
	k8sClient *k8s.MultiClusterClient
}

// NewCRDHandlers creates a new CRD handlers instance
func NewCRDHandlers(k8sClient *k8s.MultiClusterClient) *CRDHandlers {
	return &CRDHandlers{
		k8sClient: k8sClient,
	}
}

// CRDSummary represents a CRD as returned by the API
type CRDSummary struct {
	Name      string       `json:"name"`
	Group     string       `json:"group"`
	Version   string       `json:"version"`
	Scope     string       `json:"scope"`
	Status    string       `json:"status"`
	Instances int          `json:"instances"`
	Cluster   string       `json:"cluster"`
	Versions  []CRDVersion `json:"versions,omitempty"`
}

// CRDVersion represents a single version of a CRD
type CRDVersion struct {
	Name    string `json:"name"`
	Served  bool   `json:"served"`
	Storage bool   `json:"storage"`
}

// CRDListResponse is the response for GET /api/crds
type CRDListResponse struct {
	CRDs       []CRDSummary `json:"crds"`
	IsDemoData bool         `json:"isDemoData"`
}

// HTTP status code for service unavailable
const statusServiceUnavailableCRD = 503

// ListCRDs returns all CRDs across clusters
// GET /api/crds
func (h *CRDHandlers) ListCRDs(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(statusServiceUnavailableCRD).JSON(CRDListResponse{
			CRDs:       []CRDSummary{},
			IsDemoData: true,
		})
	}

	clusters, err := h.k8sClient.DeduplicatedClusters(c.Context())
	if err != nil {
		clusters, _ = h.k8sClient.ListClusters(c.Context())
	}
	allCRDs := make([]CRDSummary, 0)

	for _, cluster := range clusters {
		client, err := h.k8sClient.GetDynamicClient(cluster.Name)
		if err != nil {
			continue
		}

		crdList, err := client.Resource(crdGVR).List(c.Context(), metav1.ListOptions{})
		if err != nil {
			continue
		}

		for _, item := range crdList.Items {
			crd := parseCRDFromUnstructured(&item, cluster.Name)
			if crd != nil {
				allCRDs = append(allCRDs, *crd)
			}
		}
	}

	return c.JSON(CRDListResponse{
		CRDs:       allCRDs,
		IsDemoData: false,
	})
}

// parseCRDFromUnstructured extracts CRD info from an unstructured object
func parseCRDFromUnstructured(item *unstructured.Unstructured, cluster string) *CRDSummary {
	spec, ok := item.Object["spec"].(map[string]interface{})
	if !ok {
		return nil
	}

	name := item.GetName()

	// Extract group
	group, _ := spec["group"].(string)

	// Extract scope
	scope, _ := spec["scope"].(string)

	// Extract versions
	versions := make([]CRDVersion, 0)
	var primaryVersion string
	if versionsRaw, ok := spec["versions"].([]interface{}); ok {
		for _, v := range versionsRaw {
			vMap, ok := v.(map[string]interface{})
			if !ok {
				continue
			}
			vName, _ := vMap["name"].(string)
			served, _ := vMap["served"].(bool)
			storage, _ := vMap["storage"].(bool)
			versions = append(versions, CRDVersion{
				Name:    vName,
				Served:  served,
				Storage: storage,
			})
			if storage {
				primaryVersion = vName
			}
		}
	}

	if primaryVersion == "" && len(versions) > 0 {
		primaryVersion = versions[0].Name
	}

	// Extract status
	status := "Established"
	if statusObj, ok := item.Object["status"].(map[string]interface{}); ok {
		if conditions, ok := statusObj["conditions"].([]interface{}); ok {
			for _, cond := range conditions {
				condMap, ok := cond.(map[string]interface{})
				if !ok {
					continue
				}
				condType, _ := condMap["type"].(string)
				condStatus, _ := condMap["status"].(string)
				if condType == "Established" {
					if condStatus == "True" {
						status = "Established"
					} else {
						status = "NotEstablished"
					}
				}
				if condType == "Terminating" && condStatus == "True" {
					status = "Terminating"
				}
			}
		}
	}

	// Extract the short name (e.g., "certificates" from "certificates.cert-manager.io")
	shortName := name
	if idx := strings.Index(name, "."); idx > 0 {
		shortName = name[:idx]
	}

	return &CRDSummary{
		Name:     shortName,
		Group:    group,
		Version:  primaryVersion,
		Scope:    scope,
		Status:   status,
		Cluster:  cluster,
		Versions: versions,
	}
}
