export interface UsuarioBasico {
  nombre: string | null
  apellido: string | null
  email: string
}

export function nombreUsuario(u: UsuarioBasico | null | undefined): string {
  if (!u) return '—'
  const nombre = [u.nombre, u.apellido].filter(Boolean).join(' ').trim()
  return nombre || u.email
}
