import { Routes, Route, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './pages/Login'
import Reset from './pages/Reset'
import Onboarding from './pages/Onboarding'
import Whiteboard from './pages/Whiteboard'
import Community from './pages/Community'
import Profile from './pages/Profile'
import Settings from './pages/Settings'

// Placeholder pages; each is replaced by its real page in a later milestone.
const Stub = ({ name }) => <main className="page"><h1>{name}</h1></main>

// Signed out -> /login. Signed in with no classes -> /onboarding.
function Guard({ children }) {
  const { session, profile, loading } = useAuth()
  const { pathname } = useLocation()
  if (loading) return <main className="page">Loading…</main>
  if (!session) return <Navigate to="/login" replace />
  if (profile && !profile.classes?.length && pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  return children
}

const Icon = ({ children }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

function Shell() {
  const { pathname } = useLocation()
  const onBoard = pathname === '/' || pathname.startsWith('/board')
  return (
    <>
      <Outlet />
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/" end className={onBoard ? 'active' : ''}>
          <Icon><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Icon>Whiteboard
        </NavLink>
        <NavLink to="/community">
          <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.7 0 4.5 1.8 4.5 4.5" /></Icon>Community
        </NavLink>
        <NavLink to="/profile" className={pathname.startsWith('/settings') ? 'active' : ''}>
          <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></Icon>Profile
        </NavLink>
      </nav>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/onboarding" element={<Guard><Onboarding /></Guard>} />
        <Route element={<Guard><Shell /></Guard>}>
          <Route path="/" element={<Whiteboard />} />
          <Route path="/board/:id" element={<Whiteboard />} />
          <Route path="/saved/:id" element={<Whiteboard readOnly />} />
          <Route path="/community" element={<Community />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
