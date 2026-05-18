/**
 * 게임 리플레이 스크린샷에서 공격/방어 캐릭터를 자동 인식하기 위한 유틸.
 * - 외부 API/서버를 사용하지 않고 브라우저 안에서 모든 처리를 수행한다.
 * - 캐릭터 매칭은 dHash(64bit) + 해밍 거리로 진행한다.
 */

export type Outcome = 'win' | 'lose'

export type SlotRect = {
  /** 0..1 비율 좌표 (이미지 너비/높이 기준) */
  x: number
  y: number
  w: number
  h: number
}

export type ReplayLayout = {
  /** 공격(상단) 캐릭터 슬롯 — 왼→오 (5개, 그 중 3개만 채워진다) */
  attack: SlotRect[]
  /** 방어(하단) 캐릭터 슬롯 — 왼→오 (5개, 그 중 3개만 채워진다) */
  defense: SlotRect[]
  /** 공격 펫(우측 상단, 등록되는 펫) */
  pet: SlotRect
}

/** 공격·방어 슬롯 개수 (게임 UI 기준 한 줄 5칸 고정) */
export const SLOTS_PER_ROW = 5
/** 한 매치업에 들어가는 채워진 슬롯 수 (DB matchups: defense1~3, attack1~3) */
export const FILLED_SLOTS_REQUIRED = 3

/**
 * 캐릭터·펫 슬롯 ROI (0~1 정규화). 캘리브레이션으로 측정한 값.
 * 한 줄 5칸(공격/방어) + 펫 1 — 그중 임의 3칸만 채워질 수 있으므로 5칸을 모두 스캔한다.
 */
export const DEFAULT_REPLAY_LAYOUT: ReplayLayout = {
  attack: [
    { x: 0.443, y: 0.294, w: 0.035, h: 0.116 },
    { x: 0.48, y: 0.281, w: 0.035, h: 0.125 },
    { x: 0.516, y: 0.277, w: 0.039, h: 0.126 },
    { x: 0.556, y: 0.288, w: 0.034, h: 0.116 },
    { x: 0.594, y: 0.288, w: 0.032, h: 0.109 },
  ],
  defense: [
    { x: 0.443, y: 0.436, w: 0.034, h: 0.12 },
    { x: 0.48, y: 0.443, w: 0.03, h: 0.113 },
    { x: 0.518, y: 0.44, w: 0.034, h: 0.118 },
    { x: 0.557, y: 0.438, w: 0.034, h: 0.118 },
    { x: 0.593, y: 0.438, w: 0.035, h: 0.118 },
  ],
  pet: { x: 0.658, y: 0.301, w: 0.045, h: 0.09 },
}

/**
 * 사각형 박스에서 가운데 정사각을 잘라내는 헬퍼.
 * - 변 길이 = `min(w, h)`
 * - 박스 내부에서 가로·세로 모두 가운데 정렬
 * 슬롯·아이콘 양쪽이 모두 같은 영역(중앙 얼굴)을 비교하게 되어 dHash 점수가 안정적으로 모인다.
 */
export function centerSquareRect(rectPx: {
  x: number
  y: number
  w: number
  h: number
}): { x: number; y: number; w: number; h: number } {
  const side = Math.min(rectPx.w, rectPx.h)
  const x = rectPx.x + Math.max(0, (rectPx.w - side) / 2)
  const y = rectPx.y + Math.max(0, (rectPx.h - side) / 2)
  return { x, y, w: side, h: side }
}

/**
 * @deprecated `centerSquareRect` 로 대체. 외부 참조 호환용으로만 남겨둠.
 * 박스 윗부분에서 정사각을 잘라낸다.
 */
export function topSquareRect(rectPx: {
  x: number
  y: number
  w: number
  h: number
}): { x: number; y: number; w: number; h: number } {
  const side = Math.min(rectPx.w, rectPx.h)
  const x = rectPx.x + Math.max(0, (rectPx.w - side) / 2)
  const y = rectPx.y
  return { x, y, w: side, h: side }
}

/**
 * @deprecated topSquareRect 로 대체됨. 외부 참조 호환을 위해 남겨둠.
 * 슬롯 박스 안에서 얼굴 위주 영역을 잘라낼 때 사용하던 구버전 inset.
 */
export const FACE_INSET = { x: 0.05, y: 0.03, w: 0.90, h: 0.65 }

/**
 * 256비트 dHash: 17x16 격자 → 16(차분) × 16(행) = 256bit.
 * 64비트(9x8) 대비 표현력 4배 ↑ → 비슷하게 생긴 영웅끼리 점수 분리가 잘 되어
 * 매칭 정확도가 의미 있게 올라간다. 비교 비용은 비트 XOR · popcount뿐이라
 * 영웅 100~200명 규모에서는 체감 차이가 거의 없다.
 */
