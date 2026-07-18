import { Link } from 'react-router-dom'

const FEATURES = [
  {
    icon: '🧮',
    title: 'Costeo automático',
    text: 'Cambiá el precio de un insumo y recosteá toda tu carta al instante, sin planillas.',
  },
  {
    icon: '📊',
    title: 'Precio sugerido',
    text: 'Food cost objetivo por rubro, calculado en segundos según tus propias listas.',
  },
  {
    icon: '🔐',
    title: 'Accesos por rol',
    text: 'Vos decidís quién entra a la plataforma y qué puede modificar.',
  },
  {
    icon: '📜',
    title: 'Historial completo',
    text: 'Cada cambio de precio y de acceso queda registrado, con fecha y responsable.',
  },
]

export function LandingPage() {
  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #E5EEFC 0%, var(--rc-bg) 42%)',
      }}
    >
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
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '3rem 2rem 2rem',
        }}
      >
        <h1
          style={{
            fontSize: '4rem',
            lineHeight: 1.1,
            maxWidth: 900,
            margin: 0,
            color: 'var(--rc-primary)',
            fontWeight: 800,
          }}
        >
          Gestión para restaurantes, todo en un mismo lugar
        </h1>
        <p style={{ maxWidth: 620, marginTop: '1.25rem', color: 'var(--rc-text-muted)', fontSize: '1.15rem' }}>
          Costeá tus recetas al instante, controlá el precio de cada insumo y tomá decisiones con datos reales —
          pensado para restaurantes de alta gama.
        </p>
      </section>

      <section
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          padding: '1rem 2rem 3rem',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.25rem',
            maxWidth: 1000,
            width: '100%',
          }}
        >
          {FEATURES.map((f) => (
            <div key={f.title} className="rc-card" style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{f.icon}</div>
              <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>{f.title}</h3>
              <p style={{ margin: 0, color: 'var(--rc-text-muted)', fontSize: '0.9rem' }}>{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
