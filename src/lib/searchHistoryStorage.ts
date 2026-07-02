export type SearchHistoryItem = {
  d1: string
  d2: string
  d3: string
  exclude: string[]
}

const MAX_ITEMS = 5

function storageKey(userId: string): string {
  return `seven-search-history-${userId}`
}

function normalize(item: SearchHistoryItem): SearchHistoryItem {
  return {
    d1: item.d1.trim(),
    d2: item.d2.trim(),
    d3: item.d3.trim(),
    exclude: item.exclude.map((x) => x.trim()).filter(Boolean).sort(),
  }
}

function isSameQuery(a: SearchHistoryItem, b: SearchHistoryItem): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (na.d1 !== nb.d1 || na.d2 !== nb.d2 || na.d3 !== nb.d3) return false
  if (na.exclude.length !== nb.exclude.length) return false
  return na.exclude.every((x, i) => x === nb.exclude[i])
}

function hasDefenseQuery(item: SearchHistoryItem): boolean {
  const n = normalize(item)
  return Boolean(n.d1 || n.d2 || n.d3)
}

export function loadSearchHistory(userId: string): SearchHistoryItem[] {
  if (!userId.trim()) return []
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const r = row as Record<string, unknown>
        return normalize({
          d1: String(r.d1 ?? ''),
          d2: String(r.d2 ?? ''),
          d3: String(r.d3 ?? ''),
          exclude: Array.isArray(r.exclude)
            ? r.exclude.map((x) => String(x)).filter(Boolean)
            : [],
        })
      })
      .filter((item): item is SearchHistoryItem => item != null && hasDefenseQuery(item))
      .slice(0, MAX_ITEMS)
  } catch {
    return []
  }
}

export function pushSearchHistory(
  userId: string,
  item: SearchHistoryItem,
): SearchHistoryItem[] {
  if (!userId.trim() || !hasDefenseQuery(item)) {
    return loadSearchHistory(userId)
  }
  const next = normalize(item)
  const prev = loadSearchHistory(userId).filter((h) => !isSameQuery(h, next))
  const out = [next, ...prev].slice(0, MAX_ITEMS)
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(out))
  } catch {
    /* ignore */
  }
  return out
}

export function formatSearchHistoryLabel(item: SearchHistoryItem): string {
  const n = normalize(item)
  const label = [n.d1, n.d2, n.d3].map((s) => s || '-').join(' / ')
  if (n.exclude.length === 0) return label
  return `${label} · 제외 ${n.exclude.join(', ')}`
}

export function searchHistoryKey(item: SearchHistoryItem, index: number): string {
  const n = normalize(item)
  return `${index}:${n.d1}|${n.d2}|${n.d3}|${n.exclude.join(',')}`
}
