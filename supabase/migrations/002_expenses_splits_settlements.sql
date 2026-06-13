-- ============================================================
-- 002: expenses, expense_splits, settlements,
--      import_sessions, import_anomalies
-- Run in Supabase SQL editor AFTER 001
-- ============================================================

-- ── split_type enum ─────────────────────────────────────────
create type split_type as enum ('EQUAL', 'UNEQUAL', 'PERCENTAGE', 'SHARE');

-- ── expenses ────────────────────────────────────────────────
create table if not exists expenses (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references groups (id) on delete cascade,
  description        text not null,
  paid_by_user_id    uuid not null references profiles (id) on delete restrict,
  total_amount_paise bigint not null check (total_amount_paise <> 0),
  currency           text not null default 'INR',
  split_type         split_type not null default 'EQUAL',
  expense_date       date not null,
  is_settlement      boolean not null default false,
  is_deleted         boolean not null default false,
  created_at         timestamptz not null default now()
);

-- ── expense_splits ───────────────────────────────────────────
create table if not exists expense_splits (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references expenses (id) on delete cascade,
  user_id      uuid not null references profiles (id) on delete restrict,
  amount_paise bigint not null,
  unique (expense_id, user_id)
);

-- ── settlements ──────────────────────────────────────────────
create table if not exists settlements (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups (id) on delete cascade,
  from_user_id  uuid not null references profiles (id) on delete restrict,
  to_user_id    uuid not null references profiles (id) on delete restrict,
  amount_paise  bigint not null check (amount_paise > 0),
  settled_at    timestamptz not null default now()
);

-- ── import_sessions ──────────────────────────────────────────
create type import_status as enum ('PENDING', 'REVIEWED', 'COMMITTED', 'FAILED');

create table if not exists import_sessions (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references groups (id) on delete cascade,
  created_by      uuid not null references profiles (id) on delete restrict,
  status          import_status not null default 'PENDING',
  total_rows      integer not null default 0,
  anomalies_count integer not null default 0,
  created_at      timestamptz not null default now()
);

-- ── import_anomalies ─────────────────────────────────────────
create table if not exists import_anomalies (
  id                uuid primary key default gen_random_uuid(),
  import_session_id uuid not null references import_sessions (id) on delete cascade,
  row_number        integer not null,
  raw_row           jsonb not null,
  anomaly_type      text not null,
  description       text not null,
  action_taken      text,
  requires_approval boolean not null default false,
  approved          boolean
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table expenses         enable row level security;
alter table expense_splits   enable row level security;
alter table settlements      enable row level security;
alter table import_sessions  enable row level security;
alter table import_anomalies enable row level security;

-- helper: is the current user a member of a given group?
create or replace function is_group_member(gid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from group_memberships
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- ── expenses policies ────────────────────────────────────────

create policy "expenses: read"
  on expenses for select
  using (is_group_member(group_id));

create policy "expenses: insert"
  on expenses for insert
  with check (is_group_member(group_id));

create policy "expenses: soft delete"
  on expenses for update
  using (is_group_member(group_id));

-- ── expense_splits policies ──────────────────────────────────

create policy "splits: read"
  on expense_splits for select
  using (
    exists (
      select 1 from expenses e
      where e.id = expense_splits.expense_id
        and is_group_member(e.group_id)
    )
  );

create policy "splits: insert"
  on expense_splits for insert
  with check (
    exists (
      select 1 from expenses e
      where e.id = expense_splits.expense_id
        and is_group_member(e.group_id)
    )
  );

-- ── settlements policies ─────────────────────────────────────

create policy "settlements: read"
  on settlements for select
  using (is_group_member(group_id));

create policy "settlements: insert"
  on settlements for insert
  with check (is_group_member(group_id));

-- ── import_sessions policies ─────────────────────────────────

create policy "import_sessions: read"
  on import_sessions for select
  using (is_group_member(group_id));

create policy "import_sessions: insert"
  on import_sessions for insert
  with check (is_group_member(group_id));

create policy "import_sessions: update"
  on import_sessions for update
  using (is_group_member(group_id));

-- ── import_anomalies policies ────────────────────────────────

create policy "import_anomalies: read"
  on import_anomalies for select
  using (
    exists (
      select 1 from import_sessions s
      where s.id = import_anomalies.import_session_id
        and is_group_member(s.group_id)
    )
  );

create policy "import_anomalies: insert"
  on import_anomalies for insert
  with check (
    exists (
      select 1 from import_sessions s
      where s.id = import_anomalies.import_session_id
        and is_group_member(s.group_id)
    )
  );

create policy "import_anomalies: update approval"
  on import_anomalies for update
  using (
    exists (
      select 1 from import_sessions s
      where s.id = import_anomalies.import_session_id
        and is_group_member(s.group_id)
    )
  );
