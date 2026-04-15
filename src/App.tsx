import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import './App.css'
import './guide.css'
import {
  getSessionToken,
  loadSessionFromToken,
  signOutEverywhere,
  type UserSession,
} from './authSession.ts'
import { SESSION_TOKEN_STORAGE_KEY } from './lib/sessionToken.ts'
import { GuideApp } from './GuideApp.tsx'
import { LoginGate } from './LoginGate.tsx'
import { RegisterGate } from './RegisterGate.tsx'

export default function App() {
  const [session, setSession] = useState<UserSession | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function syncSession() {
      const token = getSessionToken()
      if (!token) {
        if (!cancelled) {
          setSession(null)
          setAuthReady(true)
        }
        return
      }
      const s = await loadSessionFromToken(token)
      if (cancelled) return
      if (!s) {
        await signOutEverywhere()
        setSession(null)
        setAuthReady(true)
        return
      }
      setSession(s)
      setAuthReady(true)
    }

    void syncSession()
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_TOKEN_STORAGE_KEY) return
      if (e.newValue === null && e.oldValue != null) {
        setSession(null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
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
