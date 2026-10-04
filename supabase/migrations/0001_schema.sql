-- Norse Whiteboard schema. Run in Supabase SQL Editor (or `supabase db push`).
-- Replaces the old supabase/setup.sql. Everything is protected by RLS.

-- ───────────── helpers that need to bypass RLS (security definer) ─────────────

create table public.profiles (
  id               uuid primary key references auth.users on delete cascade,
  email            text not null,
  full_name        text,
  display_name     text check (display_name is null or char_length(display_name) between 2 and 20),
  classes          text[] not null default '{}',
  past_classes     text[] not null default '{}',
  hidden_tags      text[] not null default '{}',
  ghost_mode       boolean not null default false,
  tutor_style      text not null default 'quick' check (tutor_style in ('quick','slow','meditation','rage')),
  voice_speed      numeric not null default 1 check (voice_speed in (1, 1.5, 2)),
  language         text not null default 'en',
  message_privacy  text not null default 'everyone' check (message_privacy in ('everyone','classmates')),
  last_board_id    uuid,
  created_at       timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Only the owner reads the raw row (email + full_name stay private).
-- Everyone else goes through public_profiles below.
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Runs as view owner so it can read all rows; exposes only safe columns and hides hidden tags.
create view public.public_profiles as
  select id, display_name,
         array(select t from unnest(classes) t where t <> all (hidden_tags)) as classes,
         array(select t from unnest(past_classes) t where t <> all (hidden_tags)) as past_classes,
         ghost_mode, message_privacy
  from public.profiles;
grant select on public.public_profiles to authenticated;

-- Auth gate: @nku.edu only, then create the profile ("First L." default display name).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  nm text := coalesce(new.raw_user_meta_data->>'full_name', '');
  parts text[] := regexp_split_to_array(trim(nm), '\s+');
  dn text;
begin
  if lower(new.email) not like '%@nku.edu' then
    raise exception 'Only @nku.edu emails can sign up';
  end if;
  if nm = '' then dn := split_part(new.email, '@', 1);
  elsif array_length(parts, 1) > 1 then dn := parts[1] || ' ' || upper(left(parts[array_length(parts, 1)], 1)) || '.';
  else dn := parts[1];
  end if;
  dn := left(dn, 20);
  if char_length(dn) < 2 then dn := dn || '_'; end if;
  insert into public.profiles (id, email, full_name, display_name)
  values (new.id, new.email, nullif(nm, ''), dn);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── boards ─────────────

create table public.boards (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references public.profiles on delete cascade,
  title       text not null default 'My board',
  class_tag   text,
  is_public   boolean not null default true,
  scene       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table public.board_members (
  board_id uuid references public.boards on delete cascade,
  user_id  uuid references public.profiles on delete cascade,
  primary key (board_id, user_id)
);
alter table public.boards enable row level security;
alter table public.board_members enable row level security;

create function public.can_read_board(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.boards x
    where x.id = b and (x.is_public or x.owner = auth.uid()
      or exists (select 1 from public.board_members m where m.board_id = x.id and m.user_id = auth.uid()))
  )
$$;

create policy "read boards" on public.boards for select to authenticated using (public.can_read_board(id));
create policy "create own boards" on public.boards for insert to authenticated with check (owner = auth.uid());
create policy "anyone on board can draw" on public.boards for update to authenticated
  using (public.can_read_board(id)) with check (public.can_read_board(id));
create policy "owner deletes board" on public.boards for delete to authenticated using (owner = auth.uid());

-- Opening a private board link adds you as a member (you can only add yourself).
create policy "see own memberships" on public.board_members for select to authenticated using (user_id = auth.uid());
create policy "join board" on public.board_members for insert to authenticated with check (user_id = auth.uid());

-- Only the owner may change owner / visibility; collaborators only change scene + updated_at.
create function public.guard_board_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is distinct from old.owner
     and (new.owner <> old.owner or new.is_public <> old.is_public or new.title <> old.title or new.class_tag is distinct from old.class_tag) then
    raise exception 'Only the owner can change board settings';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger boards_guard before update on public.boards
  for each row execute function public.guard_board_update();

-- Private boards are reachable by link: this lets a signed-in user fetch a private board
-- they hold the id of, and records them as a member.
create function public.open_board(b uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.boards where id = b) then
    insert into public.board_members (board_id, user_id) values (b, auth.uid()) on conflict do nothing;
  end if;
end $$;

-- ───────────── files, presence, questions ─────────────

create table public.board_files (
  id                 uuid primary key default gen_random_uuid(),
  board_id           uuid not null references public.boards on delete cascade,
  storage_path       text not null,
  file_type          text not null check (file_type in ('image','pdf_page')),
  page_number        int,
  excalidraw_file_id text,
  created_at         timestamptz not null default now()
);
create table public.board_presence (
  board_id  uuid references public.boards on delete cascade,
  user_id   uuid references public.profiles on delete cascade,
  last_seen timestamptz not null default now(),
  primary key (board_id, user_id)
);
create table public.questions (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards on delete cascade,
  asked_by    uuid not null references public.profiles on delete cascade,
  question    text,
  answer      text,
  page_number int,
  anchor      jsonb,
  created_at  timestamptz not null default now()
);
alter table public.board_files enable row level security;
alter table public.board_presence enable row level security;
alter table public.questions enable row level security;

create policy "read files" on public.board_files for select to authenticated using (public.can_read_board(board_id));
create policy "add files" on public.board_files for insert to authenticated with check (public.can_read_board(board_id));
create policy "read presence" on public.board_presence for select to authenticated using (public.can_read_board(board_id));
create policy "write own presence" on public.board_presence for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_board(board_id));
create policy "update own presence" on public.board_presence for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own presence" on public.board_presence for delete to authenticated using (user_id = auth.uid());
create policy "read questions" on public.questions for select to authenticated using (public.can_read_board(board_id));
create policy "ask questions" on public.questions for insert to authenticated
  with check (asked_by = auth.uid() and public.can_read_board(board_id));

-- Live count for Community: number of fresh, non-ghost viewers per public board.
create view public.board_live as
  select p.board_id, count(*)::int as here
  from public.board_presence p
  join public.profiles pr on pr.id = p.user_id and not pr.ghost_mode
  join public.boards b on b.id = p.board_id and b.is_public
  where p.last_seen > now() - interval '60 seconds'
  group by p.board_id;
grant select on public.board_live to authenticated;

-- ───────────── meetups ─────────────

create table public.meetups (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid not null references public.profiles on delete cascade,
  class_tag   text not null,
  title       text not null,
  building    text,
  room        text,
  starts_at   timestamptz not null,
  max_people  int not null default 5 check (max_people between 2 and 10),
  board_id    uuid references public.boards on delete set null,
  created_at  timestamptz not null default now()
);
create table public.meetup_rsvps (
  meetup_id  uuid references public.meetups on delete cascade,
  user_id    uuid references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);
alter table public.meetups enable row level security;
alter table public.meetup_rsvps enable row level security;

create policy "read meetups" on public.meetups for select to authenticated using (true);
create policy "create meetups" on public.meetups for insert to authenticated with check (created_by = auth.uid());
create policy "edit own meetups" on public.meetups for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "delete own meetups" on public.meetups for delete to authenticated using (created_by = auth.uid());
create policy "read rsvps" on public.meetup_rsvps for select to authenticated using (true);
create policy "rsvp as self" on public.meetup_rsvps for insert to authenticated with check (user_id = auth.uid());
create policy "leave as self" on public.meetup_rsvps for delete to authenticated using (user_id = auth.uid());

-- Race-proof cap: lock the meetup row, then count.
create function public.check_rsvp_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cap int;
begin
  select max_people into cap from public.meetups where id = new.meetup_id for update;
  if cap is null then raise exception 'Meetup not found'; end if;
  if (select count(*) from public.meetup_rsvps where meetup_id = new.meetup_id) >= cap then
    raise exception 'This meetup is full';
  end if;
  return new;
end $$;
create trigger rsvp_cap before insert on public.meetup_rsvps
  for each row execute function public.check_rsvp_cap();

-- ───────────── conversations ─────────────

create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('dm','meetup')),
  meetup_id  uuid references public.meetups on delete cascade,
  created_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid references public.conversations on delete cascade,
  user_id         uuid references public.profiles on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  sender          uuid not null references public.profiles on delete cascade,
  body            text not null check (char_length(body) between 1 and 2000),
  board_id        uuid references public.boards on delete set null,
  created_at      timestamptz not null default now()
);
create table public.blocks (
  blocker uuid references public.profiles on delete cascade,
  blocked uuid references public.profiles on delete cascade,
  primary key (blocker, blocked)
);
create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  reporter      uuid not null references public.profiles on delete cascade,
  reported_user uuid not null references public.profiles on delete cascade,
  message_id    uuid references public.messages on delete set null,
  reason        text,
  created_at    timestamptz not null default now()
);
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

