/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** 로그인 ID → 이메일 조합용 도메인 (미설정 시 gmail.com) */
  readonly VITE_AUTH_EMAIL_DOMAIN?: string
  /** GitHub Pages 등 서브 경로 (예: /sol/) */
  readonly VITE_BASE_PATH?: string
  /**
   * 설정 시 접속 즉시 해당 계정으로 로그인(비밀번호는 번들에 포함됨 — 공개 저장소 비권장)
   */
  readonly VITE_AUTO_ADMIN_ID?: string
  readonly VITE_AUTO_ADMIN_PASSWORD?: string
  /** 첫 화면 탭 (예: admin=등록/수정). 미설정이고 VITE_AUTO_ADMIN_ID 가 있으면 관리자일 때 admin */
  readonly VITE_INITIAL_NAV?: string
  /** Cloudinary 업로드(관리자 초상화). Unsigned preset + cloud name */
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string
  readonly VITE_CLOUDINARY_UPLOAD_PRESET?: string
}
