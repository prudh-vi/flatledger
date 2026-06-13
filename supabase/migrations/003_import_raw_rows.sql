-- ============================================================
-- 003: add raw_rows storage to import_sessions for Phase 2
-- ============================================================

alter table import_sessions
  add column if not exists raw_rows jsonb not null default '[]'::jsonb;
