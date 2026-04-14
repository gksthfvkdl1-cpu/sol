/** 이 문자열로 시작하는 아이디는 관리자로 인식 (예: gksthfvkdl, gksthfvkdl_dev) */
export const ADMIN_USERNAME_PREFIX = 'gksthfvkdl'

/** 이 이메일로 가입·로그인한 계정도 관리자로 인식 */
export const ADMIN_EMAIL_NAVER = 'gksthfvkdl@naver.com'

/** 회원가입 금지: 관리자 접두사와 동일하게 시작하는 아이디 */
export function isReservedAdminUsername(username: string): boolean {
  const u = username.trim().toLowerCase()
  return u.startsWith(ADMIN_USERNAME_PREFIX)
}
