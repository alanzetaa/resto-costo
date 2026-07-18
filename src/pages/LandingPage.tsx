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
          gap: '1rem',
        }}
      >
        <h1 style={{ fontSize: '2.4rem', maxWidth: 640, margin: 0 }}>
          Costeo de restaurantes de alta gama, todo en un solo lugar
        </h1>
        <p style={{ maxWidth: 560, color: 'var(--rc-text-muted)', fontSize: '1.05rem' }}>
          Productos, Madres, Recetas y Listas de Precio conectados: cambiá un precio y recosteá toda tu carta al instante.
        </p>
        <Link to="/login" className="rc-btn rc-btn-primary" style={{ marginTop: '0.5rem' }}>
          Ingresar a la plataforma
        </Link>
      </section>
    </div>
  )
}
