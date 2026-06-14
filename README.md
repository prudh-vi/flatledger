# FlatLedger

A shared expense tracker for flatmates. Tracks who paid what, splits bills across group members, handles mid-tenancy join/leave, and imports messy CSV exports with a deliberate anomaly-review flow.

Built with Next.js 16, Supabase, and Tailwind CSS v4.

---

## Stack

- **Frontend/API**: Next.js 16.2.9 (App Router, Server Actions)
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **Styling**: Tailwind CSS v4
- **CSV parsing**: PapaParse
- **AI used**: Claude (Anthropic) — see `AI_USAGE.md`

---

## Local Setup

### Prerequisites

- Node.js 20+ or Bun
- A Supabase project (free tier works)

### 1. Clone and install

```bash
git clone https://github.com/prudh-vi/flatledger.git
cd flatledger
bun install        # or: npm install
```

### 2. Environment variables

Create `.env.local` at the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Both values are in your Supabase project under **Settings → API**.

### 3. Run migrations

Open the Supabase SQL editor and run the three migration files in order:

```
supabase/migrations/001_groups_and_memberships.sql
supabase/migrations/002_expenses_splits_settlements.sql
supabase/migrations/003_import_raw_rows.sql
```

Each file is self-contained with `create table if not exists` — safe to re-run.

### 4. Start the dev server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage

1. **Register** at `/register` — name, email, password
2. **Create a group** — Dashboard → New Group, invite flatmates by email (they must have accounts first)
3. **Add expenses** — from the group page, click Add Expense; choose split type (Equal / Unequal / Percentage / Share)
4. **Import CSV** — click Import CSV on the group page; upload the file, review anomalies, confirm
5. **Settle up** — click Settle Up to see the minimum set of transfers needed to clear all debts; record payments as they happen

### CSV format

```csv
date,description,paid_by,amount,currency,split_type,split_with,split_details,notes
2026-06-01,Airbnb,Rohan,12000,INR,EQUAL,"Rohan,Priya,Aisha",,
2026-06-02,Dinner,Priya,3500,INR,PERCENTAGE,"Rohan,Priya,Aisha","40,35,25",
```

Supported split types in CSV: `EQUAL`, `PERCENTAGE`, `EXACT` (stored as unequal), `SHARE`, `SETTLEMENT`.

---

## Deployment

Deploy to Vercel:

```bash
bunx vercel --prod
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel project settings before deploying.
