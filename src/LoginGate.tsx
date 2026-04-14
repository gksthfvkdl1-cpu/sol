import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { UserSession } from './authSession.ts'
import { setSessionToken } from './lib/sessionToken.ts'
import { supabase } from './supabase/client.ts'
import { BrandLogo } from './BrandLogo.tsx'
import {
  clearLoginBgForUser,
  readLoginBgForUser,
  writeLoginBgForUser,
} from './loginBgStorage.ts'

type Props = {
  onLoggedIn: (session: UserSession) => void
}

type LocationState = { loginId?: string }

function mapAppLoginError(code: string | undefined): string {
  switch (code) {
    case 'invalid_credentials':
      return '아이디 또는 비밀번호가 올바르지 않습니다.'
    case 'rejected':
      return '가입이 거절된 계정입니다.'
    case 'not_approved':
      return '관리자 승인 후 로그인할 수 있습니다.'
    default:
      return '로그인에 실패했습니다.'
  }
}

export function LoginGate({ onLoggedIn }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const [loginId, setLoginId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginSubmitting, setLoginSubmitting] = useState(false)

  const [loginBg, setLoginBg] = useState<string | null>(null)
  const bgFileRef = useRef<HTMLInputElement>(null)

  const bgUsername = loginId.trim()

  useEffect(() => {
    const st = location.state as LocationState | null
    if (st?.loginId) {
      setLoginId(st.loginId)
      navigate('.', { replace: true, state: null })
    }
  }, [location.state, navigate])

  useEffect(() => {
    setLoginBg(readLoginBgForUser(bgUsername))
  }, [bgUsername])

  const openBgPicker = () => {
    if (!bgUsername) {
      window.alert('먼저 아이디를 입력한 뒤 배경을 설정할 수 있습니다.')
      return
    }
    bgFileRef.current?.click()
  }

  const onBgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const u = bgUsername
    if (!u || !file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      writeLoginBgForUser(u, url)
      setLoginBg(url)
    }
    reader.readAsDataURL(file)
  }

  const clearBg = () => {
    const u = bgUsername
    if (!u) return
    clearLoginBgForUser(u)
    setLoginBg(null)
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    const id = loginId.trim().toLowerCase()
    if (!id || !loginPassword) {
      setLoginError('아이디와 비밀번호를 입력하세요.')
      return
    }
    setLoginSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('app_login', {
        p_username: id,
        p_password: loginPassword,
      })
      if (error) {
        setLoginError(error.message || '로그인 실패')
        return
      }
      const row = data as {
        ok?: boolean
        token?: string
        error?: string
        user?: {
          id: string
          username: string
          display_name: string
          is_admin: boolean
        }
      }
      if (!row?.ok || !row.token || !row.user) {
        setLoginError(mapAppLoginError(row?.error))
        return
      }
      setSessionToken(row.token)
      onLoggedIn({
        userId: String(row.user.id),
        username: String(row.user.username),
        displayName: String(row.user.display_name || row.user.username),
        isAdmin: row.user.is_admin === true,
      })
      setLoginPassword('')
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '로그인 실패')
    } finally {
      setLoginSubmitting(false)
    }
  }

  return (
    <div className="gate-root">
      {loginBg ? (
        <img
          className="gate-bg-image"
          src={loginBg}
          alt=""
          decoding="async"
        />
      ) : null}
      <div className="app app--gate">
        <main className="main main--gate main--gate-ref">
          <header className="page-header page-header--gate">
            <BrandLogo />
            <h1 className="guide-login-title guide-login-title--gate">길드전 정답지</h1>
          </header>

          <input
            ref={bgFileRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={onBgFileChange}
            tabIndex={-1}
          />

          <section
            className="card auth-card auth-card--gate gate-login-card"
            aria-label="로그인"
          >
            <div className="gate-login-card-head">
              <div className="gate-bg-actions">
                <button
                  type="button"
                  className="gate-bg-pill"
                  onClick={openBgPicker}
                  aria-label="입력한 아이디 기준 로그인 화면 배경 이미지 선택"
                >
                  배경화면 바꾸기
                </button>
                {loginBg ? (
                  <button
                    type="button"
                    className="gate-bg-pill"
                    onClick={clearBg}
                  >
                    기본 배경
                  </button>
                ) : null}
              </div>
            </div>

            <form
              id="gate-login-form"
              className="gate-login-form"
              onSubmit={handleLogin}
            >
              <div className="field gate-field">
                <label htmlFor="login-id">아이디</label>
                <input
                  id="login-id"
                  name="userId"
                  type="text"
                  className="gate-field-input"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  autoComplete="username"
                  inputMode="text"
                  spellCheck={false}
                  required
                />
              </div>
              <div className="field gate-field">
                <label htmlFor="login-password">비밀번호</label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  className="gate-field-input"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {loginError && (
                <p className="gate-form-error" role="alert">
                  {loginError}
                </p>
              )}
            </form>
            <div className="gate-btn-stack">
              <button
                type="submit"
                form="gate-login-form"
                className="gate-btn-blue"
                disabled={loginSubmitting}
              >
                {loginSubmitting ? '확인 중…' : '로그인'}
              </button>
              <Link
                to="/register"
                className="gate-btn-blue gate-btn-blue--link"
              >
                회원가입
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
