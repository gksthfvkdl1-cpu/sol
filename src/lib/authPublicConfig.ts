import { supabase } from '../supabase/client.ts'

/** `auth_public_config` + RPC `get_public_auth_config` 와 동일 (DB 없을 때 폴백) */
export type AuthPublicConfig = {
  admin_username_contains: string
  admin_email_exact: string
  signup_forbid_username_contains: string
}

const FALLBACK: AuthPublicConfig = {
  admin_username_contains: 'gksthfvkdl',
  admin_email_exact: 'gksthfvkdl@naver.com',
  signup_forbid_username_contains: 'gksthfvkdl',
}

let cached: AuthPublicConfig | null = null

export function clearPublicAuthConfigCache(): void {
  cached = null
}

export async function loadPublicAuthConfig(): Promise<AuthPublicConfig> {
  if (cached) return cached
  const { data, error } = await supabase.rpc('get_public_auth_config')
  if (error || !data || !Array.isArray(data) || data.length === 0) {
    cached = FALLBACK
    return FALLBACK
  }
  const row = data[0] as Record<string, unknown>
  cached = {
    admin_username_contains: String(
      row.admin_username_contains ?? FALLBACK.admin_username_contains,
    ),
    admin_email_exact: String(
      row.admin_email_exact ?? FALLBACK.admin_email_exact,
    ),
    signup_forbid_username_contains: String(
      row.signup_forbid_username_contains ??
        FALLBACK.signup_forbid_username_contains,
    ),
  }
  return cached
}

/** 회원가입 차단: 아이디에 설정 문자열이 포함되면 사용 불가 */
export function isSignupUsernameBlocked(
  username: string,
  cfg: AuthPublicConfig,
): boolean {
  const needle = cfg.signup_forbid_username_contains.trim().toLowerCase()
  if (!needle) return false
  return username.toLowerCase().includes(needle)
}
