import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { AuthCard, PasswordInput } from './Login'

export default function Reset() {
  const { session, loading } = useAuth()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function save(e) {
    e.preventDefault()
    if (pass !== confirm) return setErr('Passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pass })
    setBusy(false)
    if (error) return setErr('Link expired, request a new one.')
    navigate('/')
  }

  // No recovery session = the link was used up or expired.
  if (!loading && !session) return (
    <AuthCard>
      <p className="msg" data-ok="false">Link expired, request a new one.</p>
      <p className="foot"><a href="#/login">Back to sign in</a></p>
    </AuthCard>
  )

  return (
    <AuthCard>
      <h2 className="auth-h2">Choose a new password</h2>
      <form onSubmit={save} className="auth-form">
        <PasswordInput id="pass" label="New password" value={pass} onChange={setPass} autoComplete="new-password" />
        <PasswordInput id="confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <button className="btn big" type="submit" disabled={busy}>
          {busy ? <span className="spinner" aria-label="Working" /> : 'Save'}
        </button>
        <p className="msg" role="status" aria-live="polite" data-ok="false">{err}</p>
      </form>
    </AuthCard>
  )
}
