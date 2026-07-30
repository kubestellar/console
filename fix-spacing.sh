#!/bin/bash
# Fix non-standard spacing values
find web/src -name "*.tsx" -o -name "*.ts" | while read file; do
  # Replace text-[11px] with text-xs (12px is closest standard, but 11px should map to text-xs which is effectively the same)
  sed -i 's/text-\[11px\]/text-xs/g' "$file"
  
  # Replace text-[10px] with text-xs
  sed -i 's/text-\[10px\]/text-xs/g' "$file"
  
  # Replace text-[9px] with text-xs
  sed -i 's/text-\[9px\]/text-xs/g' "$file"
  
  # Replace text-[6px] - no standard Tailwind equivalent, keep as is or use text-[0.375rem]
  # Replace text-[4px] - no standard Tailwind equivalent, keep as is
  # Replace text-[3px] - no standard Tailwind equivalent, keep as is
done
