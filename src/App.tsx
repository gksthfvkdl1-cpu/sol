import { useState, type FormEvent } from 'react'
import './App.css'
import './guide.css'
import { apiJson } from './api/client.ts'
import {
  clearSession,
  readSession,
  saveSession,
  type UserSession,
} from './authSession.ts'
import { GuideApp } from './GuideApp.tsx'

type LoginResponse = {
  token: string
  user: { id: number; username: string; displayName: string }
}

export default function App() {
  const [session, setSession] = useState<UserSession | null>(() => readSession())
  const [loginId, setLoginId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginSubmitting, setLoginSubmitting] = useState(false)

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    const id = loginId.trim()
    if (!id || !loginPassword) {
      setLoginError('아이디와 비밀번호를 입력하세요.')
      return
    }
    setLoginSubmitting(true)
    try {
      const res = await apiJson<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: id, password: loginPassword }),
      })
      const next: UserSession = {
        token: res.token,
        username: res.user.username,
        displayName: res.user.displayName,
      }
      saveSession(next)
      setSession(next)
      setLoginPassword('')
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '로그인 실패')
    } finally {
      setLoginSubmitting(false)
    }
  }

  const handleLogout = () => {
    clearSession()
    setSession(null)
    setLoginError(null)
  }

  if (session) {
    return <GuideApp session={session} onLogout={handleLogout} />
  }

  return (
    <div className="app app--gate">
      <main className="main main--gate">
        <header className="page-header page-header--gate">
          <div className="guide-brand-icon" aria-hidden>
            🛡️
          </div>
          <h1 className="guide-login-title">EPYON 공략집</h1>
          <p className="guide-login-sub">
            SQLite API 서버가 실행 중이어야 합니다. (
            <code>npm run dev</code>)
          </p>
        </header>
        <section className="card auth-card auth-card--gate" aria-labelledby="login-heading">
          <h2 id="login-heading" className="card-title">
            로그인
          </h2>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            데모 계정: <strong>test</strong> / <strong>test123</strong>
          </p>
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
      </main>
    </div>
  )
}
