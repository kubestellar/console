# KubeStellar Console - Work Items

## In Progress

(Available for pickup)

## Pending Tasks

### UI/UX Improvements
- [ ] **#5** Add drag handles to sidebar menu items - Re-arrange without opening customize panel
- [ ] **#11** Add icons to card title prop - Improve card visual identification
- [ ] **#12** Color consistency throughout status and severity based - Standardize colors
- [ ] **#13** Cluster dashboard info cards - Support list view, half-height, half-width arrangements

### New Features
- [ ] **#2** Add Reward system feature - Coins for bug (300) and feature (100) reports, contributor ladder
- [ ] **#3** Add feature to invite GitHub ID for +500 coins
- [ ] **#4** Add LinkedIn share suggestion feature - Encourage users to share the console
- [ ] **#6** Feedback - Ask for suggestions on improvements

### Dashboards
- [ ] **#7** Add Arcade dashboard with default stats and cards
- [ ] **#8** Add KubeStellar Deploy dashboard with default stats and cards

### Card Fixes
- [ ] **#9** Ping card - Add adjustable ping rate so users can slow it down
- [ ] **#10** Fix StockMarketTicker CORS error - Yahoo Finance API blocked by CORS

## Completed

- [x] **#1** Implement dashboard persistence (last route + scroll) - 2026-01-25
  - Created `useLastRoute.ts` hook to save/restore last route and scroll position
  - Integrated into Layout.tsx

---

## Notes for Claude Instances

- When picking up a task, update its status in this file
- Move task to "In Progress" section and add your session marker
- When done, move to "Completed" section with date
- Coordinate on complex tasks that may conflict

## Task Details Reference

| ID | Task | Priority | Complexity |
|----|------|----------|------------|
| 1 | Dashboard persistence | High | Medium |
| 2 | Reward system | Medium | High |
| 3 | Invite GitHub ID | Medium | Medium |
| 4 | LinkedIn share | Low | Low |
| 5 | Sidebar drag handles | Medium | Medium |
| 6 | Feedback suggestions | Medium | Low |
| 7 | Arcade dashboard | Low | Medium |
| 8 | KubeStellar Deploy dashboard | Low | Medium |
| 9 | Ping card rate | Low | Low |
| 10 | StockMarketTicker CORS | High | Medium |
| 11 | Card title icons | Low | Low |
| 12 | Color consistency | Medium | Medium |
| 13 | Cluster card arrangements | Medium | Medium |
