interface RecentSearchesListProps {
  isOpen: boolean
  query: string
}

export function RecentSearchesList({ isOpen, query }: RecentSearchesListProps) {
  if (!isOpen || query.trim()) {
    return null
  }

  return null
}
