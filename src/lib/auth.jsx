import { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { sortTags } from './tags'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const loadProfile = async uid => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    setProfile(data && { ...data, classes: sortTags(data.classes), past_classes: sortTags(data.past_classes) })
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') navigate('/reset')
      // Defer: calling supabase inside this callback can deadlock the client.
      if (s) setTimeout(() => loadProfile(s.user.id).finally(() => setLoading(false)), 0)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const refreshProfile = () => session && loadProfile(session.user.id)

  return <Ctx.Provider value={{ session, profile, loading, refreshProfile }}>{children}</Ctx.Provider>
}
