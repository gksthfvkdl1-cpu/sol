import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    /** 예: https://gksthfvkdl1-cpu.github.io/sol/ → VITE_BASE_PATH=/sol/ */
    base: env.VITE_BASE_PATH?.trim() || '/',
    server: {
      proxy: {
        '/api': { target: 'http://localhost:3001', changeOrigin: true },
      },
    },
  }
})
