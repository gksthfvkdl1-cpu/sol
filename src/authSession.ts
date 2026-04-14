import type { User as SupabaseUser } from '@supabase/supabase-js'
import { ADMIN_USERNAME } from './auth/constants.ts'
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

export async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, username, display_name, approved, rejected, is_admin',
    )
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data as ProfileRow
}

export async function buildSession(
  user: SupabaseUser,
): Promise<UserSession | null> {
  const profile = await loadProfile(user.id)
  if (!profile) return null
  return {
    userId: user.id,
    username: profile.username,
    displayName: profile.display_name || profile.username,
    isAdmin:
      profile.is_admin === true ||
      profile.username.toLowerCase() === ADMIN_USERNAME,
  }
}

export async function signOutEverywhere(): Promise<void> {
  await supabase.auth.signOut()
}
