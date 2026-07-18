import { Link } from 'react-router-dom'

export function LandingPage() {
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.25rem 2rem',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--rc-primary)' }}>RestoCosto</div>
        <Link to="/login" className="rc-btn rc-btn-primary">
          Ingresar
        </Link>
      </header>
      <section
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <h1 style={{ fontSize: '4rem', lineHeight: 1.1, maxWidth: 900, margin: 0 }}>
          Gestión para restaurantes, todo en un mismo lugar
        </h1>
      </section>
    </div>
  )
}
