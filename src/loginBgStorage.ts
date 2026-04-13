/** 로그인 화면 배경: 입력 중인 아이디별로 로컬 저장 (다른 아이디는 기본 흰 배경) */
export function loginBgKey(username: string): string {
  return `seven.loginBg.${username.trim()}`
}

export function readLoginBgForUser(username: string): string | null {
  const u = username.trim()
  if (!u) return null
  try {
    return localStorage.getItem(loginBgKey(u))
  } catch {
    return null
  }
}

export function writeLoginBgForUser(username: string, dataUrl: string): void {
  const u = username.trim()
  if (!u) return
  try {
    localStorage.setItem(loginBgKey(u), dataUrl)
  } catch {
    /* quota */
  }
}

export function clearLoginBgForUser(username: string): void {
  const u = username.trim()
  if (!u) return
  try {
    localStorage.removeItem(loginBgKey(u))
  } catch {
    /* ignore */
  }
}
