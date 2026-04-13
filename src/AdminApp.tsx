import { useCallback, useEffect, useState } from 'react'
import { apiJson } from './api/client.ts'
import type { UserSession } from './authSession.ts'
import './App.css'
import './guide.css'

type SignupRequestRow = {
  id: number
  username: string
  display_name: string
  created_at: string
}

type Props = {
  session: UserSession
  onLogout: () => void
}

export function AdminApp({ session, onLogout }: Props) {
  const [rows, setRows] = useState<SignupRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const list = await apiJson<SignupRequestRow[]>('/api/admin/signup-requests', {
        token: session.token,
      })
      setRows(list)
    } catch (e) {
      setRows([])
      setErr(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [session.token])

  useEffect(() => {
    void load()
  }, [load])

  const approve = async (id: number) => {
    setBusyId(id)
    setErr(null)
    try {
      await apiJson<{ ok: boolean }>(`/api/admin/signup-requests/${id}/approve`, {
        method: 'POST',
        token: session.token,
        body: JSON.stringify({}),
      })
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '처리 실패')
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (id: number) => {
    setBusyId(id)
    setErr(null)
    try {
      await apiJson<{ ok: boolean }>(`/api/admin/signup-requests/${id}/reject`, {
        method: 'POST',
        token: session.token,
        body: JSON.stringify({}),
      })
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '처리 실패')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="guide-shell admin-shell">
      <div className="guide-inner">
        <div className="guide-top-actions">
          <button type="button" className="button-secondary" onClick={onLogout}>
            로그아웃
          </button>
        </div>

        <header className="guide-brand">
          <h1 className="guide-brand-title">가입 신청 관리</h1>
          <p className="guide-user">
            관리자 <strong>{session.displayName}</strong>
          </p>
        </header>

        <section className="card auth-card--gate" style={{ maxWidth: '42rem', margin: '0 auto' }}>
          <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>
            대기 중인 신청
          </h2>
          {err && (
            <p className="form-error" role="alert">
              {err}
            </p>
          )}
          {loading ? (
            <p className="guide-placeholder" style={{ padding: '1.5rem' }}>
              불러오는 중…
            </p>
          ) : rows.length === 0 ? (
            <p className="guide-placeholder" style={{ padding: '1.5rem' }}>
              대기 중인 가입 신청이 없습니다.
            </p>
          ) : (
            <ul className="admin-request-list">
              {rows.map((r) => (
                <li key={r.id} className="admin-request-row">
                  <div className="admin-request-meta">
                    <strong>{r.username}</strong>
                    <span className="admin-request-nick">{r.display_name}</span>
                    <span className="admin-request-time">{r.created_at}</span>
                  </div>
                  <div className="admin-request-actions">
                    <button
                      type="button"
                      className="retry-button"
                      disabled={busyId === r.id}
                      onClick={() => void approve(r.id)}
                    >
                      허용
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busyId === r.id}
                      onClick={() => void reject(r.id)}
                    >
                      거절
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
