const STORAGE_KEY = 'seven-session'

export type UserSession = {
  token: string
  username: string
  displayName: string
}

function jwtExp(token: string): number | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = JSON.parse(
      atob(part.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number }
    return typeof json.exp === 'number' ? json.exp : null
  } catch {
    return null
  }
}

export function readSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<UserSession>
    if (typeof s.token !== 'string' || !s.token || typeof s.username !== 'string') {
      return null
    }
    const exp = jwtExp(s.token)
    if (exp != null && Date.now() / 1000 >= exp) {
      clearSession()
      return null
    }
    return {
      token: s.token,
      username: s.username,
      displayName: typeof s.displayName === 'string' ? s.displayName : s.username,
    }
  } catch {
    return null
  }
}

export function saveSession(session: UserSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    /* ignore */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
