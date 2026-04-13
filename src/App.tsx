import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import './App.css'
import './guide.css'
import {
  clearSession,
  readSession,
  type UserSession,
} from './authSession.ts'
import { GuideApp } from './GuideApp.tsx'
import { LoginGate } from './LoginGate.tsx'
import { RegisterGate } from './RegisterGate.tsx'

export default function App() {
  const [session, setSession] = useState<UserSession | null>(() => readSession())

  const handleLogout = () => {
    clearSession()
    setSession(null)
  }

  if (session) {
    return <GuideApp session={session} onLogout={handleLogout} />
  }

  return (
    <Routes>
      <Route path="/register" element={<RegisterGate />} />
      <Route path="*" element={<LoginGate onLoggedIn={setSession} />} />
    </Routes>
  )
}
