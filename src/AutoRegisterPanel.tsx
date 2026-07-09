import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { AutocompleteField } from './AutocompleteField.tsx'
import { LoadoutSelectField } from './LoadoutSelectField.tsx'
import { supabase } from './supabase/client.ts'
import { joinLoadoutSlots, EQUIPMENT_OPTIONS, FORMATION_OPTIONS } from './lib/matchupLoadoutOptions.ts'
import { portraitKey } from './lib/portraitKey.ts'
import {
  DEFAULT_CHARACTER_MATCH_POSITIONS,
  DEFAULT_CHARACTER_MATCH_WINDOW_FRAC,
  DEFAULT_REPLAY_LAYOUT,
  FILLED_SLOTS_REQUIRED,
  SLOTS_PER_ROW,
  analyzeReplay,
  buildHeroFingerprints,
  loadImageFromFile,
  slotMatchRects,
  type HeroFingerprint,
  type ReplayDetection,
  type SlotMatch,
  type SlotRect,
} from './lib/imageAnalysis.ts'

type Outcome = 'win' | 'lose'

type EditableSlot = {
  /** 사용자가 최종 선택한 영웅 이름. 빈 문자열이면 비어 있는 슬롯으로 등록 */
  name: string
  /** 자동 인식 결과 (참고/표시용) */
  detection: SlotMatch
}

type Props = {
  sessionToken: string | null
  heroOptions: string[]
  portraitUrlByKey: Readonly<Record<string, string>>
  /** 인게임 아이콘 URL 맵 (있으면 매칭에 우선 사용) */
  iconUrlByKey?: Readonly<Record<string, string>>
  /** 등록 후 통계/검색 갱신용 */
  onRegistered?: () => void
}

const SCORE_LOW = 0.74

function emptySlot(): EditableSlot {
  return {
    name: '',
    detection: {
      empty: true,
      brightness: 0,
      topGuess: null,
      topScore: 0,
      candidates: [],
    },
  }
}

function slotFromDetection(s: SlotMatch): EditableSlot {
  if (s.empty) return { name: '', detection: s }
  return {
    name: s.topGuess ? s.topGuess.displayName : '',
    detection: s,
  }
}

function nonEmptyTrimmed(values: string[]): string[] {
  return values.map((v) => v.trim()).filter(Boolean)
}

/** 채워진 영웅 이름만 앞에서부터 모음 (제출용). 5칸 중 임의 위치 → 1·2·3번으로 압축. */
function packFilled(slots: EditableSlot[]): string[] {
  return slots
    .map((s) => s.name.trim())
    .filter((name) => name.length > 0)
}

function makeEmptyTeam(): EditableSlot[] {
  return Array.from({ length: SLOTS_PER_ROW }, () => emptySlot())
}

function makeEmptyPetRow(): EditableSlot[] {
  return [emptySlot(), emptySlot(), emptySlot()]
}

/* ─────────────────────────────────────────────────────────────────────
 * 캘리브레이션 (좌표 직접 설정)
 * 사용자가 미리보기 위에 빨강(공격)/파랑(방어)/초록(펫) 박스를 직접 그려
 * SlotRect(0..1) 좌표를 산출하고, imageAnalysis.ts 의 DEFAULT_REPLAY_LAYOUT
 * 에 그대로 붙여넣을 수 있는 코드 스니펫으로 출력한다. (MVP 1차)
 * ──────────────────────────────────────────────────────────────────── */
type CalibBoxKind = 'attack' | 'defense' | 'pet'

type CalibBox = {
  id: string
  kind: CalibBoxKind
  /** 0..1 비율 좌표 (이미지 너비/높이 기준) */
  x: number
  y: number
  w: number
  h: number
}

type CalibDragState =
  | {
      kind: 'create'
      id: string
      startX: number
      startY: number
    }
  | {
      kind: 'move'
      id: string
      baseX: number
      baseY: number
      pointerX: number
      pointerY: number
    }
  | {
      kind: 'resize'
      id: string
      baseX: number
      baseY: number
      baseW: number
      baseH: number
      pointerX: number
      pointerY: number
    }
  | null

const CALIB_STORAGE_KEY = 'sevenAutoCalibBoxes_v1'
const WINDOW_POSITIONS_STORAGE_KEY = 'sevenAutoCharWindowPositions_v1'
const WINDOW_FRAC_STORAGE_KEY = 'sevenAutoCharWindowFrac_v1'
const WINDOW_POSITIONS_MIN = 1
const WINDOW_POSITIONS_MAX = 9
const WINDOW_FRAC_STEP = 0.05
const WINDOW_FRAC_MIN = 0.05
const CALIB_MIN_SIZE = 0.005

const clampWindowPositions = (v: number): number => {
  if (!Number.isFinite(v)) return DEFAULT_CHARACTER_MATCH_POSITIONS
  const r = Math.round(v)
  return Math.min(WINDOW_POSITIONS_MAX, Math.max(WINDOW_POSITIONS_MIN, r))
}

function loadWindowPositions(): number {
  if (typeof window === 'undefined') return DEFAULT_CHARACTER_MATCH_POSITIONS
  try {
    const raw = window.localStorage.getItem(WINDOW_POSITIONS_STORAGE_KEY)
    if (!raw) return DEFAULT_CHARACTER_MATCH_POSITIONS
    const n = Number(raw)
    if (!Number.isFinite(n)) return DEFAULT_CHARACTER_MATCH_POSITIONS
    return clampWindowPositions(n)
  } catch {
    return DEFAULT_CHARACTER_MATCH_POSITIONS
  }
}

