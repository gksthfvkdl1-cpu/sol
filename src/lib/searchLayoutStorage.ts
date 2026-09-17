export type SearchLayoutMode = 'A' | 'B'

function storageKey(userId: string): string {
  return `seven-search-layout-${userId}`
}

export function loadSearchLayout(userId: string): SearchLayoutMode {
  if (!userId.trim()) return 'A'
  try {
    const v = localStorage.getItem(storageKey(userId))
    if (v === 'A' || v === 'B') return v
  } catch {
    /* ignore */
  }
  return 'A'
}

export function saveSearchLayout(userId: string, mode: SearchLayoutMode) {
  if (!userId.trim()) return
  try {
    localStorage.setItem(storageKey(userId), mode)
  } catch {
    /* ignore */
  }
}
