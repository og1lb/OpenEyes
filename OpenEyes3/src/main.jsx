import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { StoreProvider } from './state/store.jsx'
import { AuthProvider } from './state/auth.jsx'
import './styles/tailwind.css'
import './styles/global.css'
import './styles/landing.css'
import './styles/shell.css'
import './styles/module.css'
import './styles/openeyes.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <StoreProvider>
          <App />
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
