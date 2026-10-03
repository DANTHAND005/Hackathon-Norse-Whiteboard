-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- Passwords are NOT stored here. Supabase Auth keeps them (hashed) in auth.users.
-- This table holds everything else about a student.

create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text not null,
  display_name text,
  classes      text[] not null default '{}',   -- course tags, e.g. {ASE420,MAT227}
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Any signed-in student can see profiles (needed for "Find your people").
create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);

-- You can only edit your own row.
create policy "edit own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Server-side NKU-only rule + auto-create the profile row on sign-up.
-- (The check in login.html is just for a nicer error; this is the real gate.)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) not like '%@nku.edu' then
    raise exception 'Only @nku.edu emails can sign up';
  end if;
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
