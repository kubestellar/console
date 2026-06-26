# ActiveAlerts

## Purpose  
The `ActiveAlerts` component provides a summarized view of currently firing or acknowledged alerts across the Kubernetes fleet. It gives operators immediate visibility into ongoing critical and warning-level events, offering quick actions to drill down into specifics, trigger AI diagnoses, or launch guided missions to resolve the issues.

## Data Sources  
- Hooks used: `useAlerts` (fetches active/acknowledged alerts & stats), `useGlobalFilters` (severity and custom text filters), `useMissions` (mission tracking), `useDrillDownActions` (navigation), `useCardData` (search, sort, pagination wrapper), `useCardLoadingState`, and `useDemoMode`.
- Backend APIs or streams: Data provided dynamically through `useAlerts`, which abstracts the underlying REST/SSE feeds.
- Data provider: Backend / Local Agent / Demo mode (handled seamlessly via `useDemoMode`).

## Props / Configuration  
| Prop | Type | Default | Description |
|---|---|---|---|
| (None) | N/A | N/A | This component is self-contained and retrieves all required state via context and custom hooks. |

## UI States  
- **Loading:** Handled globally by broadcasting status using the `useCardLoadingState` hook to the parent `CardWrapper`.
- **Empty:** Renders a "No Active Alerts / All systems operational" empty state with a green checkmark when zero alerts match the active filters.
- **Error:** Handled at a higher level by `DynamicCardErrorBoundary` or graceful degradation within the hooks.

## Logic & Patterns  
- **Filtering / sorting / pagination:** 
  - Combines active and optionally acknowledged alerts based on a local toggle.
  - Pre-filters combined data utilizing global states (`selectedSeverities` and `customFilter` text).
  - Relies on the standard `useCardData` robust hook for local pagination, cluster filtering, and sorting by `severity` or `time`.
- **Data transformation or aggregation:** 
  - Maps individual alert `AlertSeverity` to global `SeverityLevel` strings to match the top-bar filter context.
  - Extracts totals to power the top `AlertStatsRow` component (showing critical, warning, and acknowledged summary counts).
- **Special logic:** 
  - Allows triggering `runAIDiagnosis(alertId)` to initiate local agent troubleshooting.
  - Connects to the Mission sidebar via `setActiveMission(mission.id)`.
  - Pushes context cleanly via `drillToAlert()` when a specific alert list item is clicked.

## Notes (Optional)  
- **Edge cases:** The filtering logic assumes `AlertSeverity` matches limited types. If a new severity level is introduced on the backend, the `mapAlertSeverityToGlobal` switch statement must be updated to avoid defaulting to `info`.
