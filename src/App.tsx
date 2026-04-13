import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'
import { AutocompleteField } from './AutocompleteField.tsx'
import { clearAuth, readAuth, saveAuth, type AuthPayload } from './authStorage.ts'
import {
  postGuideToAppsScript,
  postLoginToAppsScript,
} from './appsScriptRegister.ts'
import { uniqueColumnOptions } from './suggestUtils.ts'
import {
  type SheetGuideRow,
  fetchOpenSheetRows,
  formatWinRate,
} from './openSheet.ts'

function matchesDefenseFilters(
  row: SheetGuideRow,
  d1: string,
  d2: string,
  d3: string,
): boolean {
  if (d1 && !row.defense1.includes(d1)) return false
  if (d2 && !row.defense2.includes(d2)) return false
  if (d3 && !row.defense3.includes(d3)) return false
  return true
}

function rowHeading(row: SheetGuideRow, index: number): string {
  const parts = [row.defense1, row.defense2, row.defense3].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : `항목 ${index + 1}`
}

function attackLine(row: SheetGuideRow): string {
  return [row.attack1, row.attack2, row.attack3].filter(Boolean).join(' / ')
}

type RegisterFormState = {
  defense1: string
  defense2: string
  defense3: string
  attack1: string
  attack2: string
  attack3: string
  comment: string
}

const emptyRegisterForm: RegisterFormState = {
  defense1: '',
  defense2: '',
  defense3: '',
  attack1: '',
  attack2: '',
  attack3: '',
  comment: '',
}

