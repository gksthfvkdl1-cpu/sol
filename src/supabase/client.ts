import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

if (!url || !anon) {
  const hint =
    'seven/.env 에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 설정하세요. ' +
    '복사: .env.example → .env 후 Supabase 대시보드(Project Settings → API)의 anon public 키를 입력하세요. ' +
    '개발 서버는 .env 저장 후 재시작하세요.'
  console.error(hint)
  throw new Error(hint)
}

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
