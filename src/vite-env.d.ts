/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 비우면 브라우저가 같은 출처의 `/api` 호출 → Vite 프록시(개발) */
  readonly VITE_API_URL?: string
  /** GitHub Pages 등 서브 경로 (예: /sol/) */
  readonly VITE_BASE_PATH?: string
}