function saveWindowPositions(v: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WINDOW_POSITIONS_STORAGE_KEY, String(v))
  } catch {
    /* quota / private mode 등 무시 */
  }
}

const clampWindowFrac = (v: number): number => {
  if (!Number.isFinite(v)) return DEFAULT_CHARACTER_MATCH_WINDOW_FRAC
  const stepped = Math.round(v / WINDOW_FRAC_STEP) * WINDOW_FRAC_STEP
  const rounded = Math.round(stepped * 100) / 100
  return Math.min(1, Math.max(WINDOW_FRAC_MIN, rounded))
}

function loadWindowFrac(): number {
  if (typeof window === 'undefined') return DEFAULT_CHARACTER_MATCH_WINDOW_FRAC
  try {
    const raw = window.localStorage.getItem(WINDOW_FRAC_STORAGE_KEY)
    if (!raw) return DEFAULT_CHARACTER_MATCH_WINDOW_FRAC
    const n = Number(raw)
    if (!Number.isFinite(n)) return DEFAULT_CHARACTER_MATCH_WINDOW_FRAC
    return clampWindowFrac(n)
  } catch {
    return DEFAULT_CHARACTER_MATCH_WINDOW_FRAC
  }
}

function saveWindowFrac(v: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WINDOW_FRAC_STORAGE_KEY, String(v))
  } catch {
    /* quota / private mode 등 무시 */
  }
}
const KIND_LABEL: Record<CalibBoxKind, string> = {
  attack: '공격(빨강)',
  defense: '방어(파랑)',
  pet: '펫(초록)',
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

function loadCalibBoxes(): CalibBox[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CALIB_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (b): b is CalibBox =>
        typeof b === 'object' &&
        b !== null &&
        typeof (b as CalibBox).id === 'string' &&
        ((b as CalibBox).kind === 'attack' ||
          (b as CalibBox).kind === 'defense' ||
          (b as CalibBox).kind === 'pet') &&
        typeof (b as CalibBox).x === 'number' &&
        typeof (b as CalibBox).y === 'number' &&
        typeof (b as CalibBox).w === 'number' &&
        typeof (b as CalibBox).h === 'number',
    )
  } catch {
    return []
  }
}

function saveCalibBoxes(boxes: CalibBox[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CALIB_STORAGE_KEY, JSON.stringify(boxes))
  } catch {
    /* quota / private mode 등 무시 */
  }
}

function pickNextKind(boxes: CalibBox[]): CalibBoxKind {
  const counts: Record<CalibBoxKind, number> = {
    attack: 0,
    defense: 0,
    pet: 0,
  }
  for (const b of boxes) counts[b.kind] += 1
  if (counts.attack < SLOTS_PER_ROW) return 'attack'
  if (counts.defense < SLOTS_PER_ROW) return 'defense'
  if (counts.pet < 1) return 'pet'
  return 'attack'
}

function fmtCoord(n: number): string {
  return n.toFixed(3)
}

function buildLayoutSnippet(boxes: CalibBox[]): string {
  const sortByX = (a: CalibBox, b: CalibBox) => a.x - b.x
  const attack = boxes.filter((b) => b.kind === 'attack').sort(sortByX)
  const defense = boxes.filter((b) => b.kind === 'defense').sort(sortByX)
  const pets = boxes.filter((b) => b.kind === 'pet')
  const fmt = (b: CalibBox) =>
    `  { x: ${fmtCoord(b.x)}, y: ${fmtCoord(b.y)}, w: ${fmtCoord(b.w)}, h: ${fmtCoord(b.h)} },`
  const lines: string[] = []
  lines.push('export const DEFAULT_REPLAY_LAYOUT: ReplayLayout = {')
  lines.push('  attack: [')
  for (const b of attack) lines.push('  ' + fmt(b))
  lines.push('  ],')
  lines.push('  defense: [')
  for (const b of defense) lines.push('  ' + fmt(b))
  lines.push('  ],')
  if (pets[0]) {
    const p = pets[0]
    lines.push(
      `  pet: { x: ${fmtCoord(p.x)}, y: ${fmtCoord(p.y)}, w: ${fmtCoord(p.w)}, h: ${fmtCoord(p.h)} },`,
    )
  } else {
    lines.push('  // pet: (펫 박스 없음)')
  }
  lines.push('}')
  return lines.join('\n')
}

