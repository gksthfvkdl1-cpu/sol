import type { SheetGuideRow } from './openSheet.ts'

export type SuggestColumnKey =
  | 'defense1'
  | 'defense2'
  | 'defense3'
  | 'attack1'
  | 'attack2'
  | 'attack3'

export function uniqueColumnOptions(
  rows: SheetGuideRow[],
  key: SuggestColumnKey,
): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    const v = String(r[key] ?? '').trim()
    if (v) set.add(v)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
}
