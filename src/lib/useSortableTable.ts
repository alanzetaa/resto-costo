import { useMemo, useState } from 'react'

export type SortDirection = 'asc' | 'desc'

export function useSortableTable<T extends object>(items: T[], initialKey?: keyof T) {
  const [sortKey, setSortKey] = useState<keyof T | null>(initialKey ?? null)
  const [direction, setDirection] = useState<SortDirection>('asc')

  function toggleSort(key: keyof T) {
    if (sortKey === key) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setDirection('asc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return items
    const copy = [...items]
    copy.sort((a, b) => {
      const av = a[sortKey] as unknown
      const bv = b[sortKey] as unknown
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv
      } else {
        cmp = String(av).localeCompare(String(bv), 'es', { sensitivity: 'base' })
      }
      return direction === 'asc' ? cmp : -cmp
    })
    return copy
  }, [items, sortKey, direction])

  return { sorted, sortKey, direction, toggleSort }
}
