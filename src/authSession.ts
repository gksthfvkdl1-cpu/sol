import type { User as SupabaseUser } from '@supabase/supabase-js'
import {
  ADMIN_EMAIL_NAVER,
  ADMIN_USERNAME_PREFIX,
} from './auth/constants.ts'
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

/** 관리자 UI·RLS와 동일: is_admin 컬럼, 아이디 접두사, 또는 gksthfvkdl@naver.com */
export function isPrivilegedAccount(
  profile: ProfileRow,
  email: string | undefined | null,
): boolean {
  if (profile.is_admin === true) return true
  const lu = profile.username.toLowerCase()
  if (lu.startsWith(ADMIN_USERNAME_PREFIX)) return true
  const e = email?.toLowerCase().trim()
  if (e === ADMIN_EMAIL_NAVER) return true
  return false
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
    isAdmin: isPrivilegedAccount(profile, user.email),
  }
}

export async function signOutEverywhere(): Promise<void> {
  await supabase.auth.signOut()
}
