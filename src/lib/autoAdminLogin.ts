import { setSessionToken } from './sessionToken.ts'
import { supabase } from '../supabase/client.ts'

export function isAutoAdminConfigured(): boolean {
  const id = import.meta.env.VITE_AUTO_ADMIN_ID?.trim()
  const pw = import.meta.env.VITE_AUTO_ADMIN_PASSWORD
  return Boolean(id && pw && String(pw).length > 0)
}

export async function tryAutoAdminSignIn(): Promise<boolean> {
  if (!isAutoAdminConfigured()) return false
  const id = import.meta.env.VITE_AUTO_ADMIN_ID!.trim()
  const password = String(import.meta.env.VITE_AUTO_ADMIN_PASSWORD ?? '')
  if (!id || !password) return false
  const { data, error } = await supabase.rpc('app_login', {
    p_username: id,
    p_password: password,
  })
  if (error || !data || typeof data !== 'object') return false
  const row = data as { ok?: boolean; token?: string }
  if (!row.ok || !row.token) return false
  setSessionToken(row.token)
  return true
}
