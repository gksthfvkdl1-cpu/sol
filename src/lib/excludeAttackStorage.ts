/** 길드전 제외 영웅 일자: 한국시간 09:00에 날짜가 바뀜 (08:59까지는 전날). */

export function guildWarDayYmdSeoul(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const y = Number(get('year'))
  const m = Number(get('month'))
  const d = Number(get('day'))
  let hour = Number(get('hour'))
  // en-CA hour can be "24" for midnight in some engines
  if (hour === 24) hour = 0

  // 09:00 미만이면 전날 길드전일
  const utc = Date.UTC(y, m - 1, d) - (hour < 9 ? 86_400_000 : 0)
  const dt = new Date(utc)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

type StoredExclude = {
  guildDay: string
  heroes: string[]
}

function storageKey(userId: string): string {
  return `seven-exclude-attack-${userId}`
}

function normalizeHeroes(heroes: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const h of heroes) {
    const t = h.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export function loadExcludeAttackHeroes(userId: string): string[] {
  if (!userId.trim()) return []
  const day = guildWarDayYmdSeoul()
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredExclude
    if (!parsed || typeof parsed !== 'object') return []
    if (String(parsed.guildDay ?? '') !== day) return []
    if (!Array.isArray(parsed.heroes)) return []
    return normalizeHeroes(parsed.heroes.map((x) => String(x)))
  } catch {
    return []
  }
}

export function saveExcludeAttackHeroes(userId: string, heroes: string[]): string[] {
  if (!userId.trim()) return []
  const day = guildWarDayYmdSeoul()
  const next = normalizeHeroes(heroes)
  try {
    const payload: StoredExclude = { guildDay: day, heroes: next }
    localStorage.setItem(storageKey(userId), JSON.stringify(payload))
  } catch {
    /* ignore */
  }
  return next
}

export function mergeExcludeAttackHeroes(
  userId: string,
  current: string[],
  toAdd: string[],
): string[] {
  return saveExcludeAttackHeroes(userId, [...current, ...toAdd])
}

export function attackHeroesFromMatchup(row: {
  attack1?: unknown
  attack2?: unknown
  attack3?: unknown
}): string[] {
  return [row.attack1, row.attack2, row.attack3]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
}
