import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Top-level error boundary. A single throw inside any deeply-nested IIFE
// in App.jsx (Demographics, Optimisation, Targeting and others) used to
// blank the entire dashboard to a white screen. This catches the throw,
// logs it for the developer, and shows the user a recoverable "refresh"
// panel instead of nothing.
class RootErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: '', errorStack: '' }
  }
  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: (error && (error.message || String(error))) || 'Unknown error',
      errorStack: (error && error.stack) || ''
    }
  }
  componentDidCatch(error, info) {
    console.error('[GAS] Render error caught by boundary:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#06020e',
          color: '#fffbf8',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: 24
        }}>
          <div style={{
            maxWidth: 640,
            textAlign: 'center',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: '36px 32px'
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 800,
              color: '#FF6B00',
              letterSpacing: 3,
              textTransform: 'uppercase',
              marginBottom: 14
            }}>Something went wrong</div>
            <div style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 18, color: 'rgba(255,251,248,0.85)' }}>
              The dashboard hit an unexpected error rendering this view. Refreshing the page usually fixes it. If it keeps happening, send Gary the technical detail below so he can pinpoint the bug.
            </div>
            <div style={{
              textAlign: 'left',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,107,0,0.25)',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 18,
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: 11,
              lineHeight: 1.5,
              color: '#fbd5b5',
              maxHeight: 240,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              <div style={{ fontWeight: 700, color: '#FF6B00', marginBottom: 6 }}>{this.state.errorMessage}</div>
              {this.state.errorStack && <div style={{ color: 'rgba(251,213,181,0.7)', fontSize: 10 }}>{this.state.errorStack}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  const text = this.state.errorMessage + '\n\n' + this.state.errorStack
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text)
                  }
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,107,0,0.5)',
                  color: '#FF6B00',
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  padding: '12px 22px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >Copy detail</button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: 'linear-gradient(135deg,#FF6B00,#F96203)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  padding: '12px 28px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >Refresh</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
