import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AutocompleteField } from './AutocompleteField.tsx'
import { apiJson } from './api/client.ts'
import type { UserSession } from './authSession.ts'
import type { MatchupRow } from './types/matchup.ts'
import './App.css'
import './guide.css'
import { BrandLogo } from './BrandLogo.tsx'

type NavId = 'search' | 'stats' | 'siege' | 'register' | 'rank' | 'admin'

type SignupRequestRow = {
  id: number
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

function winRatePct(win: number, lose: number): string {
  const t = Number(win) + Number(lose)
  if (t <= 0) return '—'
  return `${Math.round((Number(win) / t) * 100)}%`
}

type Props = {
  session: UserSession
  onLogout: () => void
}

export function GuideApp({ session, onLogout }: Props) {
  const isAdmin = session.username === 'admin'
  const [nav, setNav] = useState<NavId>('search')
  const [heroOptions, setHeroOptions] = useState<string[]>([])

  const [d1, setD1] = useState('')
  const [d2, setD2] = useState('')
  const [d3, setD3] = useState('')
  const [excludeInput, setExcludeInput] = useState('')
  const [excludeList, setExcludeList] = useState<string[]>([])

  const [results, setResults] = useState<MatchupRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const [reg, setReg] = useState({
    defense1: '',
    defense2: '',
    defense3: '',
    attack1: '',
    attack2: '',
    attack3: '',
    skill_order: '',
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

  const [signupRequests, setSignupRequests] = useState<SignupRequestRow[]>([])
  const [editRequests, setEditRequests] = useState<EditRequestRow[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminErr, setAdminErr] = useState<string | null>(null)

  const loadHeroes = useCallback(async () => {
    try {
      const list = await apiJson<string[]>('/api/meta/heroes')
      setHeroOptions(list)
    } catch {
      setHeroOptions([])
    }
  }, [])

  useEffect(() => {
    void loadHeroes()
  }, [loadHeroes])

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const me = await apiJson<{ id: number; username: string; displayName: string }>(
          '/api/auth/me',
          { token: session.token },
        )
        if (!dead) setProfileName(me.displayName || me.username)
      } catch {
        if (!dead) setProfileName(session.displayName)
      }
    })()
    return () => {
      dead = true
    }
  }, [session.displayName, session.token])

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
      const rows = await apiJson<MatchupRow[]>('/api/matchups/search', {
        method: 'POST',
        body: JSON.stringify({
          defense1: d1,
          defense2: d2,
          defense3: d3,
          exclude: excludeList,
        }),
      })
      setResults(rows)
    } catch (e) {
      setResults([])
      setSearchError(e instanceof Error ? e.message : '검색 실패')
    } finally {
      setSearchLoading(false)
    }
  }

  const onVote = async (id: number, outcome: 'win' | 'lose') => {
    const ok =
      outcome === 'win'
        ? window.confirm('정말 승리 하셨습니까?')
        : window.confirm('정말 패배 하셨습니까? 공부하세요')
    if (!ok) return
    try {
      const row = await apiJson<MatchupRow>(`/api/matchups/${id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ outcome }),
      })
      setResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, win: row.win, lose: row.lose } : r)),
      )
      void loadHeroes()
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
      await apiJson<{ ok: boolean }>(`/api/matchups/${id}/edit-request`, {
        method: 'POST',
        token: session.token,
        body: JSON.stringify({
          skill_order: editSkillOrder.trim(),
          notes: editNotes.trim(),
        }),
      })
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
      const [signupRows, editRows] = await Promise.all([
        apiJson<SignupRequestRow[]>('/api/admin/signup-requests', {
          token: session.token,
        }),
        apiJson<EditRequestRow[]>('/api/admin/edit-requests', {
          token: session.token,
        }),
      ])
      setSignupRequests(signupRows)
      setEditRequests(editRows)
    } catch (err) {
      setAdminErr(err instanceof Error ? err.message : '관리자 목록 조회 실패')
    } finally {
      setAdminLoading(false)
    }
  }, [isAdmin, session.token])

  useEffect(() => {
    if (nav === 'admin' && isAdmin) {
      void loadAdminRequests()
    }
  }, [isAdmin, loadAdminRequests, nav])

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
      skill_order: '',
      notes: '',
    })
    setRegErr(null)
    setRegMsg(null)
    setRegBusy(false)
  }, [nav])

  const processSignupRequest = async (id: number, action: 'approve' | 'reject') => {
    setAdminErr(null)
    setAdminMsg(null)
    try {
      await apiJson<{ ok: boolean }>(`/api/admin/signup-requests/${id}/${action}`, {
        method: 'POST',
        token: session.token,
        body: JSON.stringify({}),
      })
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
      await apiJson<{ ok: boolean }>(`/api/admin/edit-requests/${id}/${action}`, {
        method: 'POST',
        token: session.token,
        body: JSON.stringify({}),
      })
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
      await apiJson<{ ok: boolean }>(`/api/matchups/${id}`, {
        method: 'DELETE',
        token: session.token,
      })
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
    setRegBusy(true)
    try {
      await apiJson('/api/matchups', {
        method: 'POST',
        token: session.token,
        body: JSON.stringify({
          defense1: reg.defense1.trim(),
          defense2: reg.defense2.trim(),
          defense3: reg.defense3.trim(),
          attack1: reg.attack1.trim(),
          attack2: reg.attack2.trim(),
          attack3: reg.attack3.trim(),
          skill_order: reg.skill_order.trim(),
          notes: reg.notes.trim(),
        }),
      })
      setReg({
        defense1: '',
        defense2: '',
        defense3: '',
        attack1: '',
        attack2: '',
        attack3: '',
        skill_order: '',
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
        {navBtn('stats', '방어 통계')}
        {navBtn('siege', '공성전')}
        {navBtn('register', '공략 등록')}
        {navBtn('rank', '기여 랭킹')}
        {isAdmin ? navBtn('admin', '회원가입 신청') : null}
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

        {nav !== 'search' && nav !== 'register' && nav !== 'admin' && (
          <div className="guide-placeholder">
            <p style={{ margin: 0 }}>이 메뉴는 준비 중입니다.</p>
          </div>
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
                  검색 결과 {results.length}건
                </h2>
                {results.length === 0 ? (
                  <p className="guide-placeholder" style={{ marginTop: 0 }}>
                    조건에 맞는 공략이 없습니다.
                  </p>
                ) : (
                  <div className="guide-grid">
                    {results.map((m) => (
                      <article key={m.id} className="guide-match-card">
                        <div className="guide-match-head">
                          <div className="guide-match-lines">
                            <div className="guide-line">
                              <span className="guide-badge-vs">VS</span>
                              <span>
                                {m.defense1} / {m.defense2} / {m.defense3}
                              </span>
                            </div>
                            <div className="guide-line">
                              <span className="guide-badge-atk">ATK</span>
                              <span>
                                {m.attack1} / {m.attack2} / {m.attack3}
                              </span>
                            </div>
                          </div>
                          <span className="guide-rate-pill">
                            승률 {winRatePct(m.win, m.lose)}
                          </span>
                        </div>
                        <div className="guide-match-body">
                          {editingId === m.id ? (
                            <>
                              <div className="field" style={{ marginBottom: '0.5rem' }}>
                                <label htmlFor={`edit-skill-${m.id}`}>스킬</label>
                                <input
                                  id={`edit-skill-${m.id}`}
                                  className="field-input"
                                  value={editSkillOrder}
                                  onChange={(e) => setEditSkillOrder(e.target.value)}
                                  placeholder="예: 라드1 -> 손오공2"
                                />
                              </div>
                              <div className="field">
                                <label htmlFor={`edit-notes-${m.id}`}>테스트 코멘트</label>
                                <textarea
                                  id={`edit-notes-${m.id}`}
                                  className="guide-textarea"
                                  value={editNotes}
                                  onChange={(e) => setEditNotes(e.target.value)}
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
                                <p className="guide-skill">⚡ 스킬: {m.skill_order}</p>
                              ) : null}
                              {m.notes ? (
                                <p className="guide-notes">{m.notes}</p>
                              ) : (
                                <p className="guide-notes" style={{ color: '#92400e' }}>
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
                                  onClick={() => void deleteMatchup(m.id)}
                                >
                                  {deleteBusyId === m.id ? '삭제 중…' : '삭제'}
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
                          <span>
                            {m.win}승 {m.lose}패
                          </span>
                          <span>
                            By{' '}
                            {m.author_name ||
                              m.author_username ||
                              `user${m.author_id}`}
                          </span>
                        </footer>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {nav === 'admin' && isAdmin && (
          <section className="guide-card" aria-labelledby="admin-h">
            <h2 id="admin-h" className="card-title" style={{ marginTop: 0 }}>
              회원가입 / 수정 신청 관리
            </h2>
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
                {adminLoading ? '불러오는 중…' : '새로고침'}
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
                        신청 ID: {r.id}
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
              <div className="field" style={{ marginTop: '0.75rem' }}>
                <label htmlFor="sk">스킬 순서</label>
                <input
                  id="sk"
                  className="field-input"
                  value={reg.skill_order}
                  onChange={(e) =>
                    setReg((p) => ({ ...p, skill_order: e.target.value }))
                  }
                  placeholder="예: 라드1 -> 손오공2"
                />
              </div>
              <div className="field" style={{ marginTop: '0.65rem' }}>
                <label htmlFor="nt">코멘트 / 메모</label>
                <textarea
                  id="nt"
                  className="guide-textarea"
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
