import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import './App.css'
import './guide.css'
import {
  buildSession,
  isPrivilegedAccount,
  loadProfile,
  signOutEverywhere,
  type UserSession,
} from './authSession.ts'
import { isAutoAdminConfigured, tryAutoAdminSignIn } from './lib/autoAdminLogin.ts'
import { supabase } from './supabase/client.ts'
import { GuideApp } from './GuideApp.tsx'
import { LoginGate } from './LoginGate.tsx'
import { RegisterGate } from './RegisterGate.tsx'

export default function App() {
  const [session, setSession] = useState<UserSession | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function syncSession() {
      let {
        data: { session: s },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (!s?.user && isAutoAdminConfigured()) {
        await tryAutoAdminSignIn()
        if (cancelled) return
        s = (await supabase.auth.getSession()).data.session
      }
      if (!s?.user) {
        setSession(null)
        setAuthReady(true)
        return
      }
      const prof = await loadProfile(s.user.id)
      if (cancelled) return
      if (!prof) {
        await supabase.auth.signOut()
        setSession(null)
        setAuthReady(true)
        return
      }
      if (prof.rejected) {
        await supabase.auth.signOut()
        if (!cancelled) window.alert('가입이 거절된 계정입니다.')
        setSession(null)
        setAuthReady(true)
        return
      }
      if (!prof.approved && !isPrivilegedAccount(prof, s.user.email)) {
        await supabase.auth.signOut()
        if (!cancelled) window.alert('관리자 승인 후 로그인할 수 있습니다.')
        setSession(null)
        setAuthReady(true)
        return
      }
      const built = await buildSession(s.user)
      if (!cancelled) setSession(built)
      setAuthReady(true)
    }

    void syncSession()

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (event === 'SIGNED_OUT' && isAutoAdminConfigured()) {
        const ok = await tryAutoAdminSignIn()
        if (!ok) setSession(null)
        return
      }
      if (!s?.user) {
        setSession(null)
        return
      }
      const prof = await loadProfile(s.user.id)
      if (
        !prof ||
        prof.rejected ||
        (!prof.approved && !isPrivilegedAccount(prof, s.user.email))
      ) {
        setSession(null)
        return
      }
      const built = await buildSession(s.user)
      setSession(built)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    await signOutEverywhere()
  }

  if (!authReady) {
    return (
      <div className="app app--gate">
        <main className="main main--gate">
          <p className="guide-placeholder">불러오는 중…</p>
        </main>
      </div>
    )
  }

  if (session) {
    return <GuideApp session={session} onLogout={() => void handleLogout()} />
  }

  return (
    <Routes>
      <Route path="/register" element={<RegisterGate />} />
      <Route path="*" element={<LoginGate onLoggedIn={setSession} />} />
    </Routes>
  )
}
