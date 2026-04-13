/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OpenSheet strategies 탭 URL (예: …/스프레드시트ID/strategies) */
  readonly VITE_OPENSHEET_URL?: string
  /** Apps Script 웹 앱 배포 URL — 로그인(users) + 등록(strategies) */
  readonly VITE_APPS_SCRIPT_WEBAPP_URL?: string
  /** GitHub Pages 등 서브 경로 (예: /repo-name/) */
  readonly VITE_BASE_PATH?: string
}
