import type { CSSProperties } from 'react'

interface SortableThProps {
  label: string
  active: boolean
  direction: 'asc' | 'desc'
  onClick: () => void
  style?: CSSProperties
}

export function SortableTh({ label, active, direction, onClick, style }: SortableThProps) {
  return (
    <th onClick={onClick} className="rc-th-sortable" style={style}>
      {label}
      <span style={{ display: 'inline-block', width: '0.9em', color: active ? 'var(--rc-primary)' : 'var(--rc-border)' }}>
        {active ? (direction === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  )
}
