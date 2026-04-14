/** 로그인 ID ↔ Supabase Auth 이메일 (동일 규칙으로 가입·로그인해야 함) */
export function toAuthEmail(username: string): string {
  const safe =
    username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '_')
      .slice(0, 48) || 'user'
  const domain =
    import.meta.env.VITE_AUTH_EMAIL_DOMAIN?.trim() || 'example.com'
  return `${safe}@${domain}`
}
