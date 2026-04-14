import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toAuthEmail } from './lib/authEmail.ts'
import { supabase } from './supabase/client.ts'
import { BrandLogo } from './BrandLogo.tsx'
import {
  clearLoginBgForUser,
  readLoginBgForUser,
  writeLoginBgForUser,
} from './loginBgStorage.ts'

export function RegisterGate() {
  const navigate = useNavigate()
  const [regId, setRegId] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regNickname, setRegNickname] = useState('')
  const [regError, setRegError] = useState<string | null>(null)
  const [regSubmitting, setRegSubmitting] = useState(false)

  const [loginBg, setLoginBg] = useState<string | null>(null)
  const bgFileRef = useRef<HTMLInputElement>(null)

  const bgUsername = regId.trim()

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

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    setRegError(null)
    const id = regId.trim()
    const pw = regPassword
    const nick = regNickname.trim()
    if (!id || !pw || !nick) {
      setRegError('아이디, 비밀번호, 닉네임을 모두 입력하세요.')
      return
    }
    if (id.length < 2) {
      setRegError('아이디는 2자 이상이어야 합니다.')
      return
    }
    if (pw.length < 4) {
      setRegError('비밀번호는 4자 이상이어야 합니다.')
      return
    }
    if (id.toLowerCase() === 'admin') {
      setRegError('사용할 수 없는 아이디입니다.')
      return
    }
    setRegSubmitting(true)
    try {
      const email = toAuthEmail(id)
      const { error } = await supabase.auth.signUp({
        email,
        password: pw,
        options: {
          data: {
            username: id,
            display_name: nick,
          },
        },
      })
      if (error) {
        setRegError(error.message || '신청 실패')
        return
      }
      await supabase.auth.signOut()
      window.alert('가입 신청이 접수되었습니다.\n관리자에게 문의하시오.')
      navigate('/', { replace: true, state: { loginId: id } })
    } catch (err) {
      setRegError(err instanceof Error ? err.message : '신청 실패')
    } finally {
      setRegSubmitting(false)
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
            aria-label="회원가입"
          >
            <div className="gate-login-card-head gate-login-card-head--split">
              <Link to="/" className="gate-back-link">
                ← 로그인
              </Link>
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

            <h2 className="gate-page-subtitle">회원가입</h2>
            <p className="gate-register-hint gate-register-hint--compact">
              가입 신청 후 관리자 승인 시 로그인할 수 있습니다.
            </p>

            <form className="gate-login-form" onSubmit={handleRegister}>
              <div className="field gate-field">
                <label htmlFor="reg-id">아이디</label>
                <input
                  id="reg-id"
                  name="regUsername"
                  type="text"
                  className="gate-field-input"
                  value={regId}
                  onChange={(e) => setRegId(e.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="field gate-field">
                <label htmlFor="reg-password">비밀번호</label>
                <input
                  id="reg-password"
                  name="regPassword"
                  type="password"
                  className="gate-field-input"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="field gate-field">
                <label htmlFor="reg-nick">닉네임</label>
                <input
                  id="reg-nick"
                  name="nickname"
                  type="text"
                  className="gate-field-input"
                  value={regNickname}
                  onChange={(e) => setRegNickname(e.target.value)}
                  autoComplete="nickname"
                  required
                />
              </div>
              {regError && (
                <p className="gate-form-error" role="alert">
                  {regError}
                </p>
              )}
              <button
                type="submit"
                className="gate-btn-blue"
                disabled={regSubmitting}
              >
                {regSubmitting ? '처리 중…' : '가입 신청'}
              </button>
            </form>
          </section>
        </main>
      </div>
    </div>
  )
}
