package claude

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// Service provides Claude AI integration for the dashboard
type Service struct {
	store     store.Store
	k8sClient *k8s.MultiClusterClient
}

// NewService creates a new Claude service
func NewService(s store.Store, k8s *k8s.MultiClusterClient) *Service {
	return &Service{
		store:     s,
		k8sClient: k8s,
	}
}

// SwapSuggestion represents a suggested card swap
type SwapSuggestion struct {
	CardID        uuid.UUID              `json:"card_id"`
	CurrentType   models.CardType        `json:"current_type"`
	SuggestedType models.CardType        `json:"suggested_type"`
	Config        map[string]interface{} `json:"config,omitempty"`
	Reason        string                 `json:"reason"`
	Priority      int                    `json:"priority"` // 1-10, higher is more urgent
}

// AnalyzeAndSuggestSwaps analyzes the current state and suggests card swaps
func (s *Service) AnalyzeAndSuggestSwaps(ctx context.Context, userID uuid.UUID) ([]SwapSuggestion, error) {
	var suggestions []SwapSuggestion

	// Get user's current dashboard and cards
	dashboards, err := s.store.GetUserDashboards(userID)
	if err != nil || len(dashboards) == 0 {
		return suggestions, nil
	}

	// Get the default dashboard
	var dashboard *models.Dashboard
	for i := range dashboards {
		if dashboards[i].IsDefault {
			dashboard = &dashboards[i]
			break
		}
	}
	if dashboard == nil && len(dashboards) > 0 {
		dashboard = &dashboards[0]
	}

	// Get current cards
	cards, err := s.store.GetDashboardCards(dashboard.ID)
	if err != nil {
		return suggestions, err
	}

	// Get cluster state
	clusterState := s.getClusterState(ctx)

	// Analyze and generate suggestions
	suggestions = s.generateSuggestions(cards, clusterState)

	return suggestions, nil
}

// ClusterState holds the current state of clusters for analysis
type ClusterState struct {
	HasPodIssues         bool
	PodIssueCount        int
	HasDeploymentIssues  bool
	DeploymentIssueCount int
	HasSecurityIssues    bool
	SecurityIssueCount   int
	HasGPUNodes          bool
	GPUNodeCount         int
	WarningEventCount    int
}

func (s *Service) getClusterState(ctx context.Context) ClusterState {
	state := ClusterState{}

	if s.k8sClient == nil {
		return state
	}

	clusters, err := s.k8sClient.ListClusters(ctx)
	if err != nil {
		return state
	}

	for _, cluster := range clusters {
		// Check pod issues
		podIssues, err := s.k8sClient.FindPodIssues(ctx, cluster.Name, "")
		if err == nil && len(podIssues) > 0 {
			state.HasPodIssues = true
			state.PodIssueCount += len(podIssues)
		}

		// Check deployment issues
		deployIssues, err := s.k8sClient.FindDeploymentIssues(ctx, cluster.Name, "")
		if err == nil && len(deployIssues) > 0 {
			state.HasDeploymentIssues = true
			state.DeploymentIssueCount += len(deployIssues)
		}

		// TODO: Check security issues once CheckSecurityIssues is available
		// securityIssues, err := s.k8sClient.CheckSecurityIssues(ctx, cluster.Name, "")
		// if err == nil && len(securityIssues) > 0 {
		// 	state.HasSecurityIssues = true
		// 	state.SecurityIssueCount += len(securityIssues)
		// }

		// Check GPU nodes
		gpuNodes, err := s.k8sClient.GetGPUNodes(ctx, cluster.Name)
		if err == nil && len(gpuNodes) > 0 {
			state.HasGPUNodes = true
			state.GPUNodeCount += len(gpuNodes)
		}

		// Check warning events
		events, err := s.k8sClient.GetWarningEvents(ctx, cluster.Name, "", 100)
		if err == nil {
			state.WarningEventCount += len(events)
		}
	}

	return state
}

func (s *Service) generateSuggestions(cards []models.Card, state ClusterState) []SwapSuggestion {
	var suggestions []SwapSuggestion

	// Build a map of current card types
	cardTypes := make(map[models.CardType]bool)
	for _, card := range cards {
		cardTypes[card.CardType] = true
	}

	// Suggest pod_issues if there are pod issues and no pod_issues card
	if state.HasPodIssues && !cardTypes[models.CardTypePodIssues] {
		// Find a less urgent card to replace
		for _, card := range cards {
			if card.CardType == "cluster_metrics" || card.CardType == "resource_usage" {
				suggestions = append(suggestions, SwapSuggestion{
					CardID:        card.ID,
					CurrentType:   card.CardType,
					SuggestedType: models.CardTypePodIssues,
					Reason:        reasonForPodIssues(state.PodIssueCount),
					Priority:      8,
				})
				break
			}
		}
	}

	// Suggest security_issues if there are security issues and no security card
	if state.HasSecurityIssues && !cardTypes[models.CardTypeSecurityIssues] {
		for _, card := range cards {
			if card.CardType == "cluster_metrics" || card.CardType == "resource_usage" || card.CardType == "event_stream" {
				suggestions = append(suggestions, SwapSuggestion{
					CardID:        card.ID,
					CurrentType:   card.CardType,
					SuggestedType: models.CardTypeSecurityIssues,
					Reason:        reasonForSecurityIssues(state.SecurityIssueCount),
					Priority:      9,
				})
				break
			}
		}
	}

	// Suggest deployment_issues if there are deployment issues
	if state.HasDeploymentIssues && !cardTypes[models.CardTypeDeploymentIssues] {
		for _, card := range cards {
			if card.CardType == "cluster_metrics" || card.CardType == "resource_usage" {
				suggestions = append(suggestions, SwapSuggestion{
					CardID:        card.ID,
					CurrentType:   card.CardType,
					SuggestedType: models.CardTypeDeploymentIssues,
					Reason:        reasonForDeploymentIssues(state.DeploymentIssueCount),
					Priority:      7,
				})
				break
			}
		}
	}

	return suggestions
}

func reasonForPodIssues(count int) string {
	if count == 1 {
		return "1 pod has issues that need attention"
	}
	return fmt.Sprintf("%d pods have issues - consider swapping to monitor them", count)
}

func reasonForSecurityIssues(count int) string {
	if count == 1 {
		return "1 security misconfiguration detected"
	}
	return fmt.Sprintf("%d security issues found that need review", count)
}

func reasonForDeploymentIssues(count int) string {
	if count == 1 {
		return "1 deployment is not healthy"
	}
	return fmt.Sprintf("%d deployments have issues", count)
}

// CreatePendingSwap creates a pending swap from a suggestion
func (s *Service) CreatePendingSwap(ctx context.Context, userID uuid.UUID, suggestion SwapSuggestion) (*models.PendingSwap, error) {
	configJSON, _ := json.Marshal(suggestion.Config)

	swap := &models.PendingSwap{
		UserID:        userID,
		CardID:        suggestion.CardID,
		NewCardType:   suggestion.SuggestedType,
		NewCardConfig: configJSON,
		Reason:        suggestion.Reason,
		SwapAt:        time.Now().Add(30 * time.Second), // Default 30 second countdown
		Status:        models.SwapStatusPending,
	}

	if err := s.store.CreatePendingSwap(swap); err != nil {
		return nil, err
	}

	return swap, nil
}
