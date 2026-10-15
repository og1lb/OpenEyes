import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import StatusBar from './components/StatusBar.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import AccessGate from './components/AccessGate.jsx'
import Landing from './pages/Landing.jsx'
import Admin, {KeyGenerator} from './pages/Admin.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ModulePage from './pages/ModulePage.jsx'
import History from './pages/History.jsx'
import Settings from './pages/Settings.jsx'
import Redeem from './pages/Redeem.jsx'
import NotFound from './pages/NotFound.jsx'
import { Login, Register } from './pages/Auth.jsx'
import MapPage from './pages/Map.jsx'
import EyeCursor from './components/EyeCursor.jsx'

function Panel() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    setNavOpen(false)
    document.querySelector('.content')?.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="shell"><EyeCursor />
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />

      <div className="main">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} onToggleSidebar={() => setNavOpen((o) => !o)} />
        <main className="content">
          <div className="route-view" key={location.pathname}>
            <Routes location={location}>
              <Route index element={<Dashboard />} />
              <Route path="module/:moduleId" element={<ModulePage />} />
              <Route path="history" element={<History />} />
              <Route path="settings" element={<Settings />} />
              <Route path="redeem" element={<Redeem />} />
              <Route path="map" element={<MapPage />} />
              <Route path="admin" element={<Admin />} />
              <Route path="admin/keys" element={<KeyGenerator />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </main>
      </div>

      <StatusBar />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

export default function App() {
  const location = useLocation()

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0 })
      return
    }

    const id = location.hash.slice(1)
    let frame = 0
    let tries = 0
    const look = () => {
      const target = document.getElementById(id)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      if (tries++ < 30) frame = requestAnimationFrame(look)
    }
    frame = requestAnimationFrame(look)
    return () => cancelAnimationFrame(frame)
  }, [location.pathname, location.hash])

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/panel/*"
        element={
          <AccessGate>
            <Panel />
          </AccessGate>
        }
      />
      <Route path="/admin" element={<Navigate to="/panel/admin" replace />} />
      <Route path="/admin/keys" element={<Navigate to="/panel/admin/keys" replace />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  )
}
