/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** 로그인 ID → 이메일 조합용 도메인 (미설정 시 gmail.com) */
  readonly VITE_AUTH_EMAIL_DOMAIN?: string
  /** GitHub Pages 등 서브 경로 (예: /sol/) */
  readonly VITE_BASE_PATH?: string
}
