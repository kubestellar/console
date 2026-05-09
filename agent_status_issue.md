Title: Navbar agent status indicator replaced by dashboard health metrics

Issue Description: 
Commit 7c46ad23c modified the AgentStatusIndicator component to prioritize the dashboardHealth status over the agent connection status. This hijacked the pill label to display aggregated cluster alerts instead of the local agent connectivity state.

Actual Behaviour: 
The top-bar agent status pill displays system health counts like "7 critical issues" or warning messages when cluster issues exist, completely hiding whether the local agent is connected, disconnected, or degraded.

Expected Behaviour: 
The pill should exclusively display the agent's connection status (Connected, Degraded, Live, Offline). Dashboard health metrics should remain confined to the pill's hover tooltip.

Acceptance Criteria:
* AgentStatusIndicator pill style evaluation prioritizes agent connection states.
* Dashboard health warning or critical status does not override the pill label.
* System health information is accessible via the hover tooltip.
