import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { normalizeTag, sortTags } from '../lib/tags'

export default function Onboarding() {
  const { session, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('token') // token | review | manual
  const [token, setToken] = useState('')
  const [taking, setTaking] = useState([]) // [{ tag, on }]
  const [took, setTook] = useState([])
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function findClasses(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { data, error } = await supabase.functions.invoke('canvas-import', { body: { token } })
    setBusy(false)
    setToken('') // never keep the token around
    if (error || data?.error) {
      setErr("That token didn't work. Try making a new one, or type your classes instead.")
      return
    }
    setTaking(sortTags(data.taking).map(tag => ({ tag, on: true })))
    setTook(sortTags(data.took).map(tag => ({ tag, on: true })))
    setStep('review')
  }

  const flip = (list, set, tag) => set(list.map(c => (c.tag === tag ? { ...c, on: !c.on } : c)))

  function addTyped(e) {
    e.preventDefault()
    const tag = normalizeTag(typed)
    setTyped('')
    if (!tag || taking.some(c => c.tag === tag)) return
    setErr('')
    setTaking([...taking, { tag, on: true }])
  }

  async function save() {
    const classes = taking.filter(c => c.on).map(c => c.tag)
    if (!classes.length) return setErr('Pick at least one class.')
    setBusy(true)
    const { error } = await supabase.from('profiles')
      .update({ classes, past_classes: took.filter(c => c.on).map(c => c.tag) })
      .eq('id', session.user.id)
    if (error) { setBusy(false); return setErr('Could not save. Try again.') }
    await refreshProfile()
    navigate('/')
  }

  const Chips = ({ list, set, cls }) => (
    <div className="chips">
      {list.map(c => (
        <button key={c.tag} type="button" aria-pressed={c.on} onClick={() => flip(list, set, c.tag)}
          className={`chip ${cls} ${c.on ? '' : 'off'}`}>
          {cls === 'took' && '✓ '}{c.tag}
        </button>
      ))}
    </div>
  )

  return (
    <main className="auth-wrap">
      <div className="card hero onboard">
        <h1>What are you taking this semester?</h1>

        {step === 'token' && (
          <form onSubmit={findClasses} className="auth-form">
            <p className="sub">
              We read your classes from Canvas. In Canvas go to <b>Account → Settings → New Access Token</b>,
              then paste the token here. We never save it.
            </p>
            <div>
              <label htmlFor="token">Canvas access token</label>
              <input id="token" className="input" type="password" value={token} required autoComplete="off"
                onChange={e => setToken(e.target.value)} placeholder="Paste your token" />
            </div>
            <button className="btn big" disabled={busy}>
              {busy ? <span className="spinner" aria-label="Working" /> : 'Find my classes'}
            </button>
            <p className="msg" role="status" aria-live="polite" data-ok="false">{err}</p>
            <p className="foot">
              <a href="#/onboarding" onClick={e => { e.preventDefault(); setErr(''); setStep('manual') }}>Type them instead</a>
            </p>
          </form>
        )}

        {step === 'review' && (
          <div className="auth-form">
            <h2 className="auth-h2">Taking now</h2>
            {taking.length ? <Chips list={taking} set={setTaking} cls="taking" /> : <p className="sub">None found.</p>}
            <h2 className="auth-h2">Already took</h2>
            {took.length ? <Chips list={took} set={setTook} cls="took" /> : <p className="sub">None found.</p>}
            <p className="sub">Tap a class to remove it (orientation and advising shells aren't real classes).</p>
            <button className="btn big" onClick={save} disabled={busy}>Let's go</button>
            <p className="msg" role="status" aria-live="polite" data-ok="false">{err}</p>
          </div>
        )}

        {step === 'manual' && (
          <div className="auth-form">
            <form onSubmit={addTyped}>
              <label htmlFor="tag">Add a class, like ASE 420</label>
              <input id="tag" className="input" value={typed} onChange={e => setTyped(e.target.value)} placeholder="ASE420" />
            </form>
            <Chips list={taking} set={setTaking} cls="taking" />
            <button className="btn big" onClick={save} disabled={busy}>Let's go</button>
            <p className="msg" role="status" aria-live="polite" data-ok="false">{err}</p>
          </div>
        )}
      </div>
    </main>
  )
}
