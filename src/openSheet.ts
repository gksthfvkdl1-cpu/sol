export type SheetGuideRow = {
  id: string
  defense1: string
  defense2: string
  defense3: string
  attack1: string
  attack2: string
  attack3: string
  comment: string
  win: number
  lose: number
}

function toStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function toNonNegInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.max(0, Math.trunc(v))
  }
  const s = toStr(v)
  if (!s) return 0
  const n = Number.parseInt(s, 10)
  return Number.isNaN(n) ? 0 : Math.max(0, n)
}

function getCell(row: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key]
  const found = Object.keys(row).find(
    (k) => k.trim().toLowerCase() === key.toLowerCase(),
  )
  return found ? row[found] : undefined
}

export function normalizeOpenSheetRows(json: unknown): SheetGuideRow[] {
  if (!Array.isArray(json)) {
    throw new Error('시트 응답이 배열이 아닙니다. OpenSheet URL과 시트 이름을 확인하세요.')
  }

  return json.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`행 ${index + 1}: 유효한 객체가 아닙니다.`)
    }
    const row = raw as Record<string, unknown>
    return {
      id: `row-${index}`,
      defense1: toStr(getCell(row, 'defense1')),
      defense2: toStr(getCell(row, 'defense2')),
      defense3: toStr(getCell(row, 'defense3')),
      attack1: toStr(getCell(row, 'attack1')),
      attack2: toStr(getCell(row, 'attack2')),
      attack3: toStr(getCell(row, 'attack3')),
      comment: toStr(getCell(row, 'comment')),
      win: toNonNegInt(getCell(row, 'win')),
      lose: toNonNegInt(getCell(row, 'lose')),
    }
  })
}

export async function fetchOpenSheetRows(
  url: string,
  signal?: AbortSignal,
): Promise<SheetGuideRow[]> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`시트 요청 실패 (${res.status} ${res.statusText})`)
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new Error('응답 JSON 파싱에 실패했습니다.')
  }

  return normalizeOpenSheetRows(data)
}

export function formatWinRate(win: number, lose: number): string {
  const total = win + lose
  if (total <= 0) return '—'
  const pct = Math.round((win / total) * 100)
  return `${pct}% (${win}승 ${lose}패)`
}
