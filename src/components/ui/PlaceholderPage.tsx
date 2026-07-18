interface PlaceholderPageProps {
  title: string
  description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div>
      <div className="rc-page-header">
        <h1>{title}</h1>
      </div>
      <div className="rc-card">
        <p style={{ margin: 0, color: 'var(--rc-text-muted)' }}>{description}</p>
      </div>
    </div>
  )
}
