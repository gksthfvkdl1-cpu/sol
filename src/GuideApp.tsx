import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { AutocompleteField } from './AutocompleteField.tsx'
import { getSessionToken } from './authSession.ts'
import type { UserSession } from './authSession.ts'
import type { MatchupRow } from './types/matchup.ts'
import './App.css'
import './guide.css'
import { AdminPortraitPanel } from './AdminPortraitPanel.tsx'
import { BrandLogo } from './BrandLogo.tsx'
import { HeroPortraitStrip } from './HeroPortraitStrip.tsx'
import { supabase } from './supabase/client.ts'

type NavId = 'search' | 'stats' | 'siege' | 'register' | 'rank' | 'admin'

type PendingProfileRow = {
  id: string
  username: string
  display_name: string
  created_at: string
}

type EditRequestRow = {
  id: number
  matchup_id: number
  skill_order: string
  notes: string
  created_at: string
  requester_username: string
  requester_display_name?: string
  defense1: string
  defense2: string
  defense3: string
}

type AttackStatItem = {
  key: string
  defenseLabel: string
  attackLabel: string
  pet: string
  win: number
  lose: number
  games: number
  winRate: number
}

type RankItem = {
  userId: string
  name: string
  count: number
  rank: number
}

type WeekOption = {
  index: number
  value: string
  label: string
}

type SiegePlanRow = {
  id: number
  day_of_week: number
  speed_order: string
  round1: string
  round2: string
  round3: string
  author_name?: string
  author_username?: string
  author_id: string
  created_at?: string
}

const SIEGE_DAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 7, label: '일' },
]

/** 한국 날짜 기준 YYYY-MM-DD */
function formatDateYmdSeoul(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) {
    const s = iso.trim()
    return s.length >= 10 ? s.slice(0, 10) : s
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t))
}

/** 내용 수정 반영 후에는 `수정일자`, 그 외는 `등록일자` (승·패 투표만으로는 바뀌지 않음) */
function matchupDateCaption(m: MatchupRow): string | null {
  const c = m.created_at?.trim()
  const u = m.updated_at?.trim()
  if (!c && !u) return null
  if (!c || !u) {
    return `등록일자 : ${formatDateYmdSeoul(c || u || '')}`
  }
  const ct = new Date(c).getTime()
  const ut = new Date(u).getTime()
  if (ut > ct) {
    return `수정일자 : ${formatDateYmdSeoul(u)}`
  }
  return `등록일자 : ${formatDateYmdSeoul(c)}`
}

function winRatePct(win: number, lose: number): string {
  const t = Number(win) + Number(lose)
  if (t <= 0) return '—'
  return `${Math.round((Number(win) / t) * 100)}%`
}

