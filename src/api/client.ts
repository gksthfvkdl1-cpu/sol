/** 로컬: 비우면 Vite 프록시 `/api` 사용. 배포: `https://api.example.com` (슬래시 없음) */
export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '') ?? ''
  const p = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${p}` : p
}

export async function apiJson<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`)
  }
  if (
    init.body != null &&
    typeof init.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(apiUrl(path), { ...init, headers })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = { error: text }
    }
  }
  if (!res.ok) {
    const rawMsg =
      typeof data === 'object' &&
      data &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `요청 실패 (${res.status})`
    const looksLikeHtml =
      rawMsg.includes('<html') || rawMsg.includes('<!doctype html') || rawMsg.includes('<head>')
    const missingApiOnDeploy =
      looksLikeHtml && res.status === 405 && path.startsWith('/api/')
    const msg = missingApiOnDeploy
      ? '배포 API 서버가 연결되지 않았습니다. 관리자에게 VITE_API_URL(백엔드 주소) 설정을 요청하세요.'
      : rawMsg
    throw new Error(msg)
  }
  return data as T
}
