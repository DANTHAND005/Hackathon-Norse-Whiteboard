import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const isNku = e => e.trim().toLowerCase().endsWith('@nku.edu')
const BACK = import.meta.env.BASE_URL // site root; Supabase appends ?code=... here

function plainError(error) {
  const m = (error.message || '').toLowerCase()
  if (m.includes('invalid login')) return 'Wrong email or password.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'That email already has an account.'
  if (m.includes('database error') || m.includes('nku.edu')) return 'Use your @nku.edu email.'
  if (m.includes('rate') || m.includes('seconds')) return 'Too many tries. Wait a minute and try again.'
  if (m.includes('expired') || m.includes('invalid')) return 'Link expired, request a new one.'
  return `Something went wrong: ${error.message || 'unknown error'}`
}

export function PasswordInput({ id, label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="pw">
        <input id={id} className="input" type={show ? 'text' : 'password'} value={value} required minLength={8}
          onChange={e => onChange(e.target.value)} autoComplete={autoComplete} placeholder="••••••••" />
        <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" />
            {show && <path d="M3 3l18 18" />}
          </svg>
        </button>
      </div>
    </div>
  )
}

export function AuthCard({ children }) {
  return (
    <main className="auth-wrap">
      <div className="card hero auth-card">
        <img className="logo" src={`${BACK}nku-norse.png`} alt="NKU Norse logo" />
        <h1><span>Norse</span> <span className="hl"><span>Whiteboard</span></span></h1>
        <p className="sub">Study together. Ask the board.</p>
        {children}
      </div>
    </main>
  )
}

export default function Login() {
  const [mode, setMode] = useState('signin') // signin | signup | sent
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState({ text: '', ok: false })
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const say = (text, ok = false) => setMsg({ text, ok })
  const go = m => { setMode(m); say('') }

  async function submit(e) {
    e.preventDefault()
    if (!isNku(email)) return say('Use your @nku.edu email.')
    if (mode === 'signup' && pass !== confirm) return say('Passwords do not match.')
    setBusy(true)
    const em = email.trim()
    const { error } = mode === 'signup'
      ? await supabase.auth.signUp({ email: em, password: pass, options: { data: { full_name: name.trim() } } })
      : await supabase.auth.signInWithPassword({ email: em, password: pass })
    setBusy(false)
    if (error) return say(plainError(error))
    navigate('/') // guard sends first-timers to onboarding
  }

  async function sendReset() {
    if (!isNku(email)) return say('Type your @nku.edu email above first.')
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: BACK })
    setBusy(false)
    if (error) return say(plainError(error))
    setMode('sent'); say('')
  }

  if (mode === 'sent') return (
    <AuthCard>
      <h2 className="auth-h2">Check your email</h2>
      <p className="sub">We sent a reset link to <b>{email}</b>.</p>
      <button className="btn" onClick={sendReset} disabled={busy}>Resend</button>
      <p className="msg" role="status" aria-live="polite" data-ok={msg.ok}>{msg.text}</p>
      <p className="foot"><a href="#/login" onClick={e => { e.preventDefault(); go('signin') }}>Back to sign in</a></p>
    </AuthCard>
  )

  const up = mode === 'signup'
  return (
    <AuthCard>
      <form onSubmit={submit} className="auth-form">
        {up && (
          <div>
            <label htmlFor="name">Account name</label>
            <input id="name" className="input" value={name} onChange={e => setName(e.target.value)}
              autoComplete="name" placeholder="First Last" required />
          </div>
        )}
        <div>
          <label htmlFor="email">NKU email</label>
          <input id="email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
            autoComplete="username" placeholder="you@nku.edu" required />
        </div>
        <PasswordInput id="pass" label="Password" value={pass} onChange={setPass}
          autoComplete={up ? 'new-password' : 'current-password'} />
        {up && <PasswordInput id="confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />}
        {!up && <div className="row"><a href="#/login" onClick={e => { e.preventDefault(); sendReset() }}>Forgot password?</a></div>}
        <button className="btn big" type="submit" disabled={busy}>
          {busy ? <span className="spinner" aria-label="Working" /> : up ? 'Create account' : 'Sign in'}
        </button>
        <p className="msg" role="status" aria-live="polite" data-ok={msg.ok}>{msg.text}</p>
      </form>
      <p className="foot">
        {up ? 'Have an account?' : 'New here?'}{' '}
        <a href="#/login" onClick={e => { e.preventDefault(); go(up ? 'signin' : 'signup') }}>{up ? 'Sign in' : 'Create an account'}</a>
      </p>
    </AuthCard>
  )
}
