# Bugfix Requirements Document

## Introduction

The Stellar AI assistant sidebar exists architecturally but is non-functional due to broken wiring between components. The console receives cluster events, pod states, deployment changes, and alerts, but this data stream is not properly connected to Stellar's processing pipeline. This bugfix addresses five critical wiring issues that prevent Stellar from intercepting, processing, and surfacing cluster data to users.

**Impact:** Users cannot receive AI-narrated event cards, SSE notifications don't reach the frontend, the observer doesn't use real cluster data, and the catch-up summary remains empty. The system appears functional but delivers no value.

**Scope:** This is a wiring problem, not an architecture problem. All components exist and are correctly implemented—they simply aren't connected to each other.

## Bug Analysis

### Current Behavior (Defect)

#### 1.1 Event Pipeline Disconnection
1.1 WHEN a pod crashes in a connected cluster THEN the console receives the event but it is NOT piped to Stellar's `ProcessEvent` function and NO card appears in the Stellar Events tab

1.2 WHEN cluster events arrive at the console's event handler THEN they are processed by the console but NOT forwarded to Stellar's event processing pipeline

#### 1.2 Provider Not Unified
1.3 WHEN a user selects GPT-4o in the navbar AI provider dropdown THEN Stellar chat and event narration continue using Stellar's separate provider registry instead of the navbar-selected provider

1.4 WHEN the console's navbar provider changes THEN Stellar components do not receive or use the updated provider selection

#### 1.3 SSE Stream Not Delivering
1.5 WHEN a notification is written to the database by the watcher or observer THEN the notification does NOT reliably appear in the frontend Events panel within 10 seconds

1.6 WHEN the SSE stream handler polls for new notifications THEN the frontend SSE handler does not correctly update the events panel state

#### 1.4 Observer Not Using Real Data
1.7 WHEN the observer polls on its 60-second timer THEN it does NOT use the console's existing cluster client and does NOT log real cluster counts (pod counts, deployment counts, node counts)

1.8 WHEN the observer tick executes THEN server logs do NOT show real cluster data every 60 seconds

#### 1.5 Catch-up Summary Empty
1.9 WHEN a user closes the browser for 20 minutes and returns THEN the "While you were away" banner appears but contains NO AI-generated paragraph describing what happened

1.10 WHEN the catch-up LLM call executes THEN the broadcaster wiring may be broken preventing the summary from reaching the frontend

### Expected Behavior (Correct)

#### 2.1 Event Pipeline Connected
2.1 WHEN a pod crashes in a connected cluster THEN the event SHALL be piped to Stellar's event processing pipeline and a card SHALL appear in the Stellar Events tab within 10 seconds with AI-narrated description

2.2 WHEN cluster events arrive at the console's event handler THEN they SHALL be forwarded to Stellar's `ProcessEvent` function for AI processing and notification creation

#### 2.2 Provider Unified
2.3 WHEN a user selects GPT-4o in the navbar AI provider dropdown THEN Stellar chat and event narration SHALL use GPT-4o (the same provider selected in the navbar)

2.4 WHEN the console's navbar provider changes THEN Stellar components SHALL receive and use the updated provider selection immediately

#### 2.3 SSE Stream Delivering
2.5 WHEN a notification is written to the database by the watcher or observer THEN the notification SHALL appear in the frontend Events panel within 10 seconds without requiring a page refresh

2.6 WHEN the SSE stream handler polls for new notifications THEN the frontend SSE handler SHALL correctly update the events panel state with new notifications

#### 2.4 Observer Using Real Data
2.7 WHEN the observer polls on its 60-second timer THEN it SHALL use the console's existing cluster client and SHALL log real cluster counts (pod counts, deployment counts, node counts)

2.8 WHEN the observer tick executes THEN server logs SHALL show real cluster data every 60 seconds including cluster names and resource counts

#### 2.5 Catch-up Summary Populated
2.9 WHEN a user closes the browser for 20 minutes and returns THEN the "While you were away" banner SHALL contain an AI-generated paragraph describing what happened during the absence

2.10 WHEN the catch-up LLM call executes THEN the broadcaster SHALL be properly wired to deliver the summary to the frontend via SSE

### Unchanged Behavior (Regression Prevention)

#### 3.1 Existing Stellar Features
3.1 WHEN a user interacts with Stellar chat THEN the chat functionality SHALL CONTINUE TO work as it does currently

3.2 WHEN the watcher polls clusters for events THEN it SHALL CONTINUE TO create notifications in the database as it does currently

3.3 WHEN the observer runs its observation logic THEN it SHALL CONTINUE TO execute the LLM reasoning and decision-making as it does currently

3.4 WHEN the scheduler fires the daily digest THEN it SHALL CONTINUE TO create memory entries as it does currently

#### 3.2 Console Core Features
3.5 WHEN cluster events are processed by the console THEN the console's existing event handling (timeline, alerts, dashboard updates) SHALL CONTINUE TO function unchanged

3.6 WHEN the navbar AI provider is selected THEN the console's existing AI features (chat, card narration) SHALL CONTINUE TO use the selected provider

3.7 WHEN the k8s client is used by other console components THEN it SHALL CONTINUE TO provide cluster data without interference from Stellar

#### 3.3 Database and Storage
3.8 WHEN notifications are created in the database THEN the database schema and storage operations SHALL CONTINUE TO work unchanged

3.9 WHEN SSE connections are established THEN the existing SSE infrastructure SHALL CONTINUE TO handle other event types (kubeconfig changes, action updates) correctly

3.10 WHEN audit entries are created THEN the audit logging SHALL CONTINUE TO function unchanged
