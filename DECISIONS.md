# DECISIONS.md — Decision Log

Each significant decision, the options considered, and why we chose what we chose.

---

## 1. Integer paise arithmetic (no floats anywhere in balance math)

**Decision**: Store all monetary amounts as `bigint` in paise (1 INR = 100 paise). Perform all addition, subtraction, and comparison in integers. Convert to rupees strings only at display time.

**Options considered**:
- Float (e.g. `12.50` INR) — simple to read, but floating-point arithmetic produces rounding errors that compound across many splits. `0.1 + 0.2 !== 0.3` in JavaScript.
- Decimal strings — avoids float errors but requires a library and adds complexity.
- Integer paise — no library needed, no rounding errors possible during computation, trivial to display.

**Why paise**: The ledger deals with ₹ and paise. INR has exactly 2 decimal places. Multiplying by 100 and staying in integers is the simplest correct solution. The constraint "zero division before display" is enforced by doing all splits as integer floor + remainder distribution.

---

## 2. Two-phase import (Analyse → Confirm)

**Decision**: The import is split into two explicit phases. Phase 1 parses the CSV, detects anomalies, stores the raw rows and anomaly records in the DB, and returns results to the UI. Phase 2 (triggered by user action) loads those stored rows, applies user approvals, and writes expenses/settlements.

**Options considered**:
- Single-pass import with silent rules — fast, but Meera's requirement ("approve anything the app changes") rules this out.
- Single-pass import with blocking UI — the user reviews inline before any DB write, but this means the app can't recover if the user closes the tab mid-review.
- Two-phase with DB persistence — anomaly decisions are saved to the DB (`import_anomalies.approved`), so the session survives a page refresh and the user can come back to it.

**Why two-phase with DB**: The assignment explicitly requires surfacing problems to the user before acting. Persisting the session to the DB is the only robust way to handle that without losing state on page refresh.

---

## 3. USD conversion rate

**Decision**: Two separate rates are used:
- **Importer** (`lib/importer.ts`): `85.21 INR/USD`
- **Manual expense form** (`app/actions/expenses.ts`): `83.5 INR/USD`

**Why different rates**: The importer rate represents the rate at the time the trip expenses were incurred (a declared, documented historical rate). The manual entry form rate represents a live rate for new expenses being added today. Both rates are declared as named constants and displayed to the user at point of use. Priya's requirement was that the app not pretend $1 = ₹1 — both rates satisfy that.

**What was considered**: Using a live exchange rate API. Rejected because it introduces an external dependency, and the importer runs against historical data where the rate at the time of spending is more relevant than today's rate.

---

## 4. Membership time-bound check

**Decision**: A member's balance is only affected by expenses that fall within their active window: `joined_at <= expense_date AND (left_at IS NULL OR left_at > expense_date)`. This check is applied in both `getGroupBalances` and `getUserBalanceBreakdown`, and in the import anomaly detector (`MEMBER_LEFT`).

**Options considered**:
- Ignore left_at entirely — simplest, but violates Sam's requirement.
- Check only on import — would stop new imports from affecting past members, but wouldn't fix expenses already in the DB.
- Check at balance calculation time — applies retroactively to all expenses regardless of how they entered the DB.

**Why at balance calculation time**: The check is in `lib/balance.ts`, not just in the importer. This means even if a member was manually entered into a split incorrectly, the balance calculation ignores it. The source of truth is the `group_memberships` table, not the expense records.

**Date comparison**: Dates are compared as `YYYY-MM-DD` strings lexicographically — no `Date` object parsing. This avoids timezone issues that would arise from parsing ISO timestamps into local Date objects. The `joined_at`/`left_at` columns are `timestamptz`; the `.split("T")[0]` call in `wasActiveMember` extracts just the date component before comparison.

---

## 5. Minimum transfers algorithm

**Decision**: Use the greedy cash-flow minimisation algorithm. Sort creditors and debtors by amount descending, pair the largest creditor with the largest debtor, transfer the minimum of their amounts, repeat.

**Options considered**:
- Show all raw pairwise balances — simple but produces many more transactions (e.g. 6 people → up to 15 pairs).
- Minimum transfers (NP-hard exact solution) — optimal but exponential time; not needed at flat-scale (≤10 people).
- Greedy minimum transfers — O(n log n), produces at most n-1 transactions, good enough for the scale.

**Why greedy**: Aisha's requirement was "one number per person, who pays whom, done." The greedy algorithm minimises the number of transfers. For groups of ≤10 people it is indistinguishable from the optimal solution in practice.

---

## 6. Duplicate detection policy

**Decision**: Duplicates are detected by matching `(date, description, amount)` case-insensitively with commas stripped. Flagged as requiring approval; the default UI action is to reject (skip) the duplicate.

**Options considered**:
- Match on all fields — too strict; a duplicate might have slightly different notes or split details.
- Match on description + amount only — too loose; same dinner cost on two different nights would collide.
- Match on date + description + amount — covers the most likely case (copy-paste error) while allowing legitimate same-day same-amount different-description entries.

**Why default to reject**: A duplicate is more likely to be an error than intentional. The user can override.

---

## 7. Negative amounts require approval (not auto-rejected)

**Decision**: Negative amounts are flagged as `NEGATIVE_AMOUNT` and held for user approval rather than silently rejected.

**Why**: A negative amount could be a legitimate refund (e.g. deposit returned, partial reimbursement). Auto-rejecting would silently lose that record. Requiring approval gives the user the final say.

---

## 8. SETTLEMENT rows imported as settlement records, not expenses

**Decision**: Rows with `split_type = SETTLEMENT` or settlement keywords in the description are detected as `SETTLEMENT_AS_EXPENSE`. If the user approves, they are written to the `settlements` table, not the `expenses` table.

**Why**: A settlement cancels a debt. If imported as an expense, it would add to everyone's gross paid/owed totals incorrectly, and the balance calculation would be wrong. Importing as a settlement correctly offsets the net balance of the two parties involved.

---

## 9. DD/MM/YYYY as default for ambiguous dates

**Decision**: When a date like `03/06/2026` is approved despite being flagged as ambiguous, we interpret it as `DD/MM/YYYY` (3 June, not 6 March).

**Why**: The group is India-based. The Indian date format is DD/MM/YYYY. This is documented in the anomaly description so the user can reject the row if their CSV uses MM/DD/YYYY instead.

---

## 10. Supabase for auth + DB

**Decision**: Use Supabase for PostgreSQL database, authentication, and Row Level Security.

**Options considered**:
- Prisma + custom auth — more control, more code.
- Firebase — NoSQL, ruled out by the requirement for relational DB only.
- Supabase — managed Postgres, built-in auth, RLS policies as SQL, generous free tier.

**Why Supabase**: The assignment requires relational DB. Supabase gives us PostgreSQL with RLS, which means access control is enforced at the DB layer — even a bug in application code can't leak another group's data.

---

## 11. Next.js 16 Server Actions for mutations

**Decision**: All writes (create expense, confirm import, record settlement, create group) are Server Actions (`"use server"`) called directly from client components.

**Why**: Eliminates the need for a separate API layer. Server Actions run on the server, so the Supabase service-role key never touches the client. The call signature is typed end-to-end (TypeScript params, not FormData strings), which catches mistakes at compile time.

---

## 12. No soft-delete UI for expenses (yet)

**Decision**: The `expenses` table has an `is_deleted` boolean column and balance queries filter on `is_deleted = false`, but there is no UI to delete an expense.

**Why**: Deleting an expense is a destructive action that affects everyone's balance. It wasn't listed as a minimum requirement and was deprioritised in favour of the import flow and balance accuracy.
