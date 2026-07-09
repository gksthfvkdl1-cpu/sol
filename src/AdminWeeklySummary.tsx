import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase/client.ts'

type WeeklySummary = {
  weekStart: string
  weekEnd: string
  newMatchupsThisWeek: number
  pendingSignups: number
  pendingEditRequests: number
  activeUsersYesterday: number
  activeUsersThisWeek: number
}

type Props = {
  sessionToken: string
  refreshKey?: number
}

function formatDotDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return iso
  return `${m[1]}.${Number(m[2])}.${Number(m[3])}`
}

function mapSummary(raw: Record<string, unknown>): WeeklySummary {
  return {
    weekStart: String(raw.week_start ?? ''),
    weekEnd: String(raw.week_end ?? ''),
    newMatchupsThisWeek: Number(raw.new_matchups_this_week ?? 0),
    pendingSignups: Number(raw.pending_signups ?? 0),
    pendingEditRequests: Number(raw.pending_edit_requests ?? 0),
    activeUsersYesterday: Number(raw.active_users_yesterday ?? 0),
    activeUsersThisWeek: Number(raw.active_users_this_week ?? 0),
  }
}

export function AdminWeeklySummary({ sessionToken, refreshKey = 0 }: Props) {
  const [summary, setSummary] = useState<WeeklySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('app_admin_weekly_summary', {
        p_session_token: sessionToken,
      })
      if (error) throw new Error(error.message)
      setSummary(mapSummary((data ?? {}) as Record<string, unknown>))
    } catch (e) {
      setSummary(null)
      setErr(e instanceof Error ? e.message : '주간 요약 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [sessionToken])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary, refreshKey])

  const weekLabel =
    summary?.weekStart && summary?.weekEnd
      ? `${formatDotDate(summary.weekStart)} ~ ${formatDotDate(summary.weekEnd)}`
      : null

  return (
    <section className="guide-admin-summary" aria-labelledby="admin-weekly-summary-h">
      <div className="guide-admin-summary-head">
        <h3 id="admin-weekly-summary-h" className="guide-section-label" style={{ margin: 0 }}>
          주간 요약
        </h3>
        <button
          type="button"
          className="guide-btn-ghost"
          onClick={() => void loadSummary()}
          disabled={loading}
        >
          {loading ? '불러오는 중…' : '새로고침'}
        </button>
      </div>
      {weekLabel ? (
        <p className="guide-skill" style={{ margin: '0.35rem 0 0.65rem' }}>
          이번 주 ({weekLabel})
        </p>
      ) : null}
      {err ? (
        <p className="form-error" role="alert">
          {err}
        </p>
      ) : null}
      {loading && !summary ? (
        <p className="guide-placeholder" style={{ marginTop: 0 }}>
          요약을 불러오는 중…
        </p>
      ) : null}
      {summary ? (
        <ul className="guide-admin-summary-grid">
          <li className="guide-admin-summary-item">
            <span className="guide-admin-summary-label">이번 주 새 공략</span>
            <strong className="guide-admin-summary-value">{summary.newMatchupsThisWeek}</strong>
            <span className="guide-admin-summary-unit">건</span>
          </li>
          <li className="guide-admin-summary-item">
            <span className="guide-admin-summary-label">가입 대기</span>
            <strong
              className={
                summary.pendingSignups > 0
                  ? 'guide-admin-summary-value guide-admin-summary-value--warn'
                  : 'guide-admin-summary-value'
              }
            >
              {summary.pendingSignups}
            </strong>
            <span className="guide-admin-summary-unit">건</span>
          </li>
          <li className="guide-admin-summary-item">
            <span className="guide-admin-summary-label">수정 신청 대기</span>
            <strong
              className={
                summary.pendingEditRequests > 0
                  ? 'guide-admin-summary-value guide-admin-summary-value--warn'
                  : 'guide-admin-summary-value'
              }
            >
              {summary.pendingEditRequests}
            </strong>
            <span className="guide-admin-summary-unit">건</span>
          </li>
          <li className="guide-admin-summary-item">
            <span className="guide-admin-summary-label">어제 접속</span>
            <strong className="guide-admin-summary-value">{summary.activeUsersYesterday}</strong>
            <span className="guide-admin-summary-unit">명</span>
          </li>
          <li className="guide-admin-summary-item">
            <span className="guide-admin-summary-label">이번 주 접속</span>
            <strong className="guide-admin-summary-value">{summary.activeUsersThisWeek}</strong>
            <span className="guide-admin-summary-unit">명</span>
          </li>
        </ul>
      ) : null}
    </section>
  )
}
