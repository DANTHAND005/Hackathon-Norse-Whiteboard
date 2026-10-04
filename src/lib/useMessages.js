// Everything the Messages panel needs: my conversations, who is in them, last message and unread counts.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useMessages(uid) {
  const [convs, setConvs] = useState([])
  const [people, setPeople] = useState({}) // id -> { display_name, classes, past_classes }
  const [blocked, setBlocked] = useState(new Set())

  const load = useCallback(async () => {
    const { data: mine } = await supabase.from('conversation_members').select('conversation_id,last_read_at').eq('user_id', uid)
    const ids = (mine || []).map(m => m.conversation_id)
    if (!ids.length) return setConvs([])
    const readAt = Object.fromEntries(mine.map(m => [m.conversation_id, m.last_read_at]))

    const [cv, mem, msgs, bl] = await Promise.all([
      supabase.from('conversations').select('*').in('id', ids),
      supabase.from('conversation_members').select('conversation_id,user_id').in('conversation_id', ids),
      supabase.from('messages').select('conversation_id,sender,body,board_id,created_at').in('conversation_id', ids)
        .order('created_at', { ascending: false }).limit(500),
      supabase.from('blocks').select('blocked').eq('blocker', uid),
    ])
    const meetupIds = (cv.data || []).filter(c => c.meetup_id).map(c => c.meetup_id)
    const meetups = meetupIds.length
      ? (await supabase.from('meetups').select('id,title,class_tag,building,room,starts_at').in('id', meetupIds)).data || []
      : []
    const memberIds = [...new Set((mem.data || []).map(m => m.user_id))]
    const profs = memberIds.length
      ? (await supabase.from('public_profiles').select('id,display_name,classes,past_classes').in('id', memberIds)).data || []
      : []
    setPeople(Object.fromEntries(profs.map(p => [p.id, p])))
    setBlocked(new Set((bl.data || []).map(b => b.blocked)))

    const list = (cv.data || []).map(c => {
      const mine = (msgs.data || []).filter(m => m.conversation_id === c.id)
      const members = (mem.data || []).filter(m => m.conversation_id === c.id).map(m => m.user_id)
      return {
        ...c, members, others: members.filter(u => u !== uid),
        meetup: meetups.find(m => m.id === c.meetup_id) || null,
        last: mine[0] || null,
        unread: mine.filter(m => m.sender !== uid && m.created_at > readAt[c.id]).length,
      }
    })
    setConvs(list.sort((a, b) => (b.last?.created_at || b.created_at).localeCompare(a.last?.created_at || a.created_at)))
  }, [uid])

  // New messages and membership changes reload the list; Realtime only sends rows this user may read.
  useEffect(() => {
    load()
    const ch = supabase.channel(`inbox:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, uid])

  const markRead = async cid => {
    await supabase.from('conversation_members').update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', cid).eq('user_id', uid)
    load()
  }

  return { convs, people, blocked, unread: convs.reduce((n, c) => n + c.unread, 0), reload: load, markRead }
}
