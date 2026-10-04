import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, invokeFn } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { normalizeTag } from '../lib/tags'
import { PasswordInput } from './Login'

export default function Settings() {
  const { session, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const uid = session.user.id

  const [open, setOpen] = useState(null) // name | canvas | password | blocked | delete
  const [msg, setMsg] = useState({ text: '', ok: false })
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(profile.full_name || '')
  const [token, setToken] = useState('')
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [tag, setTag] = useState('')
  const [blocked, setBlocked] = useState([])
  const [confirm, setConfirm] = useState('')

  const say = (text, ok = false) => setMsg({ text, ok })
  const toggle = id => { setOpen(open === id ? null : id); say('') }
  const update = async fields => {
    const { error } = await supabase.from('profiles').update(fields).eq('id', uid)
    await refreshProfile()
    return !error
  }

  async function changeName(e) {
    e.preventDefault()
    if (!name.trim()) return say('Enter your name.')
    say(await update({ full_name: name.trim() }) ? 'Name updated.' : 'Could not save that.', true)
  }

  // Tags: Taking (at least 1) and Took
  async function addTag(kind) {
    const t = normalizeTag(tag)
    if (!t) return
    setTag('')
    const all = [...profile.classes, ...profile.past_classes]
    if (all.includes(t)) return say(`${t} is already in your list.`)
    say('')
    await update({ [kind]: [...profile[kind], t] })
  }
  async function removeTag(kind, t) {
    if (kind === 'classes' && profile.classes.length === 1) return say('Keep at least one class you are taking.')
    say('')
    // Dropping a class you are taking means you have taken it: it moves to Took. Removing from Took deletes it.
    await update(kind === 'classes'
      ? { classes: profile.classes.filter(x => x !== t), past_classes: [...profile.past_classes, t] }
      : { past_classes: profile.past_classes.filter(x => x !== t) })
  }

  async function reimport(e) {
    e.preventDefault()
    setBusy(true); say('')
    try {
      const data = await invokeFn('canvas-import', { token })
      await update({ classes: data.taking, past_classes: data.took })
      say(`Updated: ${data.taking.length} taking, ${data.took.length} took.`, true)
    } catch {
      say("That token didn't work. Try making a new one.")
    }
    setToken('') // never keep the token
    setBusy(false)
  }

  async function changePassword(e) {
    e.preventDefault()
    if (pw !== pw2) return say('Passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return say('Could not change the password. Try signing in again first.')
    setPw(''); setPw2(''); say('Password changed.', true)
  }

  async function viewBlocked() {
    toggle('blocked')
    const { data: rows } = await supabase.from('blocks').select('blocked').eq('blocker', uid)
    const ids = (rows || []).map(r => r.blocked)
    const { data: people } = ids.length ? await supabase.from('public_profiles').select('id,display_name').in('id', ids) : { data: [] }
    setBlocked(people || [])
  }
  async function unblock(id) {
    await supabase.from('blocks').delete().eq('blocker', uid).eq('blocked', id)
    setBlocked(blocked.filter(p => p.id !== id))
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // ponytail: removes the profile, boards, meetups and messages; uploaded images stay in storage until cleaned up.
  async function deleteAccount(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.rpc('delete_my_account')
    if (error) { setBusy(false); return say('Could not delete the account. Try again.') }
    await supabase.auth.signOut({ scope: 'local' })
    navigate('/login')
  }

  const Tags = ({ kind, took }) => profile[kind].map(t => (
    <span key={t} className={`chip ${took ? 'took' : 'taking'}`}>
      {took && '✓ '}{t}
      <button className="x" onClick={() => removeTag(kind, t)} aria-label={took ? `Remove ${t}` : `Move ${t} to Took`} title={took ? 'Remove' : 'Move to Took'}>×</button>
    </span>
  ))

  return (
    <main className="page narrow">
      <header className="comm-head">
        <h1>Settings</h1>
        <button className="btn light" onClick={() => navigate('/profile')}>Back to Profile</button>
      </header>

      <section className="set-card">
        <div className="line">
          <h3>Name</h3>
          <div>
            <div className="val"><span>{profile.full_name || 'Not set'}</span><button className="btn light" onClick={() => toggle('name')}>Change</button></div>
            {open === 'name' && (
              <form className="inline-edit" onSubmit={changeName}>
                <label className="sr-only" htmlFor="fn">Account name</label>
                <input id="fn" className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
                <button className="btn">Save</button>
              </form>
            )}
          </div>
        </div>

        <div className="line">
          <h3>Email</h3>
          <div className="val"><span>{profile.email}</span><small>read only</small></div>
        </div>

        <div className="line">
          <h3>Tags</h3>
          <div>
            <p className="hint">Taking (× moves a class to Took)</p>
            <div className="tags"><Tags kind="classes" /></div>
            <p className="hint">Took</p>
            <div className="tags">{profile.past_classes.length ? <Tags kind="past_classes" took /> : <span className="hint">None yet</span>}</div>
            <div className="inline-edit">
              <label className="sr-only" htmlFor="nt">Add a class</label>
              <input id="nt" className="input" value={tag} onChange={e => setTag(e.target.value)} placeholder="Add a class, like ASE 420"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag('classes'))} />
              <button className="btn" onClick={() => addTag('classes')}>+ Taking</button>
              <button className="btn light" onClick={() => addTag('past_classes')}>+ Took</button>
            </div>
          </div>
        </div>

        <div className="line">
          <h3>Canvas token</h3>
          <div>
            <div className="val"><span>Never stored</span><button className="btn light" onClick={() => toggle('canvas')}>Re-import from Canvas</button></div>
            {open === 'canvas' && (
              <form className="inline-edit" onSubmit={reimport}>
                <p className="hint">In Canvas: Account → Settings → New Access Token, then paste it here.</p>
                <label className="sr-only" htmlFor="ct">Canvas access token</label>
                <input id="ct" className="input" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your token" required />
                <button className="btn" disabled={busy}>{busy ? <span className="spinner" aria-label="Working" /> : 'Find my classes'}</button>
              </form>
            )}
          </div>
        </div>

        <div className="line">
          <h3>Password</h3>
          <div>
            <div className="val"><span>••••••••</span><button className="btn light" onClick={() => toggle('password')}>Change</button></div>
            {open === 'password' && (
              <form className="auth-form" onSubmit={changePassword}>
                <PasswordInput id="np" label="New password" value={pw} onChange={setPw} autoComplete="new-password" />
                <PasswordInput id="np2" label="Confirm password" value={pw2} onChange={setPw2} autoComplete="new-password" />
                <button className="btn" disabled={busy}>Save password</button>
              </form>
            )}
          </div>
        </div>

        <div className="line">
          <h3>Blocked people</h3>
          <div>
            <div className="val"><span /><button className="btn light" onClick={viewBlocked}>View</button></div>
            {open === 'blocked' && (blocked.length === 0 ? <p className="hint">You have not blocked anyone.</p> : (
              <ul className="blocked">
                {blocked.map(p => <li key={p.id}>{p.display_name}<button className="btn light" onClick={() => unblock(p.id)}>Unblock</button></li>)}
              </ul>
            ))}
          </div>
        </div>

        <p className="msg" role="status" aria-live="polite" data-ok={msg.ok}>{msg.text}</p>

        <div className="line end">
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </section>

      <div className="danger">
        <button className="btn danger-btn" onClick={() => toggle('delete')}>Delete account</button>
        {open === 'delete' && (
          <form className="danger-box" onSubmit={deleteAccount} role="alertdialog" aria-labelledby="del-h">
            <h3 id="del-h">Delete your account?</h3>
            <p>This removes your profile, your boards, your meetups and your messages. It can't be undone. Type <b>DELETE</b> to confirm.</p>
            <input className="input" value={confirm} onChange={e => setConfirm(e.target.value)} aria-label="Type DELETE" autoComplete="off" />
            <div className="form-btns">
              <button type="button" className="btn light" onClick={() => toggle('delete')}>Cancel</button>
              <button className="btn danger-btn" disabled={confirm !== 'DELETE' || busy}>Delete forever</button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
