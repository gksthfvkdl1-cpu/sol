import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import './App.css'
import './guide.css'
import { buildSession, loadProfile, signOutEverywhere, type UserSession } from './authSession.ts'
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
      const {
        data: { session: s },
      } = await supabase.auth.getSession()
      if (cancelled) return
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
      if (!prof.approved) {
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

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      if (!s?.user) {
        setSession(null)
        return
      }
      const prof = await loadProfile(s.user.id)
      if (!prof || prof.rejected || !prof.approved) {
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
    setSession(null)
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
