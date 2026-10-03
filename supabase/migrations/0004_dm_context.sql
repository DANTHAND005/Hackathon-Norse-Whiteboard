-- A DM remembers which sticky note the two people met through (shown next to the name in Messages).
alter table public.conversations add column met_title text, add column met_tag text;

drop function public.start_dm(uuid);

-- Start (or reuse) a DM. Enforces message_privacy and blocks. The note is only recorded when the chat is first created.
create function public.start_dm(other_user uuid, note_title text default null, note_tag text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cid uuid;
  privacy text;
begin
  if me is null or other_user = me then raise exception 'Invalid recipient'; end if;
  if exists (select 1 from public.blocks
             where (blocker = me and blocked = other_user) or (blocker = other_user and blocked = me)) then
    raise exception 'You cannot message this person';
  end if;
  select message_privacy into privacy from public.profiles where id = other_user;
  if privacy is null then raise exception 'Person not found'; end if;
  if privacy = 'classmates' and not exists (
       select 1 from public.profiles a, public.profiles b
       where a.id = me and b.id = other_user
         and (a.classes || a.past_classes) && (b.classes || b.past_classes)) then
    raise exception 'This person only accepts messages from classmates';
  end if;

  select c.id into cid from public.conversations c
  where c.type = 'dm'
    and exists (select 1 from public.conversation_members where conversation_id = c.id and user_id = me)
    and exists (select 1 from public.conversation_members where conversation_id = c.id and user_id = other_user);
  if cid is null then
    insert into public.conversations (type, met_title, met_tag)
      values ('dm', left(note_title, 60), left(note_tag, 20)) returning id into cid;
    insert into public.conversation_members (conversation_id, user_id) values (cid, me), (cid, other_user);
  end if;
  return cid;
end $$;

revoke execute on function public.start_dm(uuid, text, text) from public, anon;
grant execute on function public.start_dm(uuid, text, text) to authenticated;
