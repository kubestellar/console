# Code Centralization Guide

This document provides patterns for using centralized utilities instead of repeating common code patterns.

## Layout Utilities

Use shared layout constants instead of repeating Tailwind class combinations.

### Before
```tsx
<div className="flex items-center gap-2">
  <Icon />
  <span>Label</span>
</div>

<div className="flex flex-col min-h-card content-loaded gap-4">
  <Content />
</div>
```

### After
```tsx
import { FLEX_CENTER_GAP_2, FLEX_COL_MIN_H_CARD_CONTENT_LOADED_GAP_4 } from '@/lib/layouts'

<div className={FLEX_CENTER_GAP_2}>
  <Icon />
  <span>Label</span>
</div>

<div className={FLEX_COL_MIN_H_CARD_CONTENT_LOADED_GAP_4}>
  <Content />
</div>
```

### Available Layout Constants

**Flex row with centered items:**
- `FLEX_CENTER_GAP_0` through `FLEX_CENTER_GAP_8` (0, 1, 2, 3, 4, 6, 8)

**Flex row with start-aligned items:**
- `FLEX_START_GAP_2`, `FLEX_START_GAP_3`, `FLEX_START_GAP_4`

**Flex row with center justify:**
- `FLEX_CENTER_JUSTIFY_GAP_1`, `FLEX_CENTER_JUSTIFY_GAP_2`

**Flex row with wrap:**
- `FLEX_WRAP_CENTER_BETWEEN_GAP_2`, `FLEX_WRAP_CENTER_GAP_2`

**Flex column:**
- `FLEX_COL`, `FLEX_COL_GAP_2`, `FLEX_COL_GAP_4`
- `FLEX_COL_CENTER_JUSTIFY_MIN_H_CARD_GAP_2` (for card empty states)
- `FLEX_COL_MIN_H_CARD_CONTENT_LOADED_GAP_4` (for card content)

**Grid layouts:**
- `GRID_COLS_1` through `GRID_COLS_4`, `GRID_COLS_12`
- `GRID_COLS_1_LG_3`, `GRID_COLS_1_MD_2_LG_3`, `GRID_COLS_1_MD_2` (responsive)

### When to Use Constants vs Inline Classes

Use constants for:
- Repeated patterns (appears 5+ times in codebase)
- Standard card layouts
- Common flex/grid configurations

Use inline classes for:
- One-off layouts
- Component-specific spacing
- Layouts that need dynamic values

---

## Modal State Management

Use `useModalState` hook instead of raw `useState(false)` for modal/dialog/overlay state.

### Before
```tsx
const [isOpen, setIsOpen] = useState(false)

<Button onClick={() => setIsOpen(true)}>Open</Button>
<Modal isOpen={isOpen} onClose={() => setIsOpen(false)} />
```

### After
```tsx
import { useModalState } from '@/lib/modals'

const { isOpen, open, close } = useModalState()

<Button onClick={open}>Open</Button>
<Modal isOpen={isOpen} onClose={close} />
```

### useModalState API

```typescript
const { isOpen, open, close, toggle, setIsOpen } = useModalState(initialOpen = false)
```

- `isOpen: boolean` - Current state
- `open: () => void` - Open the modal
- `close: () => void` - Close the modal
- `toggle: () => void` - Toggle the modal
- `setIsOpen: (boolean) => void` - Direct state setter (use sparingly)

### Import Paths

```tsx
// From hooks
import { useModal } from '@/hooks/useModal'

// From lib (recommended)
import { useModalState } from '@/lib/modals'
import { useModalState } from '@/lib'
```

Both `useModal` and `useModalState` are the same hook. `useModal` is a compatibility wrapper.

---

## Benefits

1. **Bundle Size**: Repeated class strings are deduplicated by the bundler
2. **Consistency**: Same visual pattern uses same code
3. **Maintainability**: Change layout spacing in one place
4. **Readability**: `FLEX_CENTER_GAP_2` is clearer than `"flex items-center gap-2"`
5. **Type Safety**: Constants are autocompleted and typo-proof

---

## Migration Strategy

Migrate incrementally:
1. Start with files you're already editing
2. Use layout constants for new components
3. Update modal state as you encounter `useState(false)` patterns
4. No need to refactor working code unless you're already touching it

---

## Related Files

- `web/src/lib/layouts.ts` - Layout utility constants
- `web/src/lib/modals/useModalNavigation.ts` - Modal state hook implementation
- `web/src/hooks/useModal.ts` - Compatibility wrapper for useModalState