export function AutoRegisterPanel({
  sessionToken,
  heroOptions,
  portraitUrlByKey,
  iconUrlByKey,
  onRegistered,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [detection, setDetection] = useState<ReplayDetection | null>(null)
  const [outcome, setOutcome] = useState<Outcome>('win')
  const [attackSlots, setAttackSlots] = useState<EditableSlot[]>(() => makeEmptyTeam())
  const [defenseSlots, setDefenseSlots] = useState<EditableSlot[]>(() => makeEmptyTeam())
  const [petSlots, setPetSlots] = useState<EditableSlot[]>(() => makeEmptyPetRow())
  const [equipment1, setEquipment1] = useState('')
  const [equipment2, setEquipment2] = useState('')
  const [equipment3, setEquipment3] = useState('')
  const [formation1, setFormation1] = useState('')
  const [formation2, setFormation2] = useState('')
  const [formation3, setFormation3] = useState('')
  const [fingerprints, setFingerprints] = useState<HeroFingerprint[] | null>(null)
  const [fingerprintBusy, setFingerprintBusy] = useState(false)
  const [fingerprintErr, setFingerprintErr] = useState<string | null>(null)
  const [showDebugOverlay, setShowDebugOverlay] = useState(false)
  const [characterWindowPositions, setCharacterWindowPositions] = useState<number>(() =>
    loadWindowPositions(),
  )
  const [characterWindowFrac, setCharacterWindowFrac] = useState<number>(() =>
    loadWindowFrac(),
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    saveWindowPositions(characterWindowPositions)
  }, [characterWindowPositions])

  useEffect(() => {
    saveWindowFrac(characterWindowFrac)
  }, [characterWindowFrac])

  // ── 캘리브레이션 (좌표 직접 설정) ──
  const [calibMode, setCalibMode] = useState(false)
  const [calibBoxes, setCalibBoxes] = useState<CalibBox[]>(() => loadCalibBoxes())
  const [selectedCalibId, setSelectedCalibId] = useState<string | null>(null)
  const [calibCopyMsg, setCalibCopyMsg] = useState<string | null>(null)
  const calibFrameRef = useRef<HTMLDivElement | null>(null)
  const calibDragRef = useRef<CalibDragState>(null)

  useEffect(() => {
    saveCalibBoxes(calibBoxes)
  }, [calibBoxes])

  /** hero_portraits → 지문 테이블 (탭 진입 후 첫 사용 직전에 1회 빌드) */
  const ensureFingerprints = useCallback(async (): Promise<HeroFingerprint[]> => {
    if (fingerprints && fingerprints.length > 0) return fingerprints
    setFingerprintBusy(true)
    setFingerprintErr(null)
    try {
      const { data, error } = await supabase.rpc('hero_portraits_map')
      if (error || !data) {
        setFingerprintErr(error?.message ?? '캐릭터 이미지 목록을 불러오지 못했습니다.')
        return []
      }
      const rows =
        (data as Array<{
          hero_key: string
          image_url: string
          icon_url?: string | null
        }>) ?? []
      const heroByKey = new Map<string, string>()
      for (const opt of heroOptions) {
        const key = portraitKey(opt)
        if (key && !heroByKey.has(key)) heroByKey.set(key, opt.trim())
      }
      const built = await buildHeroFingerprints(
        rows.map((r) => {
          const iconFromRow = String(r.icon_url ?? '').trim()
          const iconFromMap = (iconUrlByKey?.[r.hero_key] ?? '').trim()
          return {
            heroKey: r.hero_key,
            displayName: heroByKey.get(r.hero_key) || r.hero_key,
            imageUrl: r.image_url,
            iconUrl: iconFromRow || iconFromMap || undefined,
          }
        }),
      )
      setFingerprints(built)
      return built
    } catch (e) {
      setFingerprintErr(e instanceof Error ? e.message : '지문 생성 실패')
      return []
    } finally {
      setFingerprintBusy(false)
    }
  }, [fingerprints, heroOptions, iconUrlByKey])

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    const url = URL.createObjectURL(imageFile)
    setImagePreviewUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [imageFile])

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setErr(null)
    setMsg(null)
    setDetection(null)
    setAttackSlots(makeEmptyTeam())
    setDefenseSlots(makeEmptyTeam())
    setPetSlots(makeEmptyPetRow())
    setImageFile(f)
  }

  const runAnalysis = async () => {
    if (!imageFile) {
      setErr('스크린샷을 먼저 선택하세요.')
      return
    }
    setErr(null)
    setMsg(null)
    setAnalyzing(true)
    try {
      const fps = await ensureFingerprints()
      const img = await loadImageFromFile(imageFile)
      const det = analyzeReplay(
        img,
        fps,
        DEFAULT_REPLAY_LAYOUT,
        characterWindowPositions,
        characterWindowFrac,
      )
      setDetection(det)
      // 슬롯 위치(왼→오)를 그대로 유지. 5칸 중 비어있는 칸은 빈 칸으로 둔다.
      const fillTeamFixed = (slots: SlotMatch[], expected: number): EditableSlot[] =>
        Array.from({ length: expected }, (_, i) => {
          const s = slots[i]
          return s ? slotFromDetection(s) : emptySlot()
        })
      setAttackSlots(fillTeamFixed(det.attack, SLOTS_PER_ROW))
      setDefenseSlots(fillTeamFixed(det.defense, SLOTS_PER_ROW))
      // 펫은 우측 상단 1칸만 자동 채움. 추가 펫은 사용자가 직접 입력.
      const petArr = makeEmptyPetRow()
      if (det.pet && !det.pet.empty) {
        petArr[0] = slotFromDetection(det.pet)
      }
      setPetSlots(petArr)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '이미지 분석 실패')
    } finally {
      setAnalyzing(false)
    }
  }

  const updateSlot = (
    setter: (updater: (prev: EditableSlot[]) => EditableSlot[]) => void,
    index: number,
    name: string,
  ) => {
    setter((prev) =>
      prev.map((s, i) => (i === index ? { ...s, name } : s)),
    )
  }

  /** 해당 슬롯의 입력 이름만 비움 (자동 인식 결과·후보는 유지하여 다시 선택 가능). */
  const clearSlotName = (
    setter: (updater: (prev: EditableSlot[]) => EditableSlot[]) => void,
    index: number,
  ) => {
    setter((prev) =>
      prev.map((s, i) => (i === index ? { ...s, name: '' } : s)),
    )
  }

  const submit = async () => {
    if (!sessionToken) {
      setErr('세션이 없습니다. 다시 로그인하세요.')
      return
    }
    setErr(null)
    setMsg(null)

    const attack = packFilled(attackSlots)
    const defense = packFilled(defenseSlots)
    const pet = nonEmptyTrimmed(petSlots.map((s) => s.name)).join(' / ')
    const equipment = joinLoadoutSlots(equipment1, equipment2, equipment3)
    const formation = joinLoadoutSlots(formation1, formation2, formation3)

    if (
      attack.length !== FILLED_SLOTS_REQUIRED ||
      defense.length !== FILLED_SLOTS_REQUIRED
    ) {
      setErr(
        `공격 ${FILLED_SLOTS_REQUIRED}명, 방어 ${FILLED_SLOTS_REQUIRED}명을 모두 채워야 등록할 수 있습니다. ` +
          `(현재 공격 ${attack.length}명 / 방어 ${defense.length}명) 비어있는 칸은 그대로 두고, ` +
          `5칸 중 캐릭터가 있는 칸만 영웅 이름을 입력하세요.`,
      )
      return
    }

    const ok = window.confirm(
      `${outcome === 'win' ? '승리' : '패배'} 기록을 등록하시겠습니까?\n` +
        `공격: ${attack.join(' / ')}\n방어: ${defense.join(' / ')}\n펫: ${pet || '(없음)'}`,
    )
    if (!ok) return

    setBusy(true)
    try {
      const { error } = await supabase.rpc('app_find_or_create_matchup_and_vote', {
        p_session_token: sessionToken,
        p_defense1: defense[0],
        p_defense2: defense[1],
        p_defense3: defense[2],
        p_attack1: attack[0],
        p_attack2: attack[1],
        p_attack3: attack[2],
        p_pet: pet,
        p_outcome: outcome,
        p_equipment: equipment,
        p_formation: formation,
      })
      if (error) {
        setErr(error.message)
        return
      }
      setMsg(
        `${outcome === 'win' ? '승리' : '패배'} 기록이 등록되었습니다. 같은 조합이 없으면 새 공략으로 등록되고 즉시 반영됩니다.`,
      )
      setImageFile(null)
      setDetection(null)
      setAttackSlots(makeEmptyTeam())
      setDefenseSlots(makeEmptyTeam())
      setPetSlots(makeEmptyPetRow())
      setEquipment1('')
      setEquipment2('')
      setEquipment3('')
      setFormation1('')
      setFormation2('')
      setFormation3('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      onRegistered?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setBusy(false)
    }
  }

  const heroOptionList = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const o of heroOptions) {
      const v = o.trim()
      if (!v) continue
      const k = v.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(v)
    }
    return out
  }, [heroOptions])

  const iconCoverage = useMemo(() => {
    const fps = fingerprints ?? []
    const total = fps.length
    const withIcon = fps.filter((f) => f.usedIcon).length
    return { total, withIcon }
  }, [fingerprints])

  /* ── 캘리브레이션: 포인터 → 비율 좌표 변환 ── */
  const ratioFromPointer = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const frame = calibFrameRef.current
      if (!frame) return null
      const rect = frame.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return {
        x: clamp01((clientX - rect.left) / rect.width),
        y: clamp01((clientY - rect.top) / rect.height),
      }
    },
    [],
  )

  const onCalibPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!calibMode) return
      const target = e.target as HTMLElement
      const role = target.dataset.role
      const r = ratioFromPointer(e.clientX, e.clientY)
      if (!r) return

      if (role === 'calib-body') {
        const id = target.dataset.id
        if (!id) return
        const box = calibBoxes.find((b) => b.id === id)
        if (!box) return
        setSelectedCalibId(id)
        calibDragRef.current = {
          kind: 'move',
          id,
          baseX: box.x,
          baseY: box.y,
          pointerX: r.x,
          pointerY: r.y,
        }
        e.currentTarget.setPointerCapture(e.pointerId)
        e.preventDefault()
        return
      }

      if (role === 'calib-handle') {
        const id = target.dataset.id
        if (!id) return
        const box = calibBoxes.find((b) => b.id === id)
        if (!box) return
        setSelectedCalibId(id)
        calibDragRef.current = {
          kind: 'resize',
          id,
          baseX: box.x,
          baseY: box.y,
          baseW: box.w,
          baseH: box.h,
          pointerX: r.x,
          pointerY: r.y,
        }
        e.currentTarget.setPointerCapture(e.pointerId)
        e.preventDefault()
        return
      }

      // 빈 영역 → 새 박스 생성
      const id = `calib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const newBox: CalibBox = {
        id,
        kind: pickNextKind(calibBoxes),
        x: r.x,
        y: r.y,
        w: CALIB_MIN_SIZE,
        h: CALIB_MIN_SIZE,
      }
      setCalibBoxes((prev) => [...prev, newBox])
      setSelectedCalibId(id)
      calibDragRef.current = {
        kind: 'create',
        id,
        startX: r.x,
        startY: r.y,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
    },
    [calibBoxes, calibMode, ratioFromPointer],
  )

  const onCalibPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = calibDragRef.current
      if (!drag) return
      const r = ratioFromPointer(e.clientX, e.clientY)
      if (!r) return
      setCalibBoxes((prev) =>
        prev.map((b) => {
          if (b.id !== drag.id) return b
          if (drag.kind === 'create') {
            const x = Math.min(drag.startX, r.x)
            const y = Math.min(drag.startY, r.y)
            const w = Math.max(CALIB_MIN_SIZE, Math.abs(r.x - drag.startX))
            const h = Math.max(CALIB_MIN_SIZE, Math.abs(r.y - drag.startY))
            return { ...b, x, y, w, h }
          }
          if (drag.kind === 'move') {
            const dx = r.x - drag.pointerX
            const dy = r.y - drag.pointerY
            const x = clamp01(Math.min(1 - b.w, Math.max(0, drag.baseX + dx)))
            const y = clamp01(Math.min(1 - b.h, Math.max(0, drag.baseY + dy)))
            return { ...b, x, y }
          }
          // resize (SE 코너)
          const dx = r.x - drag.pointerX
          const dy = r.y - drag.pointerY
          const w = Math.max(
            CALIB_MIN_SIZE,
            Math.min(1 - drag.baseX, drag.baseW + dx),
          )
          const h = Math.max(
            CALIB_MIN_SIZE,
            Math.min(1 - drag.baseY, drag.baseH + dy),
          )
          return { ...b, w, h }
        }),
      )
    },
    [ratioFromPointer],
  )

  const onCalibPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (calibDragRef.current) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          /* 이미 해제됐을 수 있음 */
        }
        calibDragRef.current = null
      }
    },
    [],
  )

  const setCalibKind = useCallback((id: string, kind: CalibBoxKind) => {
    setCalibBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, kind } : b)))
  }, [])

  const deleteCalibBox = useCallback((id: string) => {
    setCalibBoxes((prev) => prev.filter((b) => b.id !== id))
    setSelectedCalibId((cur) => (cur === id ? null : cur))
  }, [])

  const clearAllCalibBoxes = useCallback(() => {
    if (calibBoxes.length === 0) return
    if (!window.confirm('캘리브레이션 박스를 모두 삭제할까요?')) return
    setCalibBoxes([])
    setSelectedCalibId(null)
  }, [calibBoxes.length])

  const calibSnippet = useMemo(() => buildLayoutSnippet(calibBoxes), [calibBoxes])

  const copyCalibSnippet = useCallback(async () => {
    setCalibCopyMsg(null)
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(calibSnippet)
        setCalibCopyMsg('클립보드에 복사했습니다. imageAnalysis.ts 의 DEFAULT_REPLAY_LAYOUT 에 붙여넣으세요.')
      } else {
        setCalibCopyMsg('이 브라우저에서는 자동 복사가 안 됩니다. 아래 텍스트를 직접 선택해서 복사하세요.')
      }
    } catch {
      setCalibCopyMsg('복사 실패. 아래 텍스트를 직접 선택해서 복사하세요.')
    }
  }, [calibSnippet])

  const calibSelectedBox = useMemo(
    () => calibBoxes.find((b) => b.id === selectedCalibId) ?? null,
    [calibBoxes, selectedCalibId],
  )

  const calibCounts = useMemo(() => {
    const c: Record<CalibBoxKind, number> = { attack: 0, defense: 0, pet: 0 }
    for (const b of calibBoxes) c[b.kind] += 1
    return c
  }, [calibBoxes])

  /**
   * 디버그 오버레이용: 비율 좌표(SlotRect, 0..1) → CSS percent 박스 + 그 안의 매칭 ROI.
   * 공격/방어: 상·하 각 65% 높이 윈도우 2개. 펫: 슬롯 전체 100% 1개.
   */
  const debugBoxes = useMemo(() => {
    type DebugBox = {
      key: string
      kind: 'attack' | 'defense' | 'pet'
      slot: SlotRect
      // 슬롯 안에서의 매칭 영역 (이 슬롯 내부 비율 0..1)
      matchInsides: Array<{ x: number; y: number; w: number; h: number }>
    }
    const layout = DEFAULT_REPLAY_LAYOUT
    const compute = (slot: SlotRect, key: string, kind: DebugBox['kind']): DebugBox => {
      // 비율 슬롯 → 가상 픽셀(1000 기준)로 잡고 slotMatchRects 적용 → 다시 슬롯 기준 비율로 환산
      const fakePx = { x: 0, y: 0, w: slot.w * 1000, h: slot.h * 1000 }
      const role = kind === 'pet' ? 'pet' : 'character'
      const matchInsides = slotMatchRects(
        fakePx,
        role,
        characterWindowPositions,
        characterWindowFrac,
      ).map((sq) => ({
        x: sq.x / fakePx.w,
        y: sq.y / fakePx.h,
        w: sq.w / fakePx.w,
        h: sq.h / fakePx.h,
      }))
      return { key, kind, slot, matchInsides }
    }
    return [
      ...layout.attack.map((s, i) => compute(s, `atk-${i}`, 'attack')),
      ...layout.defense.map((s, i) => compute(s, `def-${i}`, 'defense')),
      compute(layout.pet, 'pet-0', 'pet'),
    ]
  }, [characterWindowPositions, characterWindowFrac])

  const renderSlot = (
    label: string,
    slot: EditableSlot,
    onChange: (v: string) => void,
    fieldId: string,
    onClearSlot: () => void,
  ) => {
    const lowConfidence = !slot.detection.empty && slot.detection.topScore < SCORE_LOW
    const detectedName = slot.detection.topGuess?.displayName ?? ''
    const portraitUrl = (() => {
      const k = portraitKey(slot.name)
      return k ? portraitUrlByKey[k] : undefined
    })()
    return (
      <div className="auto-slot" key={fieldId}>
        <div className="auto-slot-head">
          <span className="auto-slot-label">{label}</span>
          {slot.detection.empty ? (
            <span className="auto-slot-hint">빈 슬롯</span>
          ) : (
            <span
              className={
                lowConfidence
                  ? 'auto-slot-hint auto-slot-hint--warn'
                  : 'auto-slot-hint'
              }
              title={`자동 인식 점수 ${(slot.detection.topScore * 100).toFixed(0)}%`}
            >
              자동: {detectedName || '?'}
              {detectedName && ` (${(slot.detection.topScore * 100).toFixed(0)}%)`}
            </span>
          )}
        </div>
        <div className="auto-slot-body">
          <div className="auto-slot-portrait">
            {portraitUrl ? (
              <img src={portraitUrl} alt={slot.name} />
            ) : (
              <span>{slot.name ? slot.name.slice(0, 4) : '—'}</span>
            )}
          </div>
          <AutocompleteField
            id={fieldId}
            label=""
            value={slot.name}
            onChange={onChange}
            options={heroOptionList}
            placeholder="영웅 이름 (비우면 빈 슬롯)"
            maxSuggestions={6}
          />
        </div>
        {slot.detection.candidates.length > 1 && (
          <div className="auto-slot-candidates">
            {slot.detection.candidates.slice(0, 4).map((c) => (
              <button
                key={c.hero.heroKey}
                type="button"
                className={
                  c.hero.displayName === slot.name
                    ? 'auto-cand auto-cand--on'
                    : 'auto-cand'
                }
                onClick={() => onChange(c.hero.displayName)}
              >
                {c.hero.displayName} {(c.score * 100).toFixed(0)}%
              </button>
            ))}
          </div>
        )}
        <div className="auto-slot-footer">
          <button
            type="button"
            className="guide-btn-ghost auto-slot-clear-btn"
            onClick={onClearSlot}
          >
            내용 지우기
          </button>
        </div>
      </div>
    )
  }

  return (
    <section className="guide-card auto-card" aria-labelledby="auto-h">
      <h2 id="auto-h" className="card-title" style={{ marginTop: 0 }}>
        전적 자동 등록 (스샷 1장)
      </h2>
      <p className="guide-notes" style={{ marginTop: 0, marginBottom: '0.7rem' }}>
        리플레이(공격팀 / 방어팀이 한 화면에 나오는) 스크린샷을 업로드하면 공격·방어·펫을 자동
        인식해 등록 모달에 채워줍니다. 인식이 잘못된 칸은 그대로 수정한 뒤 확인하면 됩니다.
        같은 조합이 이미 있으면 그 공략에 승/패가 추가되고, 없으면 새 공략으로 자동 등록됩니다(스킬은 빈값).
      </p>
      {fingerprints && fingerprints.length > 0 ? (
        <p
          className={
            iconCoverage.withIcon === 0
              ? 'form-error'
              : 'register-hint'
          }
          style={{ marginTop: 0, marginBottom: '0.7rem' }}
          role={iconCoverage.withIcon === 0 ? 'alert' : 'status'}
        >
          인게임 아이콘 등록: <strong>{iconCoverage.withIcon}</strong> / {iconCoverage.total}명
          {iconCoverage.withIcon === 0
            ? ' — 아이콘이 한 명도 없어 자동 인식 정확도가 매우 낮습니다. 등록/수정 탭에서 인게임 아이콘을 먼저 등록해 주세요.'
            : iconCoverage.withIcon < iconCoverage.total
              ? ' — 아이콘이 등록되지 않은 캐릭터는 큰 일러스트로 비교하므로 정확도가 낮을 수 있습니다.'
              : ' — 모든 캐릭터에 아이콘이 등록되어 있어 정확도가 높습니다.'}
        </p>
      ) : null}

      <div className="auto-uploader">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFileChange}
          aria-label="리플레이 스크린샷 파일"
        />
        {imagePreviewUrl && (
          <div className="auto-preview">
            <div
              className={
                calibMode
                  ? 'auto-preview-frame auto-preview-frame--calib'
                  : 'auto-preview-frame'
              }
              ref={calibFrameRef}
              onPointerDown={onCalibPointerDown}
              onPointerMove={onCalibPointerMove}
              onPointerUp={onCalibPointerUp}
              onPointerCancel={onCalibPointerUp}
            >
              <img src={imagePreviewUrl} alt="업로드 이미지 미리보기" draggable={false} />
              {showDebugOverlay && !calibMode && (
                <div className="auto-preview-overlay" aria-hidden="true">
                  {debugBoxes.map((b) => (
                    <div
                      key={b.key}
                      className={`auto-debug-box auto-debug-box--${b.kind}`}
                      style={{
                        left: `${b.slot.x * 100}%`,
                        top: `${b.slot.y * 100}%`,
                        width: `${b.slot.w * 100}%`,
                        height: `${b.slot.h * 100}%`,
                      }}
                    >
                      {b.matchInsides.map((m, i) => (
                        <div
                          key={i}
                          className="auto-debug-match"
                          style={{
                            left: `${m.x * 100}%`,
                            top: `${m.y * 100}%`,
                            width: `${m.w * 100}%`,
                            height: `${m.h * 100}%`,
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {calibMode && (
                <div className="auto-preview-overlay">
                  {calibBoxes.map((b) => {
                    const selected = b.id === selectedCalibId
                    return (
                      <div
                        key={b.id}
                        data-role="calib-body"
                        data-id={b.id}
                        className={
                          'auto-calib-box auto-calib-box--' +
                          b.kind +
                          (selected ? ' auto-calib-box--selected' : '')
                        }
                        style={{
                          left: `${b.x * 100}%`,
                          top: `${b.y * 100}%`,
                          width: `${b.w * 100}%`,
                          height: `${b.h * 100}%`,
                        }}
                      >
                        <span className="auto-calib-label">
                          {b.kind === 'attack' ? '공격' : b.kind === 'defense' ? '방어' : '펫'}
                        </span>
                        {selected && (
                          <span
                            data-role="calib-handle"
                            data-id={b.id}
                            className="auto-calib-handle"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="auto-preview-toggles">
              <label className="auto-debug-toggle">
                <input
                  type="checkbox"
                  checked={showDebugOverlay}
                  onChange={(e) => setShowDebugOverlay(e.target.checked)}
                  disabled={calibMode}
                />
                <span>
                  디버그 박스 표시 (빨강=공격 / 파랑=방어 / 초록=펫, 노랑 점선=매칭 영역)
                </span>
              </label>
              <div className="auto-window-frac">
                <label htmlFor="auto-window-frac-input" className="auto-window-frac-label">
                  공격/방어 정사각 윈도우 크기 배율
                  <strong>{Math.round(characterWindowFrac * 100)}%</strong>
                </label>
                <input
                  id="auto-window-frac-input"
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round(characterWindowFrac * 100)}
                  onChange={(e) =>
                    setCharacterWindowFrac(clampWindowFrac(Number(e.target.value) / 100))
                  }
                />
                <label htmlFor="auto-window-positions-input" className="auto-window-frac-label">
                  공격/방어 수직 검색 위치 개수
                  <strong>{characterWindowPositions}개</strong>
                </label>
                <input
                  id="auto-window-positions-input"
                  type="range"
                  min={WINDOW_POSITIONS_MIN}
                  max={WINDOW_POSITIONS_MAX}
                  step={1}
                  value={characterWindowPositions}
                  onChange={(e) =>
                    setCharacterWindowPositions(clampWindowPositions(Number(e.target.value)))
                  }
                />
                <span className="auto-window-frac-hint">
                  변 길이 = <code>min(슬롯폭, 슬롯높이) × 배율</code> 의 정사각 윈도우를 가로 가운데 정렬해
                  세로로 N개 슬라이드. 영웅 아이콘과 종횡비 1:1 매칭 (펫은 항상 슬롯 전체).
                </span>
              </div>
              <label className="auto-debug-toggle">
                <input
                  type="checkbox"
                  checked={calibMode}
                  onChange={(e) => {
                    setCalibMode(e.target.checked)
                    if (e.target.checked) setShowDebugOverlay(false)
                  }}
                />
                <span>
                  <strong>캘리브레이션 모드</strong> — 미리보기 위에서 빈 곳을 드래그하면 새 박스가 생성됩니다.
                </span>
              </label>
            </div>

            {calibMode && (
              <div className="auto-calib-panel">
                <div className="auto-calib-summary">
                  <span>
                    공격 <strong>{calibCounts.attack}</strong> / 방어{' '}
                    <strong>{calibCounts.defense}</strong> / 펫{' '}
                    <strong>{calibCounts.pet}</strong>
                  </span>
                  <button
                    type="button"
                    className="guide-btn-ghost auto-clear-btn"
                    onClick={clearAllCalibBoxes}
                    disabled={calibBoxes.length === 0}
                  >
                    전부 삭제
                  </button>
                </div>
                <p className="register-hint" style={{ margin: '0 0 0.5rem' }}>
                  ① 빈 영역을 드래그 → 새 박스 생성 (자동으로 공격→방어→펫 순으로 종류 지정)<br />
                  ② 박스를 클릭하면 선택, 가운데 드래그 = 이동, 우하단 노란 점 = 크기 조절<br />
                  ③ 종류가 잘못 지정됐다면 아래 버튼으로 변경, 필요 없으면 “이 박스 삭제”
                </p>
                {calibSelectedBox ? (
                  <div className="auto-calib-controls">
                    <span className="auto-calib-controls-label">선택된 박스:</span>
                    {(['attack', 'defense', 'pet'] as CalibBoxKind[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={
                          calibSelectedBox.kind === k
                            ? 'auto-cand auto-cand--on'
                            : 'auto-cand'
                        }
                        onClick={() => setCalibKind(calibSelectedBox.id, k)}
                      >
                        {KIND_LABEL[k]}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="guide-btn-ghost auto-clear-btn"
                      onClick={() => deleteCalibBox(calibSelectedBox.id)}
                    >
                      이 박스 삭제
                    </button>
                    <span className="auto-calib-coords">
                      x={fmtCoord(calibSelectedBox.x)} y={fmtCoord(calibSelectedBox.y)}{' '}
                      w={fmtCoord(calibSelectedBox.w)} h={fmtCoord(calibSelectedBox.h)}
                    </span>
                  </div>
                ) : (
                  <p className="register-hint" style={{ margin: '0 0 0.5rem' }}>
                    선택된 박스 없음 — 박스를 그리거나 클릭해서 선택하세요.
                  </p>
                )}

                <div className="auto-calib-actions">
                  <button
                    type="button"
                    className="guide-btn-sm"
                    onClick={() => void copyCalibSnippet()}
                    disabled={calibBoxes.length === 0}
                  >
                    코드 스니펫 복사
                  </button>
                  {calibCopyMsg && (
                    <span className="auto-calib-copy-msg">{calibCopyMsg}</span>
                  )}
                </div>

                <p className="auto-calib-snippet-heading">수정내역 소스</p>
                <pre className="auto-calib-snippet">{calibSnippet}</pre>
              </div>
            )}
          </div>
        )}
        <div className="guide-match-actions" style={{ padding: '0.4rem 0 0' }}>
          <button
            type="button"
            className="guide-btn-primary-lg"
            onClick={() => void runAnalysis()}
            disabled={!imageFile || analyzing || fingerprintBusy}
          >
            {analyzing
              ? '분석 중…'
              : fingerprintBusy
                ? '캐릭터 정보 준비 중…'
                : '이미지 분석'}
          </button>
        </div>
        {fingerprintErr && (
          <p className="form-error" role="alert">
            {fingerprintErr}
          </p>
        )}
      </div>

      {detection && (
        <div className="auto-result">
          <div className="auto-outcome-row">
            <span className="auto-slot-label">결과</span>
            <div className="auto-outcome-toggle" role="radiogroup" aria-label="승/패 선택">
              <button
                type="button"
                role="radio"
                aria-checked={outcome === 'win'}
                className={
                  outcome === 'win'
                    ? 'auto-outcome-btn auto-outcome-btn--win-on'
                    : 'auto-outcome-btn'
                }
                onClick={() => setOutcome('win')}
              >
                승리
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={outcome === 'lose'}
                className={
                  outcome === 'lose'
                    ? 'auto-outcome-btn auto-outcome-btn--lose-on'
                    : 'auto-outcome-btn'
                }
                onClick={() => setOutcome('lose')}
              >
                패배
              </button>
            </div>
          </div>

          <div className="auto-team-head">
            <h3 className="guide-section-label" style={{ margin: 0 }}>
              공격 (위쪽 5칸 중 3칸만 채움)
            </h3>
          </div>
          <p className="register-hint" style={{ margin: '0 0 0.4rem' }}>
            게임 화면처럼 빈 칸은 그대로 두세요. 캐릭터가 있는 칸의 영웅 이름만 입력/수정하면
            등록 시 자동으로 1·2·3번으로 압축되어 저장됩니다. 잘못 채워졌으면 입력란을 비우거나
            각 칸 하단 오른쪽의 「내용 지우기」를 누르세요.
          </p>
          <div className="auto-slot-grid">
            {attackSlots.map((s, i) =>
              renderSlot(
                `공격${i + 1}`,
                s,
                (v) => updateSlot(setAttackSlots, i, v),
                `auto-atk-${i}`,
                () => clearSlotName(setAttackSlots, i),
              ),
            )}
          </div>

          <div className="auto-team-head">
            <h3 className="guide-section-label" style={{ margin: 0 }}>
              방어 (아래쪽 5칸 중 3칸만 채움)
            </h3>
          </div>
          <div className="auto-slot-grid">
            {defenseSlots.map((s, i) =>
              renderSlot(
                `방어${i + 1}`,
                s,
                (v) => updateSlot(setDefenseSlots, i, v),
                `auto-def-${i}`,
                () => clearSlotName(setDefenseSlots, i),
              ),
            )}
          </div>

          <div className="auto-team-head">
            <h3 className="guide-section-label" style={{ margin: 0 }}>
              펫
            </h3>
          </div>
          <div className="auto-slot-grid">
            {petSlots.map((s, i) =>
              renderSlot(
                `펫${i + 1}`,
                s,
                (v) => updateSlot(setPetSlots, i, v),
                `auto-pet-${i}`,
                () => clearSlotName(setPetSlots, i),
              ),
            )}
          </div>

          <div className="auto-team-head">
            <h3 className="guide-section-label" style={{ margin: 0 }}>
              장비 · 진형 (선택)
            </h3>
          </div>
          <div className="guide-register-grid guide-register-pet-row">
            <LoadoutSelectField
              id="auto-eq1"
              label="장비1"
              value={equipment1}
              onChange={setEquipment1}
              options={EQUIPMENT_OPTIONS}
            />
            <LoadoutSelectField
              id="auto-eq2"
              label="장비2"
              value={equipment2}
              onChange={setEquipment2}
              options={EQUIPMENT_OPTIONS}
            />
            <LoadoutSelectField
              id="auto-eq3"
              label="장비3"
              value={equipment3}
              onChange={setEquipment3}
              options={EQUIPMENT_OPTIONS}
            />
          </div>
          <div className="guide-register-grid guide-register-pet-row">
            <LoadoutSelectField
              id="auto-fm1"
              label="진형1"
              value={formation1}
              onChange={setFormation1}
              options={FORMATION_OPTIONS}
            />
            <LoadoutSelectField
              id="auto-fm2"
              label="진형2"
              value={formation2}
              onChange={setFormation2}
              options={FORMATION_OPTIONS}
            />
            <LoadoutSelectField
              id="auto-fm3"
              label="진형3"
              value={formation3}
              onChange={setFormation3}
              options={FORMATION_OPTIONS}
            />
          </div>

          {err && (
            <p className="form-error" role="alert">
              {err}
            </p>
          )}
          {msg && (
            <p className="register-hint register-hint--success" role="status">
              {msg}
            </p>
          )}

          <div className="guide-match-actions" style={{ padding: '0.6rem 0 0' }}>
            <button
              type="button"
              className="guide-btn-primary-lg"
              onClick={() => void submit()}
              disabled={busy}
            >
              {busy ? '등록 중…' : '확인하고 등록'}
            </button>
          </div>
        </div>
      )}

      {!detection && err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
    </section>
  )
}
