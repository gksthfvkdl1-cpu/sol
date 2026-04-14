/** 회원가입 입력 → DB에 저장할 소문자 아이디 (이메일 미사용) */
export function loginInputToUsername(input: string): string {
  const t = input.trim()
  if (!t) return ''
  if (t.includes('@')) {
    return t.split('@')[0].trim().toLowerCase() || 'user'
  }
  return t.toLowerCase()
}
