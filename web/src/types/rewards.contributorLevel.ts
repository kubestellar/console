/**
 * `ContributorLevel` lives in its own module so that the hand-written
 * `rewards.ts` and the generated `rewards.generated.ts` can both depend on
 * it without depending on each other. Previously `rewards.generated.ts`
 * imported the type from `rewards.ts` while `rewards.ts` imported values
 * from `rewards.generated.ts`, forming a circular dependency between a
 * generated file and its hand-written counterpart.
 */
export interface ContributorLevel {
  rank: number
  name: string
  icon: string         // Lucide icon name
  iconPath: string     // raw Lucide path data for badges
  minCoins: number
  color: string        // Tailwind color prefix (e.g., 'gray', 'blue')
  bgClass: string      // Background classes for the badge
  textClass: string    // Text color class
  borderClass: string  // Border color class
}
