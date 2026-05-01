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
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
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
            maxWidth: 480,
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
            <div style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 22, color: 'rgba(255,251,248,0.85)' }}>
              The dashboard hit an unexpected error rendering this view. Refreshing the page usually fixes it. If it keeps happening, let Gary know which tab and date range you were on.
            </div>
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
