-- ============================================================
-- 001: profiles, groups, group_memberships
-- Run in Supabase SQL editor
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
create table if not exists profiles (
  id    uuid primary key references auth.users (id) on delete cascade,
  name  text not null,
  email text not null unique
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── groups ──────────────────────────────────────────────────
create table if not exists groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ── group_memberships ────────────────────────────────────────
create table if not exists group_memberships (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references profiles (id) on delete cascade,
  group_id  uuid not null references groups (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  unique (user_id, group_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profiles          enable row level security;
alter table groups            enable row level security;
alter table group_memberships enable row level security;

-- ── profiles policies ───────────────────────────────────────

-- Users can read any profile that shares a group with them (needed for expense display)
create policy "profiles: read co-members"
  on profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from group_memberships gm1
      join group_memberships gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid()
        and gm2.user_id = profiles.id
    )
  );

-- Users can only update their own profile
create policy "profiles: update own"
  on profiles for update
  using (id = auth.uid());

-- ── groups policies ─────────────────────────────────────────

-- Users can see groups they are (or were) a member of
create policy "groups: read own"
  on groups for select
  using (
    exists (
      select 1 from group_memberships
      where group_id = groups.id
        and user_id = auth.uid()
    )
  );

-- Any authenticated user can create a group
create policy "groups: insert"
  on groups for insert
  with check (auth.uid() is not null);

-- ── group_memberships policies ───────────────────────────────

-- Users can see all memberships in groups they belong to
create policy "memberships: read own groups"
  on group_memberships for select
  using (
    exists (
      select 1 from group_memberships gm
      where gm.group_id = group_memberships.group_id
        and gm.user_id = auth.uid()
    )
  );

-- Users can insert memberships (adding others to a group they're in)
create policy "memberships: insert"
  on group_memberships for insert
  with check (
    auth.uid() is not null
  );

-- Users can update their own membership (e.g. set left_at)
create policy "memberships: update own"
  on group_memberships for update
  using (user_id = auth.uid());
