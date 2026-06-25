# Layout Components

Shared layout components that replace common Tailwind CSS class patterns.

## Components

### HStack

Horizontal stack layout component - replaces `flex items-center gap-X` patterns.

```tsx
import { HStack } from '@/components/ui/HStack'

// Basic usage (default gap-2, items-center)
<HStack>
  <Icon />
  <span>Label</span>
</HStack>

// Custom gap
<HStack gap="3">
  <Icon />
  <span>Label</span>
</HStack>

// With wrap and justify
<HStack wrap justify="between">
  <div>Left</div>
  <div>Right</div>
</HStack>

// Disable vertical centering
<HStack center={false}>
  <div>Not centered</div>
</HStack>
```

**Props:**
- `gap?: '1' | '2' | '3' | '4'` - Gap size (default: '2')
- `center?: boolean` - Center items vertically (default: true)
- `wrap?: boolean` - Enable flex-wrap (default: false)
- `justify?: 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly'` - Justify content
- `className?: string` - Additional classes
- Standard div HTML attributes

### VStack

Vertical stack layout component - replaces `flex flex-col gap-X` patterns.

```tsx
import { VStack } from '@/components/ui/VStack'

// Basic usage (default gap-2)
<VStack>
  <div>Item 1</div>
  <div>Item 2</div>
</VStack>

// With alignment and justify
<VStack align="center" justify="between" gap="4">
  <div>Top</div>
  <div>Bottom</div>
</VStack>
```

**Props:**
- `gap?: '1' | '2' | '3' | '4' | '6' | '8'` - Gap size (default: '2')
- `align?: 'start' | 'end' | 'center' | 'stretch'` - Align items
- `justify?: 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly'` - Justify content
- `className?: string` - Additional classes
- Standard div HTML attributes

### Grid

Grid layout component - replaces `grid grid-cols-X gap-Y` patterns.

```tsx
import { Grid } from '@/components/ui/Grid'

// Basic 2-column grid
<Grid cols="2">
  <div>Item 1</div>
  <div>Item 2</div>
</Grid>

// Custom columns and gap
<Grid cols="3" gap="6">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</Grid>
```

**Props:**
- `cols?: '1' | '2' | '3' | '4' | '6' | '12'` - Number of columns (default: '2')
- `gap?: '1' | '2' | '3' | '4' | '6' | '8'` - Gap size (default: '4')
- `className?: string` - Additional classes
- Standard div HTML attributes

### CardEmptyState

Empty state component for dashboard cards - replaces the common card empty state pattern.

```tsx
import { CardEmptyState } from '@/components/ui/CardEmptyState'
import { AlertTriangle } from 'lucide-react'

<CardEmptyState 
  icon={<AlertTriangle className="w-6 h-6 text-red-400" />}
>
  <p className="text-sm text-red-400">Failed to fetch data</p>
</CardEmptyState>
```

**Props:**
- `icon?: ReactNode` - Icon or visual element
- `children: ReactNode` - Main content
- `className?: string` - Additional classes
- `data-testid?: string` - Test identifier

## Migration Guide

### Before (manual classes):

```tsx
<div className="flex items-center gap-2">
  <Icon />
  <span>Label</span>
</div>
```

### After (HStack):

```tsx
<HStack>
  <Icon />
  <span>Label</span>
</HStack>
```

### Before (card empty state):

```tsx
<div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
  <AlertTriangle className="w-6 h-6 text-red-400" />
  <p className="text-sm text-red-400">Error message</p>
</div>
```

### After (CardEmptyState):

```tsx
<CardEmptyState icon={<AlertTriangle className="w-6 h-6 text-red-400" />}>
  <p className="text-sm text-red-400">Error message</p>
</CardEmptyState>
```

## Benefits

- **Consistency**: Standardizes layout patterns across the codebase
- **Type Safety**: Props are fully typed with TypeScript
- **Maintainability**: Changes to layout patterns can be made in one place
- **Readability**: Component names are more semantic than raw Tailwind classes
- **Testing**: Components can be unit tested independently

## Related Issues

- #19535 - Extract repeated layout patterns
- #19528 - Auto-QA Code Centralization