create function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members where conversation_id = c and user_id = auth.uid())
$$;

-- True if the other person in a DM and I have a block in either direction.
create function public.dm_blocked(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members m
    join public.blocks b on (b.blocker = auth.uid() and b.blocked = m.user_id)
                         or (b.blocked = auth.uid() and b.blocker = m.user_id)
    join public.conversations cv on cv.id = c and cv.type = 'dm'
    where m.conversation_id = c and m.user_id <> auth.uid()
  )
$$;

create policy "read my conversations" on public.conversations for select to authenticated using (public.is_member(id));
create policy "read co-members" on public.conversation_members for select to authenticated using (public.is_member(conversation_id));
create policy "update own membership" on public.conversation_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read messages" on public.messages for select to authenticated using (public.is_member(conversation_id));
create policy "send messages" on public.messages for insert to authenticated
  with check (sender = auth.uid() and public.is_member(conversation_id) and not public.dm_blocked(conversation_id));
create policy "own blocks" on public.blocks for all to authenticated
  using (blocker = auth.uid()) with check (blocker = auth.uid());
create policy "file reports" on public.reports for insert to authenticated with check (reporter = auth.uid());

-- Meetup creation: group chat + creator RSVP. RSVP changes keep chat membership in sync.
create function public.on_meetup_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.conversations (type, meetup_id) values ('meetup', new.id);
  insert into public.meetup_rsvps (meetup_id, user_id) values (new.id, new.created_by);
  return new;
