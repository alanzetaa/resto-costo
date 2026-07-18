import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSuperAdmin, SUPER_ADMIN_EMAIL } from './_supabaseAdmin'

const ASSIGNABLE_ROLES = new Set(['admin'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' })
    return
  }

  try {
    const { admin } = await requireSuperAdmin(req.headers.authorization)

    const { email, role } = req.body ?? {}
    if (typeof email !== 'string' || typeof role !== 'string') {
      res.status(400).json({ error: 'Faltan email o role' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()

    if (normalizedEmail === SUPER_ADMIN_EMAIL) {
      res.status(400).json({ error: 'Ese email ya es Super Admin.' })
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
      res.status(500).json({ error: 'No se pudo guardar el acceso: ' + upsertError.message })
      return
    }

    // Si la persona ya tiene cuenta, propagamos el rol de inmediato (por si el
    // trigger de la base todavía no corrió). Si no existe, no rompe nada.
    await admin.from('profiles').update({ role }).eq('email', normalizedEmail)

    // Invitación por email opcional: si falla (ya invitado, etc.) no bloquea el alta,
    // porque el acceso real lo otorga role_assignments, no el email en sí.
    try {
      await admin.auth.admin.inviteUserByEmail(normalizedEmail)
    } catch {
      // noop: probablemente ya existe el usuario o ya fue invitado antes.
    }

    res.status(200).json({ ok: true })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      res.status(401).json({ error: 'No autenticado.' })
      return
    }
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      res.status(403).json({ error: 'Solo el Super Admin puede otorgar accesos.' })
      return
    }
    res.status(500).json({ error: 'Error interno.' })
  }
}
