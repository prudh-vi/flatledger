# AI_USAGE.md

## Tool Used

**Claude (Anthropic)** — used as the primary development collaborator throughout this project via Claude Code (CLI). I directed Claude to implement specific features and reviewed, corrected, and modified every piece of code it produced.

---

## How I Used It

I treated Claude as a pair programmer: I defined the requirements, architecture, and policies (e.g. integer paise arithmetic, time-bound membership checks, two-phase import), and Claude wrote the implementation. I reviewed each output, caught errors, and directed corrections before committing anything.

Key prompts and the features they produced:

**Database schema**
> "Create Supabase migrations for: profiles (auto-created from auth trigger), groups, group_memberships with joined_at and left_at. Then a second migration for expenses, expense_splits (in paise, bigint), settlements, import_sessions, import_anomalies. Add RLS policies on all tables."

**Importer Phase 1**
> "Build lib/importer.ts. Phase 1: parse CSV with PapaParse, validate required columns, detect these anomaly types: [list of 16]. Each anomaly has: rowNumber, rawData, anomalyType, description, suggestedAction, requiresApproval, autoResolved. Run detectDuplicates across all rows first, then per-row detectors. Store raw_rows in import_sessions for Phase 2."

**Balance calculations**
> "Build lib/balance.ts with getGroupBalances, getUserBalanceBreakdown, createSettlement. All arithmetic in paise integers. wasActiveMember check is NON-NEGOTIABLE: joined_at <= expense_date AND (left_at IS NULL OR left_at > expense_date). Use lexicographic string comparison on YYYY-MM-DD — no Date parsing."

**UI pages**
> "Build the group detail page with three columns: members list, minimum transfers, my expense breakdown. Neo-brutalist design: cream #F5F0E8 background, lime #CCFF00 for accents, brutal black borders with 4px offset box shadows."

---

## Three Cases Where Claude Was Wrong

### 1. Created `middleware.ts` in a Next.js 16 project

**What happened**: When building the authentication guard, Claude generated a `middleware.ts` file exporting a `middleware` function — the Next.js 15 convention. Next.js 16 renamed this to `proxy.ts` with a `proxy` function. Having both files present caused a hard startup error:

```
⚠ The 'middleware' file convention is deprecated. Please use 'proxy' instead.
Both middleware file './middleware.ts' and proxy file './proxy.ts' are detected.
```

**How I caught it**: The dev server threw the error on startup after I ran `bun dev`.

**What I changed**: Deleted `middleware.ts` entirely. `proxy.ts` was already correct (it had been written first). Claude had regenerated the old convention when asked to "add auth protection." I had to explicitly tell it: "In Next.js 16, there is no middleware.ts — only proxy.ts with `export async function proxy()`. Delete middleware.ts."

Saved this to memory to prevent recurrence.

---

### 2. Missing `raw_rows` in Phase 2 of the importer

**What happened**: Claude implemented Phase 2 (`confirmImport`) to reload the original CSV rows from the database. But Phase 1 hadn't been written to store the raw rows — it only stored anomaly records. Phase 2 had no source to read from.

**How I caught it**: Code review before running. The `confirmImport` function called `session.raw_rows` but the `import_sessions` table had no such column.

**What I changed**: Added migration `003_import_raw_rows.sql` to add the `raw_rows jsonb` column, and updated Phase 1 to include `raw_rows: rows` in the session insert. Claude had assumed the column existed without checking the schema it had written earlier in the same session.

---

### 3. `SHARE` missing from valid split types in the importer

**What happened**: Claude implemented `SPLIT_TYPE_MISMATCH` detection with `VALID_SPLIT_TYPES = ["EQUAL", "PERCENTAGE", "EXACT", "SETTLEMENT"]`. The app supports `SHARE` as a split type (it's in the `split_type` enum in the DB, in the expense form, and in `computeSplits`), but Claude forgot to add it to the valid list in the importer.

**How I caught it**: Auditing the importer against the expense form during final review. Any CSV row with `split_type = SHARE` would be incorrectly flagged as an unknown split type and rejected.

**What I changed**: Added `"SHARE"` to the `VALID_SPLIT_TYPES` array in `lib/importer.ts:403`.

---

## My Role

Every design decision in this project was mine: the two-phase import structure, integer paise arithmetic, the membership time-bound check, the minimum transfers algorithm, the anomaly policies, and the neo-brutalist UI direction. Claude implemented what I specified. When it produced errors, I diagnosed the root cause and directed the fix. I read and understood every file in this repository before committing it.
