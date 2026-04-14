import { getSessionToken, setSessionToken } from './lib/sessionToken.ts'
import { supabase } from './supabase/client.ts'

export type UserSession = {
  userId: string
  username: string
  displayName: string
  isAdmin: boolean
}

export type ProfileRow = {
  id: string
  username: string
  display_name: string
  approved: boolean
  rejected: boolean
  is_admin: boolean
}

export async function loadSessionFromToken(
  token: string | null,
): Promise<UserSession | null> {
  if (!token?.trim()) return null
  const { data, error } = await supabase.rpc('get_session_profile', {
    p_session_token: token,
  })
  if (error || data == null) return null
  const row = data as Record<string, unknown>
  if (row.ok === false) return null
  const userId = String(row.user_id ?? '')
  const username = String(row.username ?? '')
  if (!userId || !username) return null
  return {
    userId,
    username,
    displayName: String(row.display_name ?? username),
    isAdmin: row.is_admin === true,
  }
}

export async function signOutEverywhere(): Promise<void> {
  const t = getSessionToken()
  if (t) {
    await supabase.rpc('app_logout', { p_session_token: t })
  }
  setSessionToken(null)
}

export { getSessionToken, setSessionToken }
