/**
 * 아이디만 입력: 내부에서 Supabase Auth용 이메일 형식으로 조합 (사용자에게 @ 표시 없음)
 * @ 포함 입력: 이미 이메일로 가입한 계정 호환용으로 그대로 사용
 */
export function toAuthEmail(username: string): string {
  const safe =
    username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '_')
      .slice(0, 48) || 'user'
  const domain =
    import.meta.env.VITE_AUTH_EMAIL_DOMAIN?.trim() || 'gmail.com'
  return `${safe}@${domain}`
}

/** 로그인/가입 입력 → Supabase `signIn` / `signUp` 의 email 인자 */
export function loginInputToAuthEmail(input: string): string {
  const t = input.trim()
  if (!t) return ''
  if (t.includes('@')) {
    return t.toLowerCase().replace(/\s/g, '')
  }
  return toAuthEmail(t)
}

/** profiles / UI용 사용자명 (가입 시 user_metadata) */
export function loginInputToUsername(input: string): string {
  const t = input.trim()
  if (!t) return ''
  if (t.includes('@')) {
    return t.split('@')[0].trim().toLowerCase() || 'user'
  }
  return t
}

/** Supabase 영문 에러 → 한국어 (이메일 단어 노출 최소화) */
export function friendlyAuthError(message: string): string {
  const m = message.trim()
  if (/invalid login credentials/i.test(m)) {
    return '아이디 또는 비밀번호가 올바르지 않습니다.'
  }
  if (/invalid email/i.test(m) || /unable to validate email/i.test(m)) {
    return '아이디 형식이 올바르지 않습니다.'
  }
  if (/email not confirmed|email address not confirmed/i.test(m)) {
    return '이메일 인증이 완료되지 않아 로그인할 수 없습니다. Supabase 대시보드 → Authentication → Providers → Email에서 Confirm email(이메일 확인)을 끄거나, Authentication → Users에서 해당 사용자를 열어 이메일 확인을 완료한 뒤 다시 시도하세요.'
  }
  if (/user (?:is )?not found|no user found/i.test(m)) {
    return '등록되지 않은 아이디입니다.'
  }
  if (/password/i.test(m) && /short|least|weak/i.test(m)) {
    return '비밀번호 조건을 확인하세요.'
  }
  return m
}
