import { loginInputToAuthEmail } from './authEmail.ts'
import { supabase } from '../supabase/client.ts'

/** 빌드에 두 값이 모두 있으면 접속 시 자동 로그인(관리자 화면 기본 표시용) */
export function isAutoAdminConfigured(): boolean {
  const id = import.meta.env.VITE_AUTO_ADMIN_ID?.trim()
  const pw = import.meta.env.VITE_AUTO_ADMIN_PASSWORD
  return Boolean(id && pw && String(pw).length > 0)
}

export async function tryAutoAdminSignIn(): Promise<boolean> {
  if (!isAutoAdminConfigured()) return false
  const id = import.meta.env.VITE_AUTO_ADMIN_ID!.trim()
  const password = String(import.meta.env.VITE_AUTO_ADMIN_PASSWORD ?? '')
  const email = loginInputToAuthEmail(id)
  if (!email || !password) return false
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  return !error && !!data.user
}