const HASH_GRID_W = 17
const HASH_GRID_H = 16
const HASH_BITS = (HASH_GRID_W - 1) * HASH_GRID_H

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err instanceof Event ? new Error('이미지 로드 실패') : err)
    }
    img.src = url
  })
}

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${url}`))
    img.src = url
  })
}

/** 이미지의 (px) ROI를 잘라 표준 크기로 그려서 ImageData로 반환 */
function drawRoiToCanvas(
  source: CanvasImageSource & { width?: number; height?: number },
  rect: { x: number; y: number; w: number; h: number },
  outW: number,
  outH: number,
): ImageData | null {
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  try {
    ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, outW, outH)
  } catch {
    return null
  }
  try {
    return ctx.getImageData(0, 0, outW, outH)
  } catch {
    return null
  }
}

function rectFromLayout(
  rect: SlotRect,
  imgW: number,
  imgH: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.max(0, Math.round(rect.x * imgW)),
    y: Math.max(0, Math.round(rect.y * imgH)),
    w: Math.max(1, Math.round(rect.w * imgW)),
    h: Math.max(1, Math.round(rect.h * imgH)),
  }
}

/**
 * dHash(차분 해시): `HASH_GRID_W × HASH_GRID_H` 그레이스케일에서 가로 인접 픽셀 차이로
 * `(W-1) × H` 비트 해시 생성. 현재 17×16 → 256비트.
 */
export function computeDHashFromImageData(data: ImageData): bigint {
  const W = HASH_GRID_W
  const H = HASH_GRID_H
  const tmp = document.createElement('canvas')
  tmp.width = W
  tmp.height = H
  const ctx = tmp.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0n
  const big = document.createElement('canvas')
  big.width = data.width
  big.height = data.height
  const bctx = big.getContext('2d', { willReadFrequently: true })
  if (!bctx) return 0n
  bctx.putImageData(data, 0, 0)
  ctx.drawImage(big, 0, 0, W, H)
  const small = ctx.getImageData(0, 0, W, H).data

  const gray: number[] = new Array(W * H)
  for (let i = 0; i < W * H; i += 1) {
    const r = small[i * 4]
    const g = small[i * 4 + 1]
    const b = small[i * 4 + 2]
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }

  let hash = 0n
  let bit = 0
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W - 1; x += 1) {
      const left = gray[y * W + x]
      const right = gray[y * W + x + 1]
      if (right > left) hash |= 1n << BigInt(bit)
      bit += 1
    }
  }
  return hash
}

export function computeDHashFromImage(
  img: HTMLImageElement,
  rectPx?: { x: number; y: number; w: number; h: number },
): bigint {
  const w = rectPx ? rectPx.w : img.naturalWidth || img.width
  const h = rectPx ? rectPx.h : img.naturalHeight || img.height
  const data = drawRoiToCanvas(
    img,
    rectPx ?? { x: 0, y: 0, w, h },
    Math.min(96, Math.max(32, Math.round(w))),
    Math.min(96, Math.max(32, Math.round(h))),
  )
  if (!data) return 0n
  return computeDHashFromImageData(data)
}

/** BigInt 의 1비트 개수. 64/256비트 모두 동작. */
export function hammingDistance64(a: bigint, b: bigint): number {
  let x = a ^ b
  let n = 0
  while (x !== 0n) {
    n += Number(x & 1n)
    x >>= 1n
  }
  return n
}

/** 평균 밝기·표준편차로 슬롯이 비어 있는지 추정 (회색 단색이면 비어있음) */
export function estimateSlotEmptyScore(data: ImageData): {
  empty: boolean
  brightness: number
  variance: number
} {
  const len = data.width * data.height
  let sum = 0
  let sumSq = 0
  for (let i = 0; i < len; i += 1) {
    const r = data.data[i * 4]
    const g = data.data[i * 4 + 1]
    const b = data.data[i * 4 + 2]
    const v = 0.299 * r + 0.587 * g + 0.114 * b
    sum += v
    sumSq += v * v
  }
  const mean = sum / len
  const variance = Math.max(0, sumSq / len - mean * mean)
  // 비어 있는 슬롯은 회색 단색 → 분산이 매우 낮음
  const empty = variance < 220 && mean > 90 && mean < 180
  return { empty, brightness: mean, variance }
}

export type HeroFingerprint = {
  heroKey: string
  displayName: string
  /** 실제 dHash 계산에 사용된 이미지 URL (icon_url 우선, 없으면 image_url) */
  sourceUrl: string
  /** 매칭에 icon_url 을 사용했는지 여부 (UI 점수 보정용) */
  usedIcon: boolean
  hash: bigint
}

export type HeroPortraitEntry = {
  heroKey: string
  displayName: string
  /** 큰 일러스트 URL — 인게임 아이콘과 다르므로 매칭 정확도가 낮음. icon_url 이 없을 때만 폴백 사용 */
  imageUrl: string
  /** 인게임 슬롯과 비슷한 작은 아이콘 URL — 있으면 매칭에 우선 사용 */
  iconUrl?: string
}

/**
 * 영웅 portrait URL 목록을 받아 dHash 지문 테이블 생성 (CORS 실패는 건너뜀).
 * icon_url 이 등록되어 있으면 그쪽을 사용하고, 없으면 image_url 로 폴백한다.
 *
 * 아이콘 쪽에도 “윗부분 정사각”을 적용해서 슬롯 매칭(slotMatchRect)과 같은 비율·같은 영역을
 * 비교하게 한다. 이렇게 해야 등록 아이콘이 (얼굴+별/레벨) 풀 헥사 형태든, 얼굴만 정사각이든
 * 슬롯 윗부분 얼굴과 1:1로 매치된다.
 */
export async function buildHeroFingerprints(
  entries: HeroPortraitEntry[],
): Promise<HeroFingerprint[]> {
  const out: HeroFingerprint[] = []
  for (const e of entries) {
    const iconUrl = (e.iconUrl ?? '').trim()
    const fallbackUrl = (e.imageUrl ?? '').trim()
    const sourceUrl = iconUrl || fallbackUrl
    if (!sourceUrl) continue
    try {
      const img = await loadImageFromUrl(sourceUrl)
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      // 아이콘 이미지의 “중앙 정사각”을 사용 (얼굴은 보통 중앙에 있음).
      // topSquareRect 는 위쪽 정사각이라 세로로 긴 아이콘에선 얼굴 아래쪽이 잘려 매칭이 약해진다.
      const square = centerSquareRect({ x: 0, y: 0, w, h })
      const hash = computeDHashFromImage(img, square)
      if (hash !== 0n) {
        out.push({
          heroKey: e.heroKey,
          displayName: e.displayName,
          sourceUrl,
          usedIcon: Boolean(iconUrl),
          hash,
        })
      }
    } catch {
      /* 일부 이미지가 CORS 실패해도 나머지는 사용 */
    }
  }
  return out
}

export type SlotMatch = {
  empty: boolean
  brightness: number
  topGuess: HeroFingerprint | null
  /** 0(완전 다름) ~ 1(거의 동일). 해밍거리 기반 점수 */
  topScore: number
  /** 상위 후보 (이미 topGuess 포함). 모달 드롭다운 보조용 */
  candidates: Array<{ hero: HeroFingerprint; score: number }>
}

/**
 * @deprecated 단일 윈도우 시절 호환용. 새 코드는 `slotMatchRects` 사용.
 */
export function slotMatchRect(slotPx: {
  x: number
  y: number
  w: number
  h: number
}): { x: number; y: number; w: number; h: number } {
  return centerSquareRect(slotPx)
}

/**
 * 공격/방어 슬롯: 슬롯 안에서 정사각 윈도우(side = `min(w,h) × fraction`) 를 세로로 N개
 * 슬라이드하며 잘라 각각 dHash → 영웅별 max(score) 를 매칭 점수로 채택한다.
 * - 정사각이라 영웅 아이콘(중앙 정사각 dHash)과 종횡비 1:1 일치 → dHash 점수가 의미를 가짐.
 * - fraction 슬라이더로 정사각의 변 길이를 줄일 수 있다 (기본 1.0 = 슬롯 폭).
 * - positions 로 위/아래 어디에 헥사가 있어도 한 위치가 걸리도록 슬라이드 개수를 정한다.
 */
export const DEFAULT_CHARACTER_MATCH_POSITIONS = 3
/** 정사각 윈도우 변 길이 = `min(slot.w, slot.h) × fraction`. 기본 1.0 = 슬롯 폭 정사각. */
export const DEFAULT_CHARACTER_MATCH_WINDOW_FRAC = 1.0

export type SlotMatchRole = 'character' | 'pet'

/**
 * 슬롯 박스 안에서 매칭에 사용할 윈도우들.
 * - `character`: 정사각 윈도우(side = `min(w,h) × fraction`) 을 가로 가운데 정렬해 세로로 N개 슬라이드.
 * - `pet`: 분할 없이 슬롯 전체 한 번만 비교.
 *
 * 슬롯이 너무 작거나 슬라이드 범위가 1px 미만이면 1개만 반환.
 */
export function slotMatchRects(
  slotPx: {
    x: number
    y: number
    w: number
    h: number
  },
  role: SlotMatchRole = 'character',
  positions: number = DEFAULT_CHARACTER_MATCH_POSITIONS,
  fraction: number = DEFAULT_CHARACTER_MATCH_WINDOW_FRAC,
): Array<{ x: number; y: number; w: number; h: number }> {
  if (role === 'pet') {
    return [{ x: slotPx.x, y: slotPx.y, w: slotPx.w, h: slotPx.h }]
  }
  const f = Math.min(1, Math.max(0.05, fraction))
  const baseSide = Math.min(slotPx.w, slotPx.h)
  const side = Math.min(slotPx.w, slotPx.h, baseSide * f)
  if (side < 1) {
    return [{ x: slotPx.x, y: slotPx.y, w: slotPx.w, h: slotPx.h }]
  }
  const x = slotPx.x + Math.max(0, (slotPx.w - side) / 2)
  const slideRange = Math.max(0, slotPx.h - side)
  const n = Math.max(1, Math.min(20, Math.round(positions)))
  if (n <= 1 || slideRange < 1) {
    return [{ x, y: slotPx.y + slideRange / 2, w: side, h: side }]
  }
  const step = slideRange / (n - 1)
  const out: Array<{ x: number; y: number; w: number; h: number }> = []
  for (let i = 0; i < n; i += 1) {
    out.push({ x, y: slotPx.y + step * i, w: side, h: side })
  }
  return out
}

function matchSlot(
  img: HTMLImageElement,
  slotRectPx: { x: number; y: number; w: number; h: number },
  fingerprints: HeroFingerprint[],
  role: SlotMatchRole,
  positions: number,
  fraction: number,
): SlotMatch {
  // 비어있는지 판정은 슬롯 전체 분산으로 (회색 단색 = 비어있음)
  const fullData = drawRoiToCanvas(img, slotRectPx, 32, 32)
  if (!fullData) {
    return {
      empty: true,
      brightness: 0,
      topGuess: null,
      topScore: 0,
      candidates: [],
    }
  }
  const empty = estimateSlotEmptyScore(fullData)
  if (empty.empty) {
    return {
      empty: true,
      brightness: empty.brightness,
      topGuess: null,
      topScore: 0,
      candidates: [],
    }
  }

  // 슬라이딩 직사각 윈도우(캐릭터) 또는 펫 전체 → 각각 dHash → 영웅별 max(score)
  const rects = slotMatchRects(slotRectPx, role, positions, fraction)
  const hashes: bigint[] = []
  for (const r of rects) {
    const data = drawRoiToCanvas(img, r, 64, 64)
    if (!data) continue
    hashes.push(computeDHashFromImageData(data))
  }
  if (hashes.length === 0) {
    return {
      empty: false,
      brightness: empty.brightness,
      topGuess: null,
      topScore: 0,
      candidates: [],
    }
  }

  const scored = fingerprints.map((fp) => {
    let best = 0
    for (const h of hashes) {
      const dist = hammingDistance64(h, fp.hash)
      const score = 1 - dist / HASH_BITS
      if (score > best) best = score
    }
    return { hero: fp, score: best }
  })
  scored.sort((a, b) => b.score - a.score)
  const candidates = scored.slice(0, 5)
  const top = candidates[0] ?? null
  return {
    empty: false,
    brightness: empty.brightness,
    topGuess: top ? top.hero : null,
    topScore: top ? top.score : 0,
    candidates,
  }
}

export type ReplayDetection = {
  attack: SlotMatch[]
  defense: SlotMatch[]
  pet: SlotMatch
}

export function analyzeReplay(
  img: HTMLImageElement,
  fingerprints: HeroFingerprint[],
  layout: ReplayLayout = DEFAULT_REPLAY_LAYOUT,
  characterWindowPositions: number = DEFAULT_CHARACTER_MATCH_POSITIONS,
  characterWindowFraction: number = DEFAULT_CHARACTER_MATCH_WINDOW_FRAC,
): ReplayDetection {
  const W = img.naturalWidth || img.width
  const H = img.naturalHeight || img.height
  const px = (r: SlotRect) => rectFromLayout(r, W, H)
  return {
    attack: layout.attack.map((r) =>
      matchSlot(img, px(r), fingerprints, 'character', characterWindowPositions, characterWindowFraction),
    ),
    defense: layout.defense.map((r) =>
      matchSlot(img, px(r), fingerprints, 'character', characterWindowPositions, characterWindowFraction),
    ),
    pet: matchSlot(img, px(layout.pet), fingerprints, 'pet', characterWindowPositions, characterWindowFraction),
  }
}
