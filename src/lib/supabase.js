import { createClient } from '@supabase/supabase-js'

// PKCE puts ?code=... in the query string, which doesn't collide with HashRouter's #/routes.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'http://localhost',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing-key',
  { auth: { flowType: 'pkce' } }
)

// Calls an Edge Function and returns its data, or throws an Error with the server's reason.
export async function invokeFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error || data?.error) {
    const reason = await error?.context?.json?.().catch(() => null)
    throw new Error(reason?.detail || reason?.error || data?.error || error?.message || 'failed')
  }
  return data
}
