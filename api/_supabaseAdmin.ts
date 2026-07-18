import { createClient } from '@supabase/supabase-js'

const SUPER_ADMIN_EMAIL = 'alanzeta@gmail.com'

function getAdminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_SECRET_KEY en las variables de entorno del servidor.')
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * Valida el JWT recibido en el header Authorization y confirma que el caller
 * tiene rol super_admin en la tabla profiles. Usa la Secret key porque el
 * caller todavía no tiene por qué tener permisos de lectura sobre profiles ajenos.
 */
export async function requireSuperAdmin(authHeader: string | undefined) {
  const admin = getAdminClient()
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) {
    throw new Error('UNAUTHORIZED')
  }

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(token)

  if (userError || !user) {
    throw new Error('UNAUTHORIZED')
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || profile?.role !== 'super_admin') {
    throw new Error('FORBIDDEN')
  }

  return { admin, callerId: user.id }
}

export { SUPER_ADMIN_EMAIL }
