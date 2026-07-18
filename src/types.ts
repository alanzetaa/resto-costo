export type Role = 'super_admin' | 'admin' | 'pending' | (string & {})

export interface Profile {
  id: string
  email: string
  role: Role
  created_at: string
}
