import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSuperAdmin, SUPER_ADMIN_EMAIL } from './_supabaseAdmin'

const ASSIGNABLE_ROLES = new Set(['admin', 'pending'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' })
    return
  }

  try {
    const { admin, callerId } = await requireSuperAdmin(req.headers.authorization)

    const { email, role } = req.body ?? {}
    if (typeof email !== 'string' || typeof role !== 'string') {
      res.status(400).json({ error: 'Faltan email o role' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()

    if (normalizedEmail === SUPER_ADMIN_EMAIL) {
      res.status(400).json({ error: 'No se puede modificar el rol del Super Admin.' })
      return
    }
    if (!ASSIGNABLE_ROLES.has(role)) {
      res.status(400).json({ error: 'Rol inválido.' })
      return
    }

    const { error: upsertError } = await admin
      .from('role_assignments')
      .upsert({ email: normalizedEmail, role }, { onConflict: 'email' })

    if (upsertError) {
      res.status(500).json({ error: 'No se pudo actualizar el acceso: ' + upsertError.message })
      return
    }

    await admin.from('profiles').update({ role }).eq('email', normalizedEmail)

    await admin.from('audit_log').insert({
      actor_id: callerId,
      action: 'update_role',
      entity_type: 'role_assignments',
      new_value: { email: normalizedEmail, role },
    })

    res.status(200).json({ ok: true })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      res.status(401).json({ error: 'No autenticado.' })
      return
    }
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      res.status(403).json({ error: 'Solo el Super Admin puede modificar accesos.' })
      return
    }
    res.status(500).json({ error: 'Error interno.' })
  }
}
