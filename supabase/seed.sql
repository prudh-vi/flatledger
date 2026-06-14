-- ============================================================
-- seed.sql — FlatLedger demo data
-- Run in Supabase SQL editor (Dashboard → SQL Editor)
-- Safe to re-run: cleanup block removes previous attempt first.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Cleanup (reverse dependency order) ──────────────────────
DELETE FROM group_memberships
  WHERE group_id = '22222222-0000-0000-0000-000000000001';

DELETE FROM groups
  WHERE id = '22222222-0000-0000-0000-000000000001';

DELETE FROM profiles
  WHERE id IN (
    '11111111-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000003',
    '11111111-0000-0000-0000-000000000004',
    '11111111-0000-0000-0000-000000000005',
    '11111111-0000-0000-0000-000000000006'
  );

DELETE FROM auth.identities
  WHERE provider_id IN (
    'aisha@flatledger.com', 'rohan@flatledger.com', 'priya@flatledger.com',
    'meera@flatledger.com', 'sam@flatledger.com',   'dev@flatledger.com'
  );

DELETE FROM auth.users
  WHERE id IN (
    '11111111-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000003',
    '11111111-0000-0000-0000-000000000004',
    '11111111-0000-0000-0000-000000000005',
    '11111111-0000-0000-0000-000000000006'
  );

-- ── Insert ───────────────────────────────────────────────────

DO $$
DECLARE
  uid_aisha  uuid := '11111111-0000-0000-0000-000000000001';
  uid_rohan  uuid := '11111111-0000-0000-0000-000000000002';
  uid_priya  uuid := '11111111-0000-0000-0000-000000000003';
  uid_meera  uuid := '11111111-0000-0000-0000-000000000004';
  uid_sam    uuid := '11111111-0000-0000-0000-000000000005';
  uid_dev    uuid := '11111111-0000-0000-0000-000000000006';
  gid_flat   uuid := '22222222-0000-0000-0000-000000000001';
BEGIN

  -- ── 1. auth.users ─────────────────────────────────────────
  -- instance_id and is_super_admin omitted — Supabase cloud sets defaults
  INSERT INTO auth.users (
    id, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    role, aud
  ) VALUES
    (uid_aisha, 'aisha@flatledger.com', crypt('password123', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{"name":"Aisha"}',
     'authenticated', 'authenticated'),

    (uid_rohan, 'rohan@flatledger.com', crypt('password123', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{"name":"Rohan"}',
     'authenticated', 'authenticated'),

    (uid_priya, 'priya@flatledger.com', crypt('password123', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{"name":"Priya"}',
     'authenticated', 'authenticated'),

    (uid_meera, 'meera@flatledger.com', crypt('password123', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{"name":"Meera"}',
     'authenticated', 'authenticated'),

    (uid_sam, 'sam@flatledger.com', crypt('password123', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{"name":"Sam"}',
     'authenticated', 'authenticated'),

    (uid_dev, 'dev@flatledger.com', crypt('password123', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{"name":"Dev"}',
     'authenticated', 'authenticated');

  -- ── 2. auth.identities ────────────────────────────────────
  -- Each identity gets its own fresh UUID (not the user's UUID).
  -- provider_id = email for the email provider.
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES
    (gen_random_uuid(), uid_aisha,
     jsonb_build_object('sub', uid_aisha::text, 'email', 'aisha@flatledger.com'),
     'email', 'aisha@flatledger.com', now(), now(), now()),

    (gen_random_uuid(), uid_rohan,
     jsonb_build_object('sub', uid_rohan::text, 'email', 'rohan@flatledger.com'),
     'email', 'rohan@flatledger.com', now(), now(), now()),

    (gen_random_uuid(), uid_priya,
     jsonb_build_object('sub', uid_priya::text, 'email', 'priya@flatledger.com'),
     'email', 'priya@flatledger.com', now(), now(), now()),

    (gen_random_uuid(), uid_meera,
     jsonb_build_object('sub', uid_meera::text, 'email', 'meera@flatledger.com'),
     'email', 'meera@flatledger.com', now(), now(), now()),

    (gen_random_uuid(), uid_sam,
     jsonb_build_object('sub', uid_sam::text, 'email', 'sam@flatledger.com'),
     'email', 'sam@flatledger.com', now(), now(), now()),

    (gen_random_uuid(), uid_dev,
     jsonb_build_object('sub', uid_dev::text, 'email', 'dev@flatledger.com'),
     'email', 'dev@flatledger.com', now(), now(), now());

  -- ── 3. profiles ────────────────────────────────────────────
  -- on_auth_user_created trigger fires on the inserts above.
  -- This explicit insert is a safety net in case the trigger is
  -- not yet installed or already ran.
  INSERT INTO profiles (id, name, email) VALUES
    (uid_aisha, 'Aisha', 'aisha@flatledger.com'),
    (uid_rohan, 'Rohan', 'rohan@flatledger.com'),
    (uid_priya, 'Priya', 'priya@flatledger.com'),
    (uid_meera, 'Meera', 'meera@flatledger.com'),
    (uid_sam,   'Sam',   'sam@flatledger.com'),
    (uid_dev,   'Dev',   'dev@flatledger.com')
  ON CONFLICT (id) DO NOTHING;

  -- ── 4. group ───────────────────────────────────────────────
  INSERT INTO groups (id, name, created_at) VALUES
    (gid_flat, 'The Flat', '2026-02-01T00:00:00Z');

  -- ── 5. group_memberships ───────────────────────────────────
  -- Meera left_at 2026-03-31: balance check is left_at > expense_date,
  -- so March 31 expenses are excluded. Use '2026-04-01' to include them.
  -- Dev has no membership — flagged NON_MEMBER_IN_SPLIT on CSV import.
  INSERT INTO group_memberships (user_id, group_id, joined_at, left_at) VALUES
    (uid_aisha, gid_flat, '2026-02-01T00:00:00Z', NULL),
    (uid_rohan, gid_flat, '2026-02-01T00:00:00Z', NULL),
    (uid_priya, gid_flat, '2026-02-01T00:00:00Z', NULL),
    (uid_meera, gid_flat, '2026-02-01T00:00:00Z', '2026-03-31T00:00:00Z'),
    (uid_sam,   gid_flat, '2026-04-10T00:00:00Z', NULL);

END $$;
