import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { InkProvider } from '@/lib/ink/react'
import App from './App'
import './index.css'
import './theme-chart.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InkProvider theme="chart">
      <App />
    </InkProvider>
  </StrictMode>,
)