export default function App() {
  const [auth, setAuth] = useState<AuthPayload | null>(() => readAuth())

  const [loginId, setLoginId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginSubmitting, setLoginSubmitting] = useState(false)

  const [registerForm, setRegisterForm] =
    useState<RegisterFormState>(emptyRegisterForm)
  const [registerMessage, setRegisterMessage] = useState<string | null>(null)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registerSubmitting, setRegisterSubmitting] = useState(false)

  const [defense1, setDefense1] = useState('')
  const [defense2, setDefense2] = useState('')
  const [defense3, setDefense3] = useState('')

  const [rows, setRows] = useState<SheetGuideRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [filteredResults, setFilteredResults] = useState<SheetGuideRow[]>([])

  const defense1Options = useMemo(
    () => uniqueColumnOptions(rows, 'defense1'),
    [rows],
  )
  const defense2Options = useMemo(
    () => uniqueColumnOptions(rows, 'defense2'),
    [rows],
  )
  const defense3Options = useMemo(
    () => uniqueColumnOptions(rows, 'defense3'),
    [rows],
  )
  const attack1Options = useMemo(
    () => uniqueColumnOptions(rows, 'attack1'),
    [rows],
  )
  const attack2Options = useMemo(
    () => uniqueColumnOptions(rows, 'attack2'),
    [rows],
  )
  const attack3Options = useMemo(
    () => uniqueColumnOptions(rows, 'attack3'),
    [rows],
  )

  const isLoggedIn = auth !== null

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoginError(null)

    const webUrl = import.meta.env.VITE_APPS_SCRIPT_WEBAPP_URL?.trim()
    if (!webUrl) {
      setLoginError(
        'VITE_APPS_SCRIPT_WEBAPP_URL이 없습니다. Apps Script 웹 앱 URL을 설정하세요.',
      )
      return
    }

    const id = loginId.trim()
    if (!id || !loginPassword) {
      setLoginError('ID와 비밀번호를 입력하세요.')
      return
    }

    setLoginSubmitting(true)
    try {
      await postLoginToAppsScript(webUrl, { id, password: loginPassword })
      saveAuth(id)
      setAuth(readAuth())
      setLoginPassword('')
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : '로그인에 실패했습니다.',
      )
    } finally {
      setLoginSubmitting(false)
    }
  }

  const handleLogout = () => {
    clearAuth()
    setAuth(null)
    setLoginError(null)
    setRegisterForm(emptyRegisterForm)
    setRegisterMessage(null)
    setRegisterError(null)
    setRegisterSubmitting(false)
    setLoginSubmitting(false)
  }

  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setRegisterError(null)
    setRegisterMessage(null)

    const webUrl = import.meta.env.VITE_APPS_SCRIPT_WEBAPP_URL?.trim()
    if (!webUrl) {
      setRegisterError(
        '.env에 VITE_APPS_SCRIPT_WEBAPP_URL(Apps Script 웹 앱 배포 URL)을 설정하세요.',
      )
      return
    }

    const payload = {
      defense1: registerForm.defense1.trim(),
      defense2: registerForm.defense2.trim(),
      defense3: registerForm.defense3.trim(),
      attack1: registerForm.attack1.trim(),
      attack2: registerForm.attack2.trim(),
      attack3: registerForm.attack3.trim(),
      comment: registerForm.comment.trim(),
    }

    const values = Object.values(payload)
    if (values.some((v) => !v)) {
      setRegisterError('방어·공격·코멘트를 모두 입력하세요.')
      return
    }

    setRegisterSubmitting(true)
    try {
      await postGuideToAppsScript(webUrl, payload)
      setRegisterForm(emptyRegisterForm)
      setRegisterMessage('등록되었습니다. 목록을 갱신했습니다.')
      setReloadKey((k) => k + 1)
    } catch (err) {
      setRegisterError(
        err instanceof Error ? err.message : '등록에 실패했습니다.',
      )
    } finally {
      setRegisterSubmitting(false)
    }
  }

  const updateRegister = (key: keyof RegisterFormState, value: string) => {
    setRegisterForm((prev) => ({ ...prev, [key]: value }))
    setRegisterMessage(null)
    setRegisterError(null)
  }

  useEffect(() => {
    const url = import.meta.env.VITE_OPENSHEET_URL?.trim()
    const ac = new AbortController()

    async function load() {
      if (!url) {
        setError(
          'VITE_OPENSHEET_URL이 비어 있습니다. 프로젝트 루트에 .env 파일을 만들고 OpenSheet 전체 URL을 설정하세요.',
        )
        setRows([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const data = await fetchOpenSheetRows(url, ac.signal)
        setRows(data)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message =
          err instanceof Error ? err.message : '시트를 불러오지 못했습니다.'
        setError(message)
        setRows([])
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => ac.abort()
  }, [reloadKey])

  useEffect(() => {
    const q1 = defense1.trim()
    const q2 = defense2.trim()
    const q3 = defense3.trim()
    setFilteredResults(
      rows.filter((row) => matchesDefenseFilters(row, q1, q2, q3)),
    )
  }, [rows, defense1, defense2, defense3])

  const retry = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  return (
    <div className="app">
      <main className="main">
        <header className="page-header">
          <div className="header-top">
            <h1 className="title">공략 검색 사이트</h1>
            {isLoggedIn && auth && (
              <div className="session-bar">
                <span className="session-user">{auth.userId} 로그인 중</span>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleLogout}
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
          <p className="subtitle">
            OpenSheet의 <strong>strategies</strong> 탭 데이터를 불러옵니다. 로그인은
            Apps Script가 <strong>users</strong> 시트(id·password)와 대조합니다.
            방어 검색은 includes 부분 일치입니다.
          </p>
        </header>

        {!isLoggedIn && (
          <section className="card auth-card" aria-labelledby="login-heading">
            <h2 id="login-heading" className="card-title">
              로그인
            </h2>
            <form className="auth-form" onSubmit={handleLogin}>
              <div className="field">
                <label htmlFor="login-id">ID</label>
                <input
                  id="login-id"
                  name="username"
                  type="text"
                  className="field-input"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="login-password">비밀번호</label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  className="field-input"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {loginError && (
                <p className="form-error" role="alert">
                  {loginError}
                </p>
              )}
              <button
                type="submit"
                className="retry-button auth-submit"
                disabled={loginSubmitting}
              >
                {loginSubmitting ? '확인 중…' : '로그인'}
              </button>
            </form>
          </section>
        )}

        <section className="card search-card" aria-labelledby="search-heading">
          <h2 id="search-heading" className="card-title">
            검색 조건
          </h2>
          <div className="fields">
            <AutocompleteField
              id="defense-1"
              label="방어1"
              value={defense1}
              onChange={setDefense1}
              options={defense1Options}
              placeholder="예: 화염"
              disabled={loading && rows.length === 0}
              maxSuggestions={5}
            />
            <AutocompleteField
              id="defense-2"
              label="방어2"
              value={defense2}
              onChange={setDefense2}
              options={defense2Options}
              placeholder="예: 독"
              disabled={loading && rows.length === 0}
              maxSuggestions={5}
            />
            <AutocompleteField
              id="defense-3"
              label="방어3"
              value={defense3}
              onChange={setDefense3}
              options={defense3Options}
              placeholder="예: 빙결"
              disabled={loading && rows.length === 0}
              maxSuggestions={5}
            />
          </div>
        </section>

        {isLoggedIn && (
          <section
            className="card register-card"
            aria-labelledby="register-heading"
          >
            <h2 id="register-heading" className="card-title">
              공략 등록
            </h2>
            <p className="register-lead">
              strategies 시트 열 순서에 맞춰 등록합니다. 자동완성은 기존 행 기준입니다.
            </p>
            <form className="register-form" onSubmit={handleRegisterSubmit}>
              <div className="register-grid">
                <AutocompleteField
                  id="reg-d1"
                  label="방어1"
                  value={registerForm.defense1}
                  onChange={(v) => updateRegister('defense1', v)}
                  options={defense1Options}
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="reg-d2"
                  label="방어2"
                  value={registerForm.defense2}
                  onChange={(v) => updateRegister('defense2', v)}
                  options={defense2Options}
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="reg-d3"
                  label="방어3"
                  value={registerForm.defense3}
                  onChange={(v) => updateRegister('defense3', v)}
                  options={defense3Options}
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="reg-a1"
                  label="공격1"
                  value={registerForm.attack1}
                  onChange={(v) => updateRegister('attack1', v)}
                  options={attack1Options}
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="reg-a2"
                  label="공격2"
                  value={registerForm.attack2}
                  onChange={(v) => updateRegister('attack2', v)}
                  options={attack2Options}
                  maxSuggestions={5}
                />
                <AutocompleteField
                  id="reg-a3"
                  label="공격3"
                  value={registerForm.attack3}
                  onChange={(v) => updateRegister('attack3', v)}
                  options={attack3Options}
                  maxSuggestions={5}
                />
                <div className="field field-span">
                  <label htmlFor="reg-comment">코멘트</label>
                  <input
                    id="reg-comment"
                    type="text"
                    className="field-input"
                    value={registerForm.comment}
                    onChange={(e) =>
                      updateRegister('comment', e.target.value)
                    }
                    autoComplete="off"
                  />
                </div>
              </div>
              {registerError && (
                <p className="form-error" role="alert">
                  {registerError}
                </p>
              )}
              {registerMessage && (
                <p className="register-hint register-hint--success" role="status">
                  {registerMessage}
                </p>
              )}
              <button
                type="submit"
                className="retry-button register-submit"
                disabled={registerSubmitting}
              >
                {registerSubmitting ? '등록 중…' : '등록'}
              </button>
            </form>
          </section>
        )}

        <section
          className="card results-card"
          aria-labelledby="results-heading"
          aria-live="polite"
        >
          <div className="results-header">
            <h2 id="results-heading" className="card-title">
              결과 리스트
            </h2>
            {!loading && !error && (
              <span className="results-count">{filteredResults.length}건</span>
            )}
          </div>

          {loading && (
            <div className="state-block state-block--loading" role="status">
              <span className="spinner" aria-hidden />
              시트 데이터를 불러오는 중…
            </div>
          )}

          {!loading && error && (
            <div className="state-block state-block--error" role="alert">
              <p className="state-message">{error}</p>
              <button type="button" className="retry-button" onClick={retry}>
                다시 시도
              </button>
            </div>
          )}

          {!loading && !error && filteredResults.length === 0 && (
            <p className="results-empty">조건에 맞는 행이 없습니다.</p>
          )}

          {!loading && !error && filteredResults.length > 0 && (
            <ul className="result-list">
              {filteredResults.map((row, index) => (
                <li key={row.id}>
                  <article className="result-item">
                    <h3 className="result-title">{rowHeading(row, index)}</h3>
                    <dl className="result-rows">
                      <div className="result-row">
                        <dt>방어</dt>
                        <dd>
                          {row.defense1} / {row.defense2} / {row.defense3}
                        </dd>
                      </div>
                      <div className="result-row">
                        <dt>공격</dt>
                        <dd>{attackLine(row) || '—'}</dd>
                      </div>
                      <div className="result-row">
                        <dt>코멘트</dt>
                        <dd>{row.comment || '—'}</dd>
                      </div>
                      <div className="result-row result-row--rate">
                        <dt>승률</dt>
                        <dd>
                          <span className="win-rate">
                            {formatWinRate(row.win, row.lose)}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
