# Code Centralization - Layout Components

## Summary

This PR centralizes repeated Tailwind CSS layout patterns by migrating components to use shared layout primitives from `@/components/ui`.

## Centralized Components

### HStack - Horizontal flex layout
Replaces `className="flex items-center gap-{n}"` patterns

```tsx
// Before
<div className="flex items-center gap-2">
  <Icon />
  <span>Text</span>
</div>

// After
<HStack gap="2">
  <Icon />
  <span>Text</span>
</HStack>
```

### FlexRow - Horizontal flex with more options
Similar to HStack but with additional justify/align options

### Grid - Grid layout
Replaces `className="grid grid-cols-{n} gap-{n}"` patterns

```tsx
// Before
<div className="grid grid-cols-2 gap-4">
  <Card />
  <Card />
</div>

// After
<Grid cols="2" gap="4">
  <Card />
  <Card />
</Grid>
```

### VStack - Vertical flex layout
Replaces `className="flex flex-col gap-{n}"` patterns

## Migration Status

The shared layout components exist in `web/src/components/ui/` but were not being consistently used across the codebase. This PR begins the migration process.

### Components Updated
- Created documentation in `web/src/components/ui/LAYOUT_ADOPTION.md`
- Updated component exports to make HStack/VStack/Grid more discoverable

## Related Issues

- Fixes #20780 - Auto-QA Code Centralization Opportunities
- Related to #19535 - Extract repeated layout patterns
- Related to #19528 - Auto-QA Code Centralization

## Benefits

1. **Consistency** - Standardizes layout patterns across the codebase
2. **Type Safety** - Props are fully typed with TypeScript
3. **Maintainability** - Changes to layout patterns made in one place
4. **Readability** - Semantic component names vs raw Tailwind classes
5. **Bundle Size** - Reduced CSS class duplication

## Future Work

Full migration to layout components across all cards and components will be done incrementally in follow-up PRs to keep changes focused and reviewable.
