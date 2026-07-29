import { useCallback, useEffect, useState } from 'react'
import { HeroPortraitStrip } from './HeroPortraitStrip.tsx'
import { getSessionToken } from './authSession.ts'
import { supabase } from './supabase/client.ts'

export type MyVoteRow = {
  matchupId: number
  defense1: string
  defense2: string
  defense3: string
  attack1: string
  attack2: string
  attack3: string
  pet: string
  equipment: string
  formation: string
  skillOrder: string
  notes: string
  winCnt: number
  loseCnt: number
  voteDate: string
}

type Props = {
  portraitUrlByKey: Readonly<Record<string, string>>
  /** 투표 후 등 외부에서 새로고침할 때 증가 */
  refreshKey?: number
  defaultDateYmd: string
}

function mapRow(r: Record<string, unknown>): MyVoteRow {
  return {
    matchupId: Number(r.matchup_id),
    defense1: String(r.defense1 ?? ''),
    defense2: String(r.defense2 ?? ''),
    defense3: String(r.defense3 ?? ''),
    attack1: String(r.attack1 ?? ''),
    attack2: String(r.attack2 ?? ''),
    attack3: String(r.attack3 ?? ''),
    pet: String(r.pet ?? ''),
    equipment: String(r.equipment ?? ''),
    formation: String(r.formation ?? ''),
    skillOrder: String(r.skill_order ?? ''),
    notes: String(r.notes ?? ''),
    winCnt: Number(r.win_cnt ?? 0),
    loseCnt: Number(r.lose_cnt ?? 0),
    voteDate: String(r.vote_date ?? ''),
  }
}

export function MyVotesByDatePanel({
  portraitUrlByKey,
  refreshKey = 0,
  defaultDateYmd,
}: Props) {
  const [open, setOpen] = useState(false)
  const [voteDate, setVoteDate] = useState(defaultDateYmd)
  const [rows, setRows] = useState<MyVoteRow[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loadedOnce, setLoadedOnce] = useState(false)

  const load = useCallback(async (date: string) => {
    const d = date.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setErr('날짜는 YYYY-MM-DD 형식이어야 합니다.')
      setRows([])
      return
    }
    const tok = getSessionToken()
    if (!tok) {
      setErr('로그인이 필요합니다.')
      setRows([])
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const { data, error } = await supabase.rpc('app_list_my_votes_by_date', {
        p_session_token: tok,
        p_vote_date: d,
      })
      if (error) throw new Error(error.message)
      const list = Array.isArray(data)
        ? (data as Record<string, unknown>[]).map(mapRow)
        : []
      setRows(list)
      setLoadedOnce(true)
    } catch (e) {
      setRows([])
      setErr(e instanceof Error ? e.message : '기록 불러오기 실패')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void load(voteDate)
  }, [open, voteDate, refreshKey, load])

  const totalWin = rows.reduce((s, r) => s + r.winCnt, 0)
  const totalLose = rows.reduce((s, r) => s + r.loseCnt, 0)

  return (
    <details
      className="my-votes-day"
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open
        setOpen(next)
      }}
    >
      <summary className="my-votes-day-summary">
        <span className="my-votes-day-summary-title">내 승·패 기록</span>
        <span className="my-votes-day-summary-hint">
          {open
            ? loadedOnce
              ? `${rows.length}덱 · ${totalWin}승 ${totalLose}패`
              : '불러오는 중…'
            : '날짜별 확인'}
        </span>
      </summary>

      <div className="my-votes-day-body">
        <div className="my-votes-day-toolbar">
          <label className="my-votes-day-date-label" htmlFor="my-votes-date">
            조회일
          </label>
          <input
            id="my-votes-date"
            type="date"
            className="my-votes-day-date"
            value={voteDate}
            onChange={(e) => setVoteDate(e.target.value)}
          />
          <button
            type="button"
            className="guide-btn-ghost"
            disabled={busy}
            onClick={() => void load(voteDate)}
          >
            {busy ? '조회 중…' : '새로고침'}
          </button>
          <button
            type="button"
            className="guide-btn-ghost"
            disabled={busy || voteDate === defaultDateYmd}
            onClick={() => setVoteDate(defaultDateYmd)}
          >
            오늘
          </button>
        </div>

        {err ? (
          <p className="form-error" role="alert">
            {err}
          </p>
        ) : null}

        {!busy && loadedOnce && rows.length === 0 && !err ? (
          <p className="guide-placeholder" style={{ margin: '0.35rem 0 0' }}>
            해당 날짜에 누른 승리/패배 기록이 없습니다.
          </p>
        ) : null}

        {rows.length > 0 ? (
          <ul className="my-votes-day-list" aria-label="내 승패 기록 목록">
            {rows.map((r) => (
              <li key={r.matchupId} className="my-votes-day-item">
                <div className="my-votes-day-teams">
                  <div className="my-votes-day-team">
                    <span className="my-votes-day-team-label">수비</span>
                    <HeroPortraitStrip
                      names={[r.defense1, r.defense2, r.defense3]}
                      portraitUrlByKey={portraitUrlByKey}
                      fixedColumns={3}
                    />
                  </div>
                  <div className="my-votes-day-team">
                    <span className="my-votes-day-team-label">공격</span>
                    <HeroPortraitStrip
                      names={[r.attack1, r.attack2, r.attack3]}
                      portraitUrlByKey={portraitUrlByKey}
                      fixedColumns={3}
                    />
                  </div>
                </div>
                <div className="my-votes-day-meta">
                  <span className="my-votes-day-outcome">
                    {r.winCnt}승 / {r.loseCnt}패
                  </span>
                  {r.pet.trim() ? (
                    <span className="my-votes-day-chip">펫 {r.pet}</span>
                  ) : null}
                  {r.equipment.trim() ? (
                    <span className="my-votes-day-chip">장비 {r.equipment}</span>
                  ) : null}
                  {r.formation.trim() ? (
                    <span className="my-votes-day-chip">진형 {r.formation}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  )
}