end $$;
create trigger meetup_created after insert on public.meetups
  for each row execute function public.on_meetup_created();

create function public.on_rsvp_added() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.conversation_members (conversation_id, user_id)
  select id, new.user_id from public.conversations where meetup_id = new.meetup_id
  on conflict do nothing;
  return new;
end $$;
create trigger rsvp_added after insert on public.meetup_rsvps
  for each row execute function public.on_rsvp_added();

create function public.on_rsvp_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.conversation_members cm using public.conversations c
  where c.id = cm.conversation_id and c.meetup_id = old.meetup_id and cm.user_id = old.user_id;
  return old;
end $$;
create trigger rsvp_removed after delete on public.meetup_rsvps
  for each row execute function public.on_rsvp_removed();

-- Start (or reuse) a DM. Enforces message_privacy and blocks.
create function public.start_dm(other_user uuid) returns uuid
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
    insert into public.conversations (type) values ('dm') returning id into cid;
    insert into public.conversation_members (conversation_id, user_id) values (cid, me), (cid, other_user);
  end if;
  return cid;
end $$;

-- Settings → Delete account. Cascades through profiles to boards, messages, etc.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.users where id = auth.uid();
end $$;

-- Lock down RPCs to signed-in users.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.can_read_board(uuid), public.is_member(uuid), public.dm_blocked(uuid),
  public.open_board(uuid), public.start_dm(uuid), public.delete_my_account() to authenticated;

-- ───────────── storage ─────────────

insert into storage.buckets (id, name, public) values ('board-files', 'board-files', false)
  on conflict do nothing;

-- Path is {board_id}/{uuid}.png, so the first folder is the board id.
create policy "read board files" on storage.objects for select to authenticated
  using (bucket_id = 'board-files' and public.can_read_board(((storage.foldername(name))[1])::uuid));
create policy "upload board files" on storage.objects for insert to authenticated
  with check (bucket_id = 'board-files' and public.can_read_board(((storage.foldername(name))[1])::uuid));

-- ───────────── realtime ─────────────

alter publication supabase_realtime add table
  public.messages, public.meetups, public.meetup_rsvps, public.conversation_members, public.board_presence;
