/**
 * 로그인 화면 배경 이미지(data URL)를 아이디별로 localStorage에 저장.
 * 키는 항상 소문자로 통일 — 로그인 RPC는 아이디를 소문자로 두는데,
 * 배경 저장은 예전에 입력 칸 그대로(trim)만 쓰면 세션 username 과 불일치해
 * 로그인 이후 화면에서 배경이 안 나오는 문제가 생김.
 * 기존에 저장된 `seven.loginBg.{입력대소문자}` 키도 읽기·삭제 시 함께 처리.
 */
const PREFIX = 'seven.loginBg.'

function canonicalKey(username: string): string {
  return `${PREFIX}${username.trim().toLowerCase()}`
}

function legacyKey(username: string): string {
  return `${PREFIX}${username.trim()}`
}

export function loginBgKey(username: string): string {
  return canonicalKey(username)
}

function findBgKeyCaseInsensitive(usernameLower: string): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(PREFIX)) continue
      const suffix = key.slice(PREFIX.length)
      if (suffix.toLowerCase() === usernameLower) return key
    }
  } catch {
    /* ignore */
  }
  return null
}

export function readLoginBgForUser(username: string): string | null {
  const t = username.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  try {
    const canonical = localStorage.getItem(canonicalKey(t))
    if (canonical) return canonical
    const leg = localStorage.getItem(legacyKey(t))
    if (leg) {
      try {
        localStorage.setItem(canonicalKey(t), leg)
        localStorage.removeItem(legacyKey(t))
      } catch {
        /* 이전 키 → 소문자 키 이전 실패 시에도 leg 는 반환 */
      }
      return leg
    }
    const loose = findBgKeyCaseInsensitive(lower)
    if (loose) {
      const val = localStorage.getItem(loose)
      if (val) {
        try {
          localStorage.setItem(canonicalKey(t), val)
          if (loose !== canonicalKey(t)) localStorage.removeItem(loose)
        } catch {
          /* ignore migration */
        }
        return val
      }
    }
    return null
  } catch {
    return null
  }
}

export function writeLoginBgForUser(username: string, dataUrl: string): void {
  const t = username.trim()
  if (!t) return
  try {
    localStorage.setItem(canonicalKey(t), dataUrl)
  } catch {
    /* quota */
  }
}

export function clearLoginBgForUser(username: string): void {
  const t = username.trim()
  if (!t) return
  try {
    localStorage.removeItem(canonicalKey(t))
    localStorage.removeItem(legacyKey(t))
    const loose = findBgKeyCaseInsensitive(t.toLowerCase())
    if (loose) localStorage.removeItem(loose)
  } catch {
    /* ignore */
  }
}
