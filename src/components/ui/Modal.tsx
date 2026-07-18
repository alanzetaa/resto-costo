import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '5vh 1rem',
        zIndex: 100,
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        className="rc-card"
        style={{ width: '100%', maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ border: 'none', background: 'transparent', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--rc-text-muted)' }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
