import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { AuthPublicConfig } from './lib/authPublicConfig.ts'
import {
  clearPublicAuthConfigCache,
  loadPublicAuthConfig,
} from './lib/authPublicConfig.ts'
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

/**
 * 관리자 UI·RLS `is_admin()` 과 동일한 규칙.
 * 비밀번호 검증은 Supabase Auth(auth.users)가 담당하고, 권한 문자열은 DB `auth_public_config`에서 읽음.
 */
export function isPrivilegedAccount(
  profile: ProfileRow,
  email: string | undefined | null,
  cfg: AuthPublicConfig,
): boolean {
  if (profile.is_admin === true) return true
  const needle = cfg.admin_username_contains.trim().toLowerCase()
  if (needle && profile.username.toLowerCase().includes(needle)) return true
  const e = email?.toLowerCase().trim()
  const adminEmail = cfg.admin_email_exact.trim().toLowerCase()
  if (e && adminEmail && e === adminEmail) return true
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
  const cfg = await loadPublicAuthConfig()
  return {
    userId: user.id,
    username: profile.username,
    displayName: profile.display_name || profile.username,
    isAdmin: isPrivilegedAccount(profile, user.email, cfg),
  }
}

export async function signOutEverywhere(): Promise<void> {
  clearPublicAuthConfigCache()
  await supabase.auth.signOut()
}
