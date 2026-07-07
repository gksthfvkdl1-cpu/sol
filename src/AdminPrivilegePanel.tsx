import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase/client.ts'

type AdminUserRow = {
  id: string
  username: string
  display_name: string
  approved: boolean
  rejected: boolean
  is_admin: boolean
  is_rule_admin: boolean
  is_effective_admin: boolean
  created_at: string
}

type Props = {
  sessionToken: string
  currentUserId: string
}

function mapUserRow(raw: Record<string, unknown>): AdminUserRow {
  return {
    id: String(raw.id ?? ''),
    username: String(raw.username ?? ''),
    display_name: String(raw.display_name ?? ''),
    approved: raw.approved === true,
    rejected: raw.rejected === true,
    is_admin: raw.is_admin === true,
    is_rule_admin: raw.is_rule_admin === true,
    is_effective_admin: raw.is_effective_admin === true,
    created_at: String(raw.created_at ?? ''),
  }
}

function formatAdminError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('last_admin')) {
    return '마지막 관리자 권한은 해제할 수 없습니다. (다른 관리자를 먼저 지정하세요.)'
  }
  if (m.includes('forbidden')) {
    return '관리자 권한이 없습니다.'
  }
  if (m.includes('not_found')) {
    return '사용자를 찾을 수 없습니다.'
  }
  return message
}

export function AdminPrivilegePanel({ sessionToken, currentUserId }: Props) {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [adminUsernameContains, setAdminUsernameContains] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const loadUsers = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('app_admin_list_users', {
        p_session_token: sessionToken,
      })
      if (error) throw new Error(error.message)
      const j = (data ?? {}) as Record<string, unknown>
      setAdminUsernameContains(String(j.admin_username_contains ?? ''))
      const rows = Array.isArray(j.users) ? (j.users as Record<string, unknown>[]) : []
      setUsers(rows.map(mapUserRow))
    } catch (e) {
      setUsers([])
      setErr(e instanceof Error ? e.message : '목록 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [sessionToken])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const filteredUsers = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q),
    )
  }, [filter, users])

  const setUserAdmin = async (userId: string, isAdmin: boolean) => {
    const label = isAdmin ? '관리자로 지정' : 'DB 관리자 권한 해제'
    const target = users.find((u) => u.id === userId)
    const name = target?.username ?? userId.slice(0, 8)
    if (!window.confirm(`${name} 계정을 ${label}할까요?`)) return

    setBusyUserId(userId)
    setErr(null)
    setMsg(null)
    try {
      const { error } = await supabase.rpc('app_admin_set_user_admin', {
        p_session_token: sessionToken,
        p_user_id: userId,
        p_is_admin: isAdmin,
      })
      if (error) throw new Error(error.message)
      setMsg(
        isAdmin
          ? `${name} 계정에 DB 관리자(is_admin) 권한을 부여했습니다.`
          : `${name} 계정의 DB 관리자(is_admin) 권한을 해제했습니다.`,
      )
      await loadUsers()
    } catch (e) {
      const raw = e instanceof Error ? e.message : '처리 실패'
      setErr(formatAdminError(raw))
    } finally {
      setBusyUserId(null)
    }
  }

  const privilegedCount = users.filter((u) => u.is_effective_admin).length

  return (
    <div className="guide-admin-privilege" style={{ marginBottom: '1.25rem' }}>
      <h3 className="guide-section-label" style={{ marginBottom: '0.45rem' }}>
        관리자 권한 관리
      </h3>
      <p className="register-hint" style={{ marginTop: 0, marginBottom: '0.65rem' }}>
        관리자 판별은 <strong>DB 플래그(is_admin)</strong> 또는{' '}
        <strong>아이디 포함 규칙</strong> 중 하나만 맞아도 됩니다 (OR). 여기서는 가입
        사용자에게 <strong>is_admin</strong>만 부여·해제합니다.
        {adminUsernameContains.trim() ? (
          <>
            {' '}
            현재 아이디 규칙: <code>{adminUsernameContains}</code> 포함
          </>
        ) : (
          <> 현재 아이디 규칙: 없음</>
        )}
      </p>

      {err ? (
        <p className="form-error" role="alert">
          {err}
        </p>
      ) : null}
      {msg ? (
        <p className="register-hint register-hint--success" role="status">
          {msg}
        </p>
      ) : null}

      <div className="guide-match-actions" style={{ padding: '0 0 0.65rem' }}>
        <input
          type="search"
          className="field-input"
          style={{ flex: '1 1 12rem', minWidth: 0 }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="아이디·닉네임 검색"
          autoComplete="off"
        />
        <button
          type="button"
          className="guide-btn-ghost"
          onClick={() => void loadUsers()}
          disabled={loading}
        >
          {loading ? '불러오는 중…' : '새로고침'}
        </button>
      </div>

      <p className="guide-skill" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
        전체 {users.length}명 · 유효 관리자 {privilegedCount}명
      </p>

      {loading && users.length === 0 ? (
        <p className="guide-placeholder" style={{ marginTop: 0 }}>
          사용자 목록을 불러오는 중…
        </p>
      ) : null}

      {!loading && filteredUsers.length === 0 ? (
        <p className="guide-placeholder" style={{ marginTop: 0 }}>
          표시할 사용자가 없습니다.
        </p>
      ) : (
        <ul className="guide-admin-privilege-list">
          {filteredUsers.map((u) => {
            const busy = busyUserId === u.id
            const isSelf = u.id === currentUserId
            return (
              <li key={u.id} className="guide-admin-privilege-item">
                <div className="guide-admin-privilege-main">
                  <div className="guide-admin-privilege-name">
                    <strong>{u.username}</strong>
                    {u.display_name.trim() ? (
                      <span className="guide-admin-privilege-nick"> ({u.display_name})</span>
                    ) : null}
                    {isSelf ? (
                      <span className="guide-admin-privilege-self"> · 나</span>
                    ) : null}
                  </div>
                  <div className="guide-admin-privilege-badges">
                    {u.is_effective_admin ? (
                      <span className="guide-admin-badge guide-admin-badge--on">관리자</span>
                    ) : (
                      <span className="guide-admin-badge">일반</span>
                    )}
                    {u.is_admin ? (
                      <span className="guide-admin-badge guide-admin-badge--db">DB</span>
                    ) : null}
                    {u.is_rule_admin ? (
                      <span className="guide-admin-badge guide-admin-badge--rule">아이디규칙</span>
                    ) : null}
                    {!u.approved && !u.rejected ? (
                      <span className="guide-admin-badge guide-admin-badge--pending">승인대기</span>
                    ) : null}
                    {u.rejected ? (
                      <span className="guide-admin-badge guide-admin-badge--rejected">거절</span>
                    ) : null}
                  </div>
                </div>
                <div className="guide-vote-row" style={{ marginTop: '0.45rem' }}>
                  {u.is_admin ? (
                    <button
                      type="button"
                      className="guide-vote-lose"
                      disabled={busy}
                      onClick={() => void setUserAdmin(u.id, false)}
                    >
                      {busy ? '처리 중…' : 'DB 관리자 해제'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="guide-vote-win"
                      disabled={busy}
                      onClick={() => void setUserAdmin(u.id, true)}
                    >
                      {busy ? '처리 중…' : 'DB 관리자 부여'}
                    </button>
                  )}
                </div>
                {u.is_rule_admin && !u.is_admin ? (
                  <p className="register-hint" style={{ margin: '0.35rem 0 0' }}>
                    아이디 규칙으로 이미 관리자입니다. DB 플래그를 꺼도 관리자 권한은
                    유지됩니다.
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
