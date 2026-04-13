import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' }

  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error(err, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            background: '#f8fafc',
            color: '#0f172a',
          }}
        >
          <h1 style={{ fontSize: '1.25rem' }}>화면을 불러오지 못했습니다</h1>
          <p style={{ marginTop: 8, color: '#475569' }}>{this.state.message}</p>
          <p style={{ marginTop: 16, fontSize: '0.9rem', color: '#64748b' }}>
            브라우저 새로고침(F5) 후에도 같으면 개발자 도구(F12) → Console 탭의
            오류를 확인해 주세요.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('#root 요소가 없습니다.')
}

createRoot(rootEl).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
