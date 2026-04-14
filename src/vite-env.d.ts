/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 배포 시 Node 백엔드 origin (예: https://seven-api-xxxx.onrender.com), 슬래시 없음.
   * Supabase Publishable key / Project URL 과는 별개입니다.
   */
  readonly VITE_API_URL?: string
  /** GitHub Pages 등 서브 경로 (예: /sol/) */
  readonly VITE_BASE_PATH?: string
}
