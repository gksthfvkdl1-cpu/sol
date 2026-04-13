const STORAGE_KEY = 'seven-guide-auth'

export type AuthPayload = {
  userId: string
  loggedInAt: string
}

export function readAuth(): AuthPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<AuthPayload>
    if (typeof data.userId !== 'string' || !data.userId) return null
    return {
      userId: data.userId,
      loggedInAt:
        typeof data.loggedInAt === 'string' ? data.loggedInAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function saveAuth(userId: string): void {
  try {
    const payload: AuthPayload = {
      userId,
      loggedInAt: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* 저장 불가(비공개 모드 등) 시 무시 — 로그인은 진행 */
  }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