/** 통계 카드의 "이름 / 이름 / 이름" 라벨을 초상화용 배열로 */
function splitTeamLabel(label: string): string[] {
  return label
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 공격1~3 이름 기준으로 스킬 순서 선택지 (각 영웅 × 1, 2) */
function buildSkillOrderSelectOptions(
  attack1: string,
  attack2: string,
  attack3: string,
): string[] {
  const out: string[] = []
  for (const raw of [attack1, attack2, attack3]) {
    const name = raw.trim()
    if (!name) continue
    out.push(`${name}1`, `${name}2`)
  }
  return out
}

type Props = {
  session: UserSession
  onLogout: () => void
}

function mapRpcToMatchup(r: Record<string, unknown>): MatchupRow {
  return {
    id: Number(r.id),
    matchup_group_id: String(r.matchup_group_id ?? ''),
    defense1: String(r.defense1 ?? ''),
    defense2: String(r.defense2 ?? ''),
    defense3: String(r.defense3 ?? ''),
    attack1: String(r.attack1 ?? ''),
    attack2: String(r.attack2 ?? ''),
    attack3: String(r.attack3 ?? ''),
    pet: String(r.pet ?? ''),
    skill_order: String(r.skill_order ?? ''),
    notes: String(r.notes ?? ''),
    win: Number(r.win ?? 0),
    lose: Number(r.lose ?? 0),
    author_id: String(r.author_id ?? ''),
    author_name: r.author_name != null ? String(r.author_name) : undefined,
    author_username:
      r.author_username != null ? String(r.author_username) : undefined,
    created_at:
      r.created_at != null ? String(r.created_at) : undefined,
    updated_at:
      r.updated_at != null ? String(r.updated_at) : undefined,
  }
}

type MatchupGroup = {
  groupId: string
  /** 카드 헤더 표시용(같은 그룹 내 가장 먼저 등록된 행) */
  header: MatchupRow
  strategies: MatchupRow[]
}

function groupMatchups(rows: MatchupRow[]): MatchupGroup[] {
  const map = new Map<string, MatchupRow[]>()
  for (const r of rows) {
    const gid =
      r.matchup_group_id.trim() || `fallback-${r.id}`
    const list = map.get(gid)
    if (list) list.push(r)
    else map.set(gid, [r])
  }
  const out: MatchupGroup[] = []
  for (const [groupId, strategies] of map) {
    strategies.sort((a, b) => a.id - b.id)
    const header = strategies[0]
    out.push({ groupId, header, strategies })
  }
  out.sort((a, b) => {
    const ta = a.strategies.reduce((s, x) => s + x.win + x.lose, 0)
    const tb = b.strategies.reduce((s, x) => s + x.win + x.lose, 0)
    if (tb !== ta) return tb - ta
    return a.header.id - b.header.id
  })
  return out
}

function buildContributorRanking(rows: MatchupRow[]): RankItem[] {
  const byUser = new Map<string, { name: string; count: number }>()
  for (const r of rows) {
    const userId = r.author_id
    const name =
      (r.author_name && r.author_name.trim()) ||
      (r.author_username && r.author_username.trim()) ||
      `user-${userId.slice(0, 8)}`
    const prev = byUser.get(userId)
    if (prev) {
      prev.count += 1
      if (!prev.name || prev.name.startsWith('user-')) prev.name = name
    } else {
      byUser.set(userId, { name, count: 1 })
    }
  }
  const sorted = Array.from(byUser.entries())
    .map(([userId, v]) => ({ userId, name: v.name, count: v.count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.name.localeCompare(b.name, 'ko')
    })

  const out: RankItem[] = []
  let prevCount: number | null = null
  let prevRank = 0
  for (let i = 0; i < sorted.length; i += 1) {
    const it = sorted[i]
    const rank = prevCount === it.count ? prevRank : i + 1
    out.push({ ...it, rank })
    prevCount = it.count
    prevRank = rank
  }
  return out
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDotDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${y}.${m}.${d}`
}

function startOfYearWeek(d: Date): Date {
  const jan1 = new Date(d.getFullYear(), 0, 1)
  jan1.setHours(0, 0, 0, 0)
  const msPerDay = 24 * 60 * 60 * 1000
  const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / msPerDay) + 1
  const weekOffsetDays = Math.floor((dayOfYear - 1) / 7) * 7
  return addDays(jan1, weekOffsetDays)
}

function buildWeekOptionsOfYear(year: number): WeekOption[] {
  const jan1 = new Date(year, 0, 1)
  jan1.setHours(0, 0, 0, 0)
  const dec31 = new Date(year, 11, 31)
  dec31.setHours(0, 0, 0, 0)
  const out: WeekOption[] = []
  let index = 1
  let start = jan1
  while (start.getTime() <= dec31.getTime()) {
    const rawEnd = addDays(start, 6)
    const end =
      rawEnd.getTime() <= dec31.getTime() ? rawEnd : new Date(dec31.getTime())
    const startIso = toIsoDate(start)
    const endIso = toIsoDate(end)
    out.push({
      index,
      value: startIso,
      label: `${index}주차 (${formatDotDate(startIso)} ~ ${formatDotDate(endIso)})`,
    })
    index += 1
    start = addDays(start, 7)
  }
  return out
}

export function GuideApp({ session, onLogout }: Props) {
  const isAdmin = session.isAdmin
  const [nav, setNav] = useState<NavId>('search')
  const [heroOptions, setHeroOptions] = useState<string[]>([])
  const [portraitUrlByKey, setPortraitUrlByKey] = useState<Record<string, string>>(
    {},
  )

  const [d1, setD1] = useState('')
  const [d2, setD2] = useState('')
  const [d3, setD3] = useState('')
  const [excludeInput, setExcludeInput] = useState('')
  const [excludeList, setExcludeList] = useState<string[]>([])

  const [results, setResults] = useState<MatchupRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [attackTop10, setAttackTop10] = useState<AttackStatItem[]>([])
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsErr, setStatsErr] = useState<string | null>(null)
  const [rankRows, setRankRows] = useState<RankItem[]>([])
  const [myRank, setMyRank] = useState<number | null>(null)
  const [rankLoading, setRankLoading] = useState(false)
  const [rankErr, setRankErr] = useState<string | null>(null)
  const currentYear = new Date().getFullYear()
  const weekOptions = useMemo(() => buildWeekOptionsOfYear(currentYear), [currentYear])
  const currentWeekStart = useMemo(
    () => toIsoDate(startOfYearWeek(new Date())),
    [],
  )
  const [statsWeekStart, setStatsWeekStart] = useState<string>(
    () => {
      if (weekOptions.some((w) => w.value === currentWeekStart)) return currentWeekStart
      return weekOptions[0]?.value ?? toIsoDate(startOfYearWeek(new Date()))
    },
  )
  const [siegeDay, setSiegeDay] = useState<number>(1)
  const [siegeRows, setSiegeRows] = useState<SiegePlanRow[]>([])
  const [siegeLoading, setSiegeLoading] = useState(false)
  const [siegeErr, setSiegeErr] = useState<string | null>(null)
  const [siegeRegisterOpen, setSiegeRegisterOpen] = useState(false)
  const [siegeReg, setSiegeReg] = useState({
    day_of_week: 1,
    speed_order: '',
    round1: '',
    round2: '',
    round3: '',
  })
  const [siegeRegBusy, setSiegeRegBusy] = useState(false)
  const [siegeRegErr, setSiegeRegErr] = useState<string | null>(null)
  const [siegeRegMsg, setSiegeRegMsg] = useState<string | null>(null)

  const [reg, setReg] = useState({
    defense1: '',
    defense2: '',
    defense3: '',
    attack1: '',
    attack2: '',
    attack3: '',
    pet1: '',
    pet2: '',
    pet3: '',
    skillSlot1: '',
    skillSlot2: '',
    skillSlot3: '',
    notes: '',
  })
  const [regMsg, setRegMsg] = useState<string | null>(null)
  const [regErr, setRegErr] = useState<string | null>(null)
  const [regBusy, setRegBusy] = useState(false)
  const [profileName, setProfileName] = useState(session.displayName)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editSkillOrder, setEditSkillOrder] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editErr, setEditErr] = useState<string | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null)
  const [adminMsg, setAdminMsg] = useState<string | null>(null)

  const [signupRequests, setSignupRequests] = useState<PendingProfileRow[]>([])
  const [editRequests, setEditRequests] = useState<EditRequestRow[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminErr, setAdminErr] = useState<string | null>(null)

  const loadHeroes = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('hero_names')
      if (error || !data) {
        setHeroOptions([])
        return
      }
      setHeroOptions(Array.isArray(data) ? (data as string[]) : [])
    } catch {
      setHeroOptions([])
    }
  }, [])

  const loadPortraitMap = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('hero_portraits_map')
      if (error || !data) {
        setPortraitUrlByKey({})
        return
      }
      const next: Record<string, string> = {}
      for (const row of data as { hero_key: string; image_url: string }[]) {
        next[String(row.hero_key)] = String(row.image_url)
      }
      setPortraitUrlByKey(next)
    } catch {
      setPortraitUrlByKey({})
    }
  }, [])

  useEffect(() => {
    void loadHeroes()
  }, [loadHeroes])

  useEffect(() => {
    void loadPortraitMap()
  }, [loadPortraitMap])

  useEffect(() => {
    setProfileName(session.displayName)
  }, [session.displayName])

  useEffect(() => {
    // 로그인/세션 복원 직후 첫 진입 탭은 항상 공략 검색으로 고정
    setNav('search')
  }, [session.userId])

  const groupedResults = useMemo(() => groupMatchups(results), [results])
  const rankRowsForView = useMemo(() => {
    const top20 = rankRows.slice(0, 20)
    const me = rankRows.find((r) => r.userId === session.userId)
    if (!me) return top20
    if (top20.some((r) => r.userId === me.userId)) return top20
    return [...top20, me]
  }, [rankRows, session.userId])

  const selectedWeekLabel = useMemo(
    () =>
      weekOptions.find((w) => w.value === statsWeekStart)?.label ??
      `선택 주차 (${statsWeekStart})`,
    [statsWeekStart, weekOptions],
  )

  const regSkillOptions = useMemo(
    () =>
      buildSkillOrderSelectOptions(
        reg.attack1,
        reg.attack2,
        reg.attack3,
      ),
    [reg.attack1, reg.attack2, reg.attack3],
  )

  useEffect(() => {
    const allowed = new Set(regSkillOptions)
    setReg((prev) => {
      let changed = false
      const next = { ...prev }
      for (const key of ['skillSlot1', 'skillSlot2', 'skillSlot3'] as const) {
        const v = next[key]
        if (v && !allowed.has(v)) {
          next[key] = ''
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [regSkillOptions])

  const addExclude = () => {
    const t = excludeInput.trim()
    if (!t || excludeList.includes(t)) return
    setExcludeList((p) => [...p, t])
    setExcludeInput('')
  }

  const runSearch = async () => {
    setSearchError(null)
    setSearchLoading(true)
    setSearched(true)
    try {
      const { data, error } = await supabase.rpc('search_matchups', {
        p_d1: d1.trim() || null,
        p_d2: d2.trim() || null,
        p_d3: d3.trim() || null,
        p_exclude: excludeList.length ? excludeList : [],
      })
      if (error) {
        setResults([])
        setSearchError(error.message)
        return
      }
      const rows = (data ?? []) as Record<string, unknown>[]
      setResults(rows.map((r) => mapRpcToMatchup(r)))
    } catch (e) {
      setResults([])
      setSearchError(e instanceof Error ? e.message : '검색 실패')
    } finally {
      setSearchLoading(false)
    }
  }

  const loadStatsAndRank = useCallback(async () => {
    setStatsErr(null)
    setRankErr(null)
    setStatsLoading(true)
    setRankLoading(true)
    try {
      const [statsRes, rankRes] = await Promise.all([
        supabase.rpc('attack_stats_weekly', { p_week_start: statsWeekStart }),
        supabase.rpc('search_matchups', {
          p_d1: null,
          p_d2: null,
          p_d3: null,
          p_exclude: [],
        }),
      ])

      if (statsRes.error) {
        setAttackTop10([])
        setStatsErr(statsRes.error.message)
      } else {
        const statsRows = (statsRes.data ?? []) as Record<string, unknown>[]
        const mapped: AttackStatItem[] = statsRows
          .map((r) => {
            const win = Number(r.win ?? 0)
            const lose = Number(r.lose ?? 0)
            const games = win + lose
            return {
              key: String(r.group_key ?? ''),
              defenseLabel: `${String(r.defense1 ?? '')} / ${String(r.defense2 ?? '')} / ${String(r.defense3 ?? '')}`,
              attackLabel: `${String(r.attack1 ?? '')} / ${String(r.attack2 ?? '')} / ${String(r.attack3 ?? '')}`,
              pet: String(r.pet ?? ''),
              win,
              lose,
              games,
              winRate: games > 0 ? win / games : 0,
            }
          })
          .sort((a, b) => {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate
            if (b.games !== a.games) return b.games - a.games
            return b.win - a.win
          })
          .slice(0, 10)
        setAttackTop10(mapped)
      }

      if (rankRes.error) {
        setRankRows([])
        setMyRank(null)
        setRankErr(rankRes.error.message)
        return
      }
      const rows = ((rankRes.data ?? []) as Record<string, unknown>[]).map((r) =>
        mapRpcToMatchup(r),
      )
      const ranking = buildContributorRanking(rows)
      setRankRows(ranking)
      const mine = ranking.find((r) => r.userId === session.userId)
      setMyRank(mine ? mine.rank : null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '통계 조회 실패'
      setAttackTop10([])
      setRankRows([])
      setMyRank(null)
      setStatsErr(msg)
      setRankErr(msg)
    } finally {
      setStatsLoading(false)
      setRankLoading(false)
    }
  }, [session.userId, statsWeekStart])

  const loadSiegePlans = useCallback(async () => {
    setSiegeErr(null)
    setSiegeLoading(true)
    try {
      const { data, error } = await supabase.rpc('siege_plans_by_day', {
        p_day: siegeDay,
      })
      if (error) {
        setSiegeRows([])
        setSiegeErr(error.message)
        return
      }
      const rows = (data ?? []) as Record<string, unknown>[]
      setSiegeRows(
        rows.map((r) => ({
          id: Number(r.id ?? 0),
          day_of_week: Number(r.day_of_week ?? siegeDay),
          speed_order: String(r.speed_order ?? ''),
          round1: String(r.round1 ?? ''),
          round2: String(r.round2 ?? ''),
          round3: String(r.round3 ?? ''),
          author_name:
            r.author_name != null ? String(r.author_name) : undefined,
          author_username:
            r.author_username != null ? String(r.author_username) : undefined,
          author_id: String(r.author_id ?? ''),
          created_at:
            r.created_at != null ? String(r.created_at) : undefined,
        })),
      )
    } catch (err) {
      setSiegeRows([])
      setSiegeErr(err instanceof Error ? err.message : '공성전 조회 실패')
    } finally {
      setSiegeLoading(false)
    }
  }, [siegeDay])

  const onSiegeRegister = async (e: FormEvent) => {
    e.preventDefault()
    setSiegeRegErr(null)
    setSiegeRegMsg(null)
    const speed = siegeReg.speed_order.trim()
    const r1 = siegeReg.round1.trim()
    const r2 = siegeReg.round2.trim()
    const r3 = siegeReg.round3.trim()
    if (!speed || !r1 || !r2 || !r3) {
      setSiegeRegErr('속공 순서, 1라운드, 2라운드, 3라운드를 모두 입력하세요.')
      return
    }
    const tok = getSessionToken()
    if (!tok) {
      setSiegeRegErr('세션이 없습니다.')
      return
    }
    setSiegeRegBusy(true)
    try {
      const { error } = await supabase.rpc('app_insert_siege_plan', {
        p_session_token: tok,
        p_day: siegeReg.day_of_week,
        p_speed_order: speed,
        p_round1: r1,
        p_round2: r2,
        p_round3: r3,
      })
      if (error) {
        setSiegeRegErr(error.message)
        return
      }
      setSiegeReg({
        day_of_week: siegeReg.day_of_week,
        speed_order: '',
        round1: '',
        round2: '',
        round3: '',
      })
      setSiegeRegMsg('공성전 공략이 등록되었습니다.')
      setSiegeRegisterOpen(false)
      if (siegeReg.day_of_week !== siegeDay) {
        setSiegeDay(siegeReg.day_of_week)
      } else {
        void loadSiegePlans()
      }
    } catch (err) {
      setSiegeRegErr(err instanceof Error ? err.message : '공성전 등록 실패')
    } finally {
      setSiegeRegBusy(false)
    }
  }

  const onVote = async (id: number, outcome: 'win' | 'lose') => {
    const ok =
      outcome === 'win'
        ? window.confirm('정말 승리 하셨습니까?')
        : window.confirm('정말 패배 하셨습니까? 공부하세요')
    if (!ok) return
    try {
      const { data, error } = await supabase.rpc('vote_matchup', {
        p_id: id,
        p_outcome: outcome,
      })
      if (error || !data) return
      const row = data as Record<string, unknown>
      setResults((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                win: Number(row.win ?? r.win),
                lose: Number(row.lose ?? r.lose),
              }
            : r,
        ),
      )
      void loadHeroes()
      if (nav === 'stats' || nav === 'rank') {
        void loadStatsAndRank()
      }
    } catch {
      /* ignore */
    }
  }

  const startEdit = (m: MatchupRow) => {
    setEditingId(m.id)
    setEditSkillOrder(m.skill_order || '')
    setEditNotes(m.notes || '')
    setEditErr(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditSkillOrder('')
    setEditNotes('')
    setEditErr(null)
  }

  const saveEdit = async (id: number) => {
    setEditErr(null)
    setEditBusy(true)
    try {
      const tok = getSessionToken()
      if (!tok) {
        setEditErr('세션이 없습니다. 다시 로그인하세요.')
        return
      }
      const { error } = await supabase.rpc('app_submit_edit_request', {
        p_session_token: tok,
        p_matchup_id: id,
        p_skill_order: editSkillOrder.trim(),
        p_notes: editNotes.trim(),
      })
      if (error) {
        setEditErr(error.message)
        return
      }
      cancelEdit()
      window.alert('수정 신청이 접수되었습니다. 관리자 승인 후 반영됩니다.')
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : '수정 실패')
    } finally {
      setEditBusy(false)
    }
  }

  const loadAdminRequests = useCallback(async () => {
    if (!isAdmin) return
    setAdminErr(null)
    setAdminLoading(true)
    try {
      const tok = getSessionToken()
      if (!tok) {
        setAdminErr('세션이 없습니다.')
        setSignupRequests([])
        setEditRequests([])
        return
      }
      const { data, error } = await supabase.rpc('app_admin_panel_data', {
        p_session_token: tok,
      })
      if (error) {
        setAdminErr(error.message)
        setSignupRequests([])
        setEditRequests([])
        return
      }
      const j = data as {
        pending_signups?: PendingProfileRow[]
        edit_requests?: EditRequestRow[]
      }
      setSignupRequests(j.pending_signups ?? [])
      setEditRequests(j.edit_requests ?? [])
    } catch (err) {
      setAdminErr(err instanceof Error ? err.message : '관리자 목록 조회 실패')
    } finally {
      setAdminLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    if (nav === 'admin' && isAdmin) {
      void loadAdminRequests()
    }
  }, [isAdmin, loadAdminRequests, nav])

  useEffect(() => {
    if (nav === 'stats' || nav === 'rank') {
      void loadStatsAndRank()
    }
  }, [loadStatsAndRank, nav])

  useEffect(() => {
    if (nav === 'siege') {
      void loadSiegePlans()
    }
  }, [loadSiegePlans, nav])

  useEffect(() => {
    if (nav === 'stats') {
      setStatsWeekStart(currentWeekStart)
    }
  }, [currentWeekStart, nav])

  useEffect(() => {
    setD1('')
    setD2('')
    setD3('')
    setExcludeInput('')
    setExcludeList([])
    setSearchError(null)
    setSearched(false)
    setResults([])
    cancelEdit()
    setDeleteBusyId(null)

    setReg({
      defense1: '',
      defense2: '',
      defense3: '',
      attack1: '',
      attack2: '',
      attack3: '',
      pet1: '',
      pet2: '',
      pet3: '',
      skillSlot1: '',
      skillSlot2: '',
      skillSlot3: '',
      notes: '',
    })
    setRegErr(null)
    setRegMsg(null)
    setRegBusy(false)
    setAdminMsg(null)
    setSiegeErr(null)
    setSiegeRegisterOpen(false)
    setSiegeRegErr(null)
    setSiegeRegMsg(null)
  }, [nav])

  const processSignupRequest = async (userId: string, action: 'approve' | 'reject') => {
    setAdminErr(null)
    setAdminMsg(null)
    try {
      const tok = getSessionToken()
      if (!tok) {
        setAdminErr('세션이 없습니다.')
        return
      }
      const { error } = await supabase.rpc('admin_set_profile_approved', {
        p_session_token: tok,
        p_user_id: userId,
        p_approved: action === 'approve',
      })
      if (error) {
        setAdminErr(error.message)
        return
      }
      setAdminMsg(action === 'approve' ? '가입 신청을 허용했습니다.' : '가입 신청을 거절했습니다.')
      await loadAdminRequests()
    } catch (err) {
      setAdminErr(err instanceof Error ? err.message : '처리 실패')
    }
  }

  const processEditRequest = async (id: number, action: 'approve' | 'reject') => {
    setAdminErr(null)
    setAdminMsg(null)
    try {
      const fn =
        action === 'approve' ? 'approve_edit_request' : 'reject_edit_request'
      const tok = getSessionToken()
      if (!tok) {
        setAdminErr('세션이 없습니다.')
        return
      }
      const { error } = await supabase.rpc(fn, {
        p_session_token: tok,
        p_req_id: id,
      })
      if (error) {
        setAdminErr(error.message)
        return
      }
      setAdminMsg(
        action === 'approve' ? '수정 신청을 승인해 반영했습니다.' : '수정 신청을 거절했습니다.',
      )
      if (searched) {
        void runSearch()
      }
      await loadAdminRequests()
    } catch (err) {
      setAdminErr(err instanceof Error ? err.message : '처리 실패')
    }
  }

  const deleteMatchup = async (id: number) => {
    const ok = window.confirm('정말 삭제하시겠습니까?')
    if (!ok) return
    setDeleteBusyId(id)
    try {
      const tok = getSessionToken()
      if (!tok) {
        setSearchError('세션이 없습니다.')
        return
      }
      const { error } = await supabase.rpc('app_delete_matchup', {
        p_session_token: tok,
        p_id: id,
      })
      if (error) {
        setSearchError(error.message)
        return
      }
      setResults((prev) => prev.filter((x) => x.id !== id))
      setAdminMsg('공략을 삭제했습니다.')
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setDeleteBusyId(null)
    }
  }

  const onRegister = async (e: FormEvent) => {
    e.preventDefault()
    const ok = window.confirm('공략을 등록하시겠습니까?')
    if (!ok) return
    setRegErr(null)
    setRegMsg(null)

    const d1 = reg.defense1.trim()
    const d2 = reg.defense2.trim()
    const d3 = reg.defense3.trim()
    const a1 = reg.attack1.trim()
    const a2 = reg.attack2.trim()
    const a3 = reg.attack3.trim()
    const pets = [reg.pet1.trim(), reg.pet2.trim(), reg.pet3.trim()].filter(Boolean)
    if (!d1 || !d2 || !d3 || !a1 || !a2 || !a3) {
      setRegErr('방어1·방어2·방어3, 공격1·공격2·공격3을 모두 입력하세요.')
      return
    }
    if (!reg.skillSlot1 || !reg.skillSlot2 || !reg.skillSlot3) {
      setRegErr('스킬 순서 3칸을 모두 선택하세요.')
      return
    }
    const allowed = new Set(
      buildSkillOrderSelectOptions(reg.attack1, reg.attack2, reg.attack3),
    )
    if (
      !allowed.has(reg.skillSlot1) ||
      !allowed.has(reg.skillSlot2) ||
      !allowed.has(reg.skillSlot3)
    ) {
      setRegErr('스킬 순서 선택이 올바르지 않습니다. 공격 영웅을 확인하세요.')
      return
    }

    const skillOrderJoined = [
      reg.skillSlot1,
      reg.skillSlot2,
      reg.skillSlot3,
    ].join(' → ')

    setRegBusy(true)
    try {
      const tok = getSessionToken()
      if (!tok) {
        setRegErr('세션이 없습니다.')
        return
      }
      const { error } = await supabase.rpc('app_insert_matchup', {
        p_session_token: tok,
        p_defense1: d1,
        p_defense2: d2,
        p_defense3: d3,
        p_attack1: a1,
        p_attack2: a2,
        p_attack3: a3,
        p_pet: pets.join(' / '),
        p_skill_order: skillOrderJoined,
        p_notes: reg.notes.trim(),
      })
      if (error) {
        setRegErr(error.message)
        return
      }
      setReg({
        defense1: '',
        defense2: '',
        defense3: '',
        attack1: '',
        attack2: '',
        attack3: '',
        pet1: '',
        pet2: '',
        pet3: '',
        skillSlot1: '',
        skillSlot2: '',
        skillSlot3: '',
        notes: '',
      })
      setRegMsg('등록되었습니다.')
      void loadHeroes()
    } catch (err) {
      setRegErr(err instanceof Error ? err.message : '등록 실패')
    } finally {
      setRegBusy(false)
    }
  }

  const navBtn = (id: NavId, label: string) => (
    <button
      key={id}
      type="button"
      className={nav === id ? 'guide-nav--active' : ''}
      onClick={() => setNav(id)}
    >
      {label}
    </button>
  )

  return (
    <div className="guide-shell">
      <nav className="guide-nav" aria-label="메인 메뉴">
        {navBtn('search', '공략 검색')}
        {navBtn('stats', '공격 통계')}
        {navBtn('siege', '공성전')}
        {navBtn('register', '공략 등록')}
        {navBtn('rank', '기여 랭킹')}
        {navBtn('admin', '등록/수정')}
      </nav>

      <div className="guide-inner">
        <div className="guide-top-actions">
          <button type="button" className="button-secondary" onClick={onLogout}>
            로그아웃
          </button>
        </div>

        <header className="guide-brand">
          <BrandLogo />
          <h1 className="guide-brand-title">길드전 정답지</h1>
          <p className="guide-user">
            👤 <strong>{profileName}</strong> 님
          </p>
        </header>

        {nav === 'siege' && (
          <section className="guide-card siege-card" aria-labelledby="siege-h">
            <div className="siege-top">
              <h2 id="siege-h" className="card-title" style={{ margin: 0 }}>
                공성전 작전 보드
              </h2>
              <button
                type="button"
                className="guide-btn-primary-lg siege-register-toggle"
                onClick={() => {
                  setSiegeRegisterOpen((prev) => !prev)
                  setSiegeRegErr(null)
                  setSiegeRegMsg(null)
                }}
              >
                {siegeRegisterOpen ? '등록 닫기' : '공략 등록'}
              </button>
            </div>

            <div className="siege-day-tabs" role="tablist" aria-label="공성전 요일 선택">
              {SIEGE_DAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  role="tab"
                  aria-selected={siegeDay === d.value}
                  className={
                    siegeDay === d.value ? 'siege-day-tab siege-day-tab--on' : 'siege-day-tab'
                  }
                  onClick={() => setSiegeDay(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {siegeRegisterOpen && (
              <form className="siege-register-form" onSubmit={onSiegeRegister}>
                <div className="siege-register-grid">
                  <div className="field">
                    <label htmlFor="siege-day-reg">등록 요일</label>
                    <select
                      id="siege-day-reg"
                      className="field-input"
                      value={siegeReg.day_of_week}
                      onChange={(e) =>
                        setSiegeReg((p) => ({
                          ...p,
                          day_of_week: Number(e.target.value),
                        }))
                      }
                    >
                      {SIEGE_DAYS.map((d) => (
                        <option key={`reg-${d.value}`} value={d.value}>
                          {d.label}요일
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="siege-speed">속공 순서</label>
                    <input
                      id="siege-speed"
                      className="field-input"
                      value={siegeReg.speed_order}
                      onChange={(e) =>
                        setSiegeReg((p) => ({ ...p, speed_order: e.target.value }))
                      }
                      placeholder="예: 비스킷 - 태오 - 레이첼 - 라이언 - 타카"
                    />
                  </div>
                </div>
                <div className="siege-register-grid siege-register-grid--rounds">
                  <div className="field">
                    <label htmlFor="siege-r1">1라운드</label>
                    <textarea
                      id="siege-r1"
                      className="guide-textarea"
                      value={siegeReg.round1}
                      onChange={(e) =>
                        setSiegeReg((p) => ({ ...p, round1: e.target.value }))
                      }
                      placeholder="1라운드 공략 입력"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="siege-r2">2라운드</label>
                    <textarea
                      id="siege-r2"
                      className="guide-textarea"
                      value={siegeReg.round2}
                      onChange={(e) =>
                        setSiegeReg((p) => ({ ...p, round2: e.target.value }))
                      }
                      placeholder="2라운드 공략 입력"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="siege-r3">3라운드</label>
                    <textarea
                      id="siege-r3"
                      className="guide-textarea"
                      value={siegeReg.round3}
                      onChange={(e) =>
                        setSiegeReg((p) => ({ ...p, round3: e.target.value }))
                      }
                      placeholder="3라운드 공략 입력"
                    />
                  </div>
                </div>
                {siegeRegErr ? (
                  <p className="form-error" role="alert">
                    {siegeRegErr}
                  </p>
                ) : null}
                {siegeRegMsg ? (
                  <p className="register-hint register-hint--success" role="status">
                    {siegeRegMsg}
                  </p>
                ) : null}
                <button type="submit" className="guide-btn-primary-lg" disabled={siegeRegBusy}>
                  {siegeRegBusy ? '등록 중…' : '등록하기'}
                </button>
              </form>
            )}

            {siegeErr ? (
              <p className="form-error" role="alert">
                {siegeErr}
              </p>
            ) : null}

            {siegeLoading ? (
              <p className="guide-placeholder" style={{ marginTop: '0.8rem' }}>
                불러오는 중…
              </p>
            ) : null}

            {!siegeLoading && siegeRows.length === 0 ? (
              <p className="guide-placeholder" style={{ marginTop: '0.8rem' }}>
                선택한 요일의 공성전 공략이 없습니다.
              </p>
            ) : null}

            {siegeRows.length > 0 ? (
              <div className="siege-board-list">
                {siegeRows.map((row) => (
                  <article key={row.id} className="siege-board-item">
                    <p className="siege-speed-order">속공 순서: {row.speed_order}</p>
                    <div className="siege-rounds">
                      <section>
                        <h4>1라운드</h4>
                        <p>{row.round1}</p>
                      </section>
                      <section>
                        <h4>2라운드</h4>
                        <p>{row.round2}</p>
                      </section>
                      <section>
                        <h4>3라운드</h4>
                        <p>{row.round3}</p>
                      </section>
                    </div>
                    <p className="siege-author">
                      작성자:{' '}
                      {row.author_name ||
                        row.author_username ||
                        `user-${row.author_id.slice(0, 8)}`}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        )}

        {nav === 'search' && (
          <>
            <section className="guide-card" aria-label="검색">
              <div className="guide-tabs-row">
                <button type="button" className="guide-tab-big guide-tab-big--on" disabled>
                  🛡️ 방어덱 기준
                </button>
              </div>

              <p className="guide-section-label">
                <span aria-hidden>🛡️</span> 상대 방어덱 영웅
              </p>
              <div className="guide-d3">
                <AutocompleteField
                  id="gd1"
                  label="방어1"
                  value={d1}
                  onChange={setD1}
                  options={heroOptions}
                  placeholder="방어1"
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="gd2"
                  label="방어2"
                  value={d2}
                  onChange={setD2}
                  options={heroOptions}
                  placeholder="방어2"
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="gd3"
                  label="방어3"
                  value={d3}
                  onChange={setD3}
                  options={heroOptions}
                  placeholder="방어3"
                  maxSuggestions={5}
                />
              </div>

              <p className="guide-section-label">
                <span aria-hidden>🚫</span> 제외할 공격 영웅
              </p>
              <div className="guide-exclude-row">
                <input
                  type="text"
                  className="field-input"
                  value={excludeInput}
                  onChange={(e) => setExcludeInput(e.target.value)}
                  placeholder="제외할 영웅 입력…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addExclude()
                    }
                  }}
                />
                <button type="button" className="guide-btn-sm" onClick={addExclude}>
                  추가
                </button>
              </div>
              {excludeList.length > 0 && (
                <ul className="guide-chip-list" aria-label="제외 목록">
                  {excludeList.map((x) => (
                    <li key={x} className="guide-chip">
                      {x}
                      <button
                        type="button"
                        aria-label={`${x} 제거`}
                        onClick={() =>
                          setExcludeList((p) => p.filter((y) => y !== x))
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {searchError && (
                <p className="form-error" role="alert" style={{ marginBottom: 8 }}>
                  {searchError}
                </p>
              )}
              <button
                type="button"
                className="guide-btn-primary-lg"
                disabled={searchLoading}
                onClick={() => void runSearch()}
              >
                {searchLoading ? '검색 중…' : '방어덱 맞춤 검색'}
              </button>
            </section>

            {searched && !searchLoading && (
              <>
                <h2 className="guide-results-head">
                  검색 결과 {groupedResults.length}건
                </h2>
                {results.length === 0 ? (
                  <p className="guide-placeholder" style={{ marginTop: 0 }}>
                    조건에 맞는 공략이 없습니다.
                  </p>
                ) : (
                  <div className="guide-grid guide-grid--results">
                    {groupedResults.map((g) => {
                      const h = g.header
                      const sumW = g.strategies.reduce((s, x) => s + x.win, 0)
                      const sumL = g.strategies.reduce((s, x) => s + x.lose, 0)
                      return (
                        <article key={g.groupId} className="guide-match-card">
                          <div className="guide-match-head">
                            <div className="guide-match-lines">
                              <div className="guide-line guide-line--portraits">
                                <span className="guide-badge-vs">VS</span>
                                <HeroPortraitStrip
                                  names={[h.defense1, h.defense2, h.defense3]}
                                  portraitUrlByKey={portraitUrlByKey}
                                />
                              </div>
                              <div className="guide-line guide-line--portraits">
                                <span className="guide-badge-atk">ATK</span>
                                <HeroPortraitStrip
                                  names={[h.attack1, h.attack2, h.attack3]}
                                  portraitUrlByKey={portraitUrlByKey}
                                />
                              </div>
                              {h.pet.trim() ? (
                                <div className="guide-line guide-line--portraits">
                                  <span className="guide-badge-pet">펫</span>
                                  <HeroPortraitStrip
                                    names={splitTeamLabel(h.pet)}
                                    portraitUrlByKey={portraitUrlByKey}
                                    fixedColumns={3}
                                  />
                                </div>
                              ) : null}
                            </div>
                            <span className="guide-rate-pill">
                              승률 {winRatePct(sumW, sumL)}
                            </span>
                          </div>
                          {g.strategies.map((m, idx) => {
                            const dateCaption = matchupDateCaption(m)
                            return (
                            <div
                              key={m.id}
                              className={
                                idx === 0
                                  ? 'guide-match-strategy'
                                  : 'guide-match-strategy guide-match-strategy--follow'
                              }
                            >
                              <div className="guide-match-body">
                                {editingId === m.id ? (
                                  <>
                                    <div
                                      className="field"
                                      style={{ marginBottom: '0.5rem' }}
                                    >
                                      <label htmlFor={`edit-skill-${m.id}`}>
                                        스킬
                                      </label>
                                      <input
                                        id={`edit-skill-${m.id}`}
                                        className="field-input"
                                        value={editSkillOrder}
                                        onChange={(e) =>
                                          setEditSkillOrder(e.target.value)
                                        }
                                        placeholder="예: 라드1 -> 손오공2"
                                      />
                                    </div>
                                    <div className="field">
                                      <label htmlFor={`edit-notes-${m.id}`}>
                                        테스트 코멘트
                                      </label>
                                      <textarea
                                        id={`edit-notes-${m.id}`}
                                        className="guide-textarea"
                                        value={editNotes}
                                        onChange={(e) =>
                                          setEditNotes(e.target.value)
                                        }
                                        placeholder="코멘트 입력"
                                      />
                                    </div>
                                    {editErr && (
                                      <p className="form-error" role="alert">
                                        {editErr}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {m.skill_order ? (
                                      <p className="guide-skill">
                                        ⚡ 스킬: {m.skill_order}
                                      </p>
                                    ) : null}
                                    {m.notes ? (
                                      <p className="guide-notes">{m.notes}</p>
                                    ) : (
                                      <p
                                        className="guide-notes"
                                        style={{ color: '#92400e' }}
                                      >
                                        코멘트 없음
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                              <div className="guide-match-actions">
                                {editingId === m.id ? (
                                  <>
                                    <button
                                      type="button"
                                      className="guide-btn-ghost"
                                      disabled={editBusy}
                                      onClick={() => void saveEdit(m.id)}
                                    >
                                      {editBusy ? '저장 중…' : '저장'}
                                    </button>
                                    <button
                                      type="button"
                                      className="guide-btn-ghost"
                                      disabled={editBusy}
                                      onClick={cancelEdit}
                                    >
                                      취소
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="guide-btn-ghost"
                                      onClick={() => startEdit(m)}
                                    >
                                      수정
                                    </button>
                                    {isAdmin ? (
                                      <button
                                        type="button"
                                        className="guide-btn-ghost"
                                        disabled={deleteBusyId === m.id}
                                        onClick={() =>
                                          void deleteMatchup(m.id)
                                        }
                                      >
                                        {deleteBusyId === m.id
                                          ? '삭제 중…'
                                          : '삭제'}
                                      </button>
                                    ) : null}
                                  </>
                                )}
                              </div>
                              <div className="guide-vote-row">
                                <button
                                  type="button"
                                  className="guide-vote-win"
                                  onClick={() => void onVote(m.id, 'win')}
                                >
                                  👍 승리
                                </button>
                                <button
                                  type="button"
                                  className="guide-vote-lose"
                                  onClick={() => void onVote(m.id, 'lose')}
                                >
                                  👎 패배
                                </button>
                              </div>
                              <footer className="guide-match-foot">
                                {dateCaption ? (
                                  <div className="guide-match-foot-date">
                                    {dateCaption}
                                  </div>
                                ) : null}
                                <div className="guide-match-foot-row">
                                  <span>
                                    {m.win}승 {m.lose}패
                                  </span>
                                  <span>
                                    By{' '}
                                    {m.author_name ||
                                      m.author_username ||
                                      `user-${m.author_id.slice(0, 8)}`}
                                  </span>
                                </div>
                              </footer>
                            </div>
                            )
                          })}
                        </article>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {nav === 'stats' && (
          <section className="guide-card" aria-labelledby="atk-stats-h">
            <h2 id="atk-stats-h" className="card-title" style={{ marginTop: 0 }}>
              공격 통계 TOP 10 (승률 순)
            </h2>
            <div className="field" style={{ marginBottom: '0.7rem' }}>
              <label htmlFor="stats-week-select">주차 선택</label>
              <select
                id="stats-week-select"
                className="field-input"
                value={statsWeekStart}
                onChange={(e) => setStatsWeekStart(e.target.value)}
              >
                {weekOptions.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="guide-rank-me" style={{ marginTop: 0 }}>
              기준: {selectedWeekLabel}
            </p>
            <div className="guide-match-actions" style={{ padding: '0 0 0.8rem' }}>
              <button
                type="button"
                className="guide-btn-ghost"
                onClick={() => void loadStatsAndRank()}
                disabled={statsLoading}
              >
                {statsLoading ? '검색 중…' : '검색'}
              </button>
            </div>
            {statsErr ? (
              <p className="form-error" role="alert">
                {statsErr}
              </p>
            ) : null}
            {!statsLoading && attackTop10.length === 0 ? (
              <p className="guide-placeholder" style={{ marginTop: 0 }}>
                통계 데이터가 없습니다.
              </p>
            ) : null}
            {attackTop10.length > 0 ? (
              <div className="guide-grid">
                {attackTop10.map((it, idx) => (
                  <article key={it.key} className="guide-match-card">
                    <div className="guide-match-head">
                      <div className="guide-match-lines">
                        <div className="guide-line guide-line--portraits">
                          <span className="guide-badge-vs">#{idx + 1}</span>
                          <HeroPortraitStrip
                            names={splitTeamLabel(it.defenseLabel)}
                            portraitUrlByKey={portraitUrlByKey}
                          />
                        </div>
                        <div className="guide-line guide-line--portraits">
                          <span className="guide-badge-atk">ATK</span>
                          <HeroPortraitStrip
                            names={splitTeamLabel(it.attackLabel)}
                            portraitUrlByKey={portraitUrlByKey}
                          />
                        </div>
                        {it.pet.trim() ? (
                          <div className="guide-line guide-line--portraits">
                            <span className="guide-badge-pet">펫</span>
                            <HeroPortraitStrip
                              names={splitTeamLabel(it.pet)}
                              portraitUrlByKey={portraitUrlByKey}
                              fixedColumns={3}
                            />
                          </div>
                        ) : null}
                      </div>
                      <span className="guide-rate-pill">
                        승률 {Math.round(it.winRate * 100)}%
                      </span>
                    </div>
                    <div className="guide-match-body">
                      <p className="guide-skill" style={{ marginBottom: 0 }}>
                        전적: {it.win}승 {it.lose}패 ({it.games}전)
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        )}

        {nav === 'rank' && (
          <section className="guide-card" aria-labelledby="rank-h">
            <h2 id="rank-h" className="card-title" style={{ marginTop: 0 }}>
              기여 랭킹 (등록 공략 수)
            </h2>
            <div className="guide-match-actions" style={{ padding: '0 0 0.8rem' }}>
              <button
                type="button"
                className="guide-btn-ghost"
                onClick={() => void loadStatsAndRank()}
                disabled={rankLoading}
              >
                {rankLoading ? '검색 중…' : '검색'}
              </button>
            </div>
            {rankErr ? (
              <p className="form-error" role="alert">
                {rankErr}
              </p>
            ) : null}
            <p className="guide-rank-me">
              {myRank != null
                ? `내 순위: ${myRank}위 / 전체 ${rankRows.length}명`
                : `내 순위: 집계 데이터 없음 / 전체 ${rankRows.length}명`}
            </p>
            {!rankLoading && rankRows.length === 0 ? (
              <p className="guide-placeholder" style={{ marginTop: 0 }}>
                랭킹 데이터가 없습니다.
              </p>
            ) : null}
            {rankRowsForView.length > 0 ? (
              <div className="guide-rank-list" role="table" aria-label="기여 랭킹 표">
                {rankRowsForView.map((r) => (
                  <div
                    key={r.userId}
                    className={
                      r.userId === session.userId
                        ? 'guide-rank-row guide-rank-row--me'
                        : 'guide-rank-row'
                    }
                    role="row"
                  >
                    <span className="guide-rank-col-rank" role="cell">
                      {r.rank}위
                    </span>
                    <span className="guide-rank-col-name" role="cell">
                      {r.name}
                      {r.userId === session.userId ? '  ← 나' : ''}
                    </span>
                    <span className="guide-rank-col-count" role="cell">
                      {r.count}건
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        )}

        {nav === 'admin' && (
          <section className="guide-card" aria-labelledby="admin-h">
            <h2 id="admin-h" className="card-title" style={{ marginTop: 0 }}>
              등록/수정
            </h2>
            {getSessionToken() ? (
              <AdminPortraitPanel
                sessionToken={getSessionToken()!}
                heroOptions={heroOptions}
                onPortraitsChanged={() => void loadPortraitMap()}
              />
            ) : null}
            {isAdmin ? (
              <>
            {adminErr ? (
              <p className="form-error" role="alert">
                {adminErr}
              </p>
            ) : null}
            {adminMsg ? (
              <p className="register-hint register-hint--success" role="status">
                {adminMsg}
              </p>
            ) : null}

            <div className="guide-match-actions" style={{ padding: '0 0 0.8rem' }}>
              <button
                type="button"
                className="guide-btn-ghost"
                onClick={() => void loadAdminRequests()}
                disabled={adminLoading}
              >
                {adminLoading ? '검색 중…' : '검색'}
              </button>
            </div>

            <h3 className="guide-section-label" style={{ marginBottom: '0.4rem' }}>
              가입 신청 {signupRequests.length}건
            </h3>
            {signupRequests.length === 0 ? (
              <p className="guide-placeholder" style={{ marginTop: 0, marginBottom: '0.9rem' }}>
                대기 중인 가입 신청이 없습니다.
              </p>
            ) : (
              <div className="guide-grid" style={{ marginBottom: '0.9rem' }}>
                {signupRequests.map((r) => (
                  <article key={r.id} className="guide-match-card">
                    <div className="guide-match-body">
                      <p className="guide-skill" style={{ marginBottom: '0.3rem' }}>
                        사용자 ID: {r.id.slice(0, 8)}…
                      </p>
                      <p className="guide-skill" style={{ marginBottom: '0.3rem' }}>
                        계정: {r.username}
                      </p>
                      <p className="guide-notes" style={{ marginBottom: '0.4rem' }}>
                        닉네임: {r.display_name}
                      </p>
                      <p className="guide-skill">신청시각: {r.created_at}</p>
                    </div>
                    <div className="guide-vote-row">
                      <button
                        type="button"
                        className="guide-vote-win"
                        onClick={() => void processSignupRequest(r.id, 'approve')}
                      >
                        허용
                      </button>
                      <button
                        type="button"
                        className="guide-vote-lose"
                        onClick={() => void processSignupRequest(r.id, 'reject')}
                      >
                        거절
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <h3 className="guide-section-label" style={{ marginBottom: '0.4rem' }}>
              공략 수정 신청 {editRequests.length}건
            </h3>
            {editRequests.length === 0 ? (
              <p className="guide-placeholder" style={{ marginTop: 0 }}>
                대기 중인 수정 신청이 없습니다.
              </p>
            ) : (
              <div className="guide-grid">
                {editRequests.map((r) => (
                  <article key={r.id} className="guide-match-card">
                    <div className="guide-match-body">
                      <p className="guide-skill" style={{ marginBottom: '0.35rem' }}>
                        대상: {r.defense1} / {r.defense2} / {r.defense3}
                      </p>
                      <p className="guide-skill" style={{ marginBottom: '0.35rem' }}>
                        신청자: {r.requester_display_name || r.requester_username}
                      </p>
                      <p className="guide-skill" style={{ marginBottom: '0.35rem' }}>
                        신청시각: {r.created_at}
                      </p>
                      <p className="guide-notes" style={{ marginBottom: '0.4rem' }}>
                        스킬: {r.skill_order || '(비어 있음)'}
                      </p>
                      <p className="guide-notes">테스트 코멘트: {r.notes || '(비어 있음)'}</p>
                    </div>
                    <div className="guide-vote-row">
                      <button
                        type="button"
                        className="guide-vote-win"
                        onClick={() => void processEditRequest(r.id, 'approve')}
                      >
                        승인 반영
                      </button>
                      <button
                        type="button"
                        className="guide-vote-lose"
                        onClick={() => void processEditRequest(r.id, 'reject')}
                      >
                        거절
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
              </>
            ) : null}
          </section>
        )}

        {nav === 'register' && (
          <section className="guide-card" aria-labelledby="reg-h">
            <h2 id="reg-h" className="card-title" style={{ marginTop: 0 }}>
              공략 등록
            </h2>
            <form onSubmit={onRegister}>
              <div className="guide-register-grid">
                <AutocompleteField
                  id="r1"
                  label="방어1"
                  value={reg.defense1}
                  onChange={(v) => setReg((p) => ({ ...p, defense1: v }))}
                  options={heroOptions}
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="r2"
                  label="방어2"
                  value={reg.defense2}
                  onChange={(v) => setReg((p) => ({ ...p, defense2: v }))}
                  options={heroOptions}
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="r3"
                  label="방어3"
                  value={reg.defense3}
                  onChange={(v) => setReg((p) => ({ ...p, defense3: v }))}
                  options={heroOptions}
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="ra1"
                  label="공격1"
                  value={reg.attack1}
                  onChange={(v) => setReg((p) => ({ ...p, attack1: v }))}
                  options={heroOptions}
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="ra2"
                  label="공격2"
                  value={reg.attack2}
                  onChange={(v) => setReg((p) => ({ ...p, attack2: v }))}
                  options={heroOptions}
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="ra3"
                  label="공격3"
                  value={reg.attack3}
                  onChange={(v) => setReg((p) => ({ ...p, attack3: v }))}
                  options={heroOptions}
                  maxSuggestions={5}
                />
              </div>
              <div className="guide-register-grid guide-register-pet-row">
                <AutocompleteField
                  id="rpet1"
                  label="펫1"
                  value={reg.pet1}
                  onChange={(v) => setReg((p) => ({ ...p, pet1: v }))}
                  options={heroOptions}
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="rpet2"
                  label="펫2"
                  value={reg.pet2}
                  onChange={(v) => setReg((p) => ({ ...p, pet2: v }))}
                  options={heroOptions}
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="rpet3"
                  label="펫3"
                  value={reg.pet3}
                  onChange={(v) => setReg((p) => ({ ...p, pet3: v }))}
                  options={heroOptions}
                  maxSuggestions={5}
                />
              </div>
              <div className="guide-register-grid guide-register-skill-row">
                <div className="field">
                  <label htmlFor="sk1">스킬1</label>
                  <select
                    id="sk1"
                    className="field-input ac-input"
                    value={reg.skillSlot1}
                    onChange={(e) =>
                      setReg((p) => ({ ...p, skillSlot1: e.target.value }))
                    }
                  >
                    <option value="">선택</option>
                    {regSkillOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="sk2">스킬2</label>
                  <select
                    id="sk2"
                    className="field-input ac-input"
                    value={reg.skillSlot2}
                    onChange={(e) =>
                      setReg((p) => ({ ...p, skillSlot2: e.target.value }))
                    }
                  >
                    <option value="">선택</option>
                    {regSkillOptions.map((opt) => (
                      <option key={`s2-${opt}`} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="sk3">스킬3</label>
                  <select
                    id="sk3"
                    className="field-input ac-input"
                    value={reg.skillSlot3}
                    onChange={(e) =>
                      setReg((p) => ({ ...p, skillSlot3: e.target.value }))
                    }
                  >
                    <option value="">선택</option>
                    {regSkillOptions.map((opt) => (
                      <option key={`s3-${opt}`} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginTop: '0.65rem' }}>
                <label htmlFor="nt">코멘트 / 메모</label>
                <textarea
                  id="nt"
                  className="guide-textarea guide-textarea--register-notes"
                  value={reg.notes}
                  onChange={(e) => setReg((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="팁을 입력하세요"
                />
              </div>
              {regErr && (
                <p className="form-error" role="alert">
                  {regErr}
                </p>
              )}
              {regMsg && (
                <p className="register-hint register-hint--success" role="status">
                  {regMsg}
                </p>
              )}
              <button
                type="submit"
                className="guide-btn-primary-lg"
                style={{ marginTop: '0.85rem' }}
                disabled={regBusy}
              >
                {regBusy ? '등록 중…' : '등록하기'}
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}
