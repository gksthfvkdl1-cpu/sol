export const SESSION_TOKEN_STORAGE_KEY = 'seven_pg_session_token'

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token)
    else localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
