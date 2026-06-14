# SCOPE.md — Anomaly Log and Database Schema

## Anomaly Detection Policy

The importer runs in two phases:
- **Phase 1 (Analyse)**: Parse the CSV, detect all anomalies, persist them to the DB, return results to the UI.
- **Phase 2 (Confirm)**: User reviews flagged rows, approves or rejects each one, then commits the import.

Each anomaly has one of three resolutions:

| Resolution | Meaning |
|---|---|
| **Auto-resolved** | Problem is fixed programmatically; row imports without user action |
| **Requires approval** | Row is held; user must explicitly approve or reject before import |
| **Unresolvable / rejected** | Row is always skipped; cannot be saved regardless of user action |

---

## Detected Anomalies

### 1. DUPLICATE
**What it is**: Two or more rows share the same date, description, and amount (case-insensitive, commas stripped from amount).

**Policy**: Requires approval. The first occurrence is kept; subsequent duplicates are flagged. User can approve (import the duplicate too) or reject (skip it). Default in the UI is to reject duplicates.

**Rationale**: Could be two people independently logging the same bill, or a spreadsheet copy-paste error. We surface it rather than silently dropping.

---

### 2. AMOUNT_WITH_COMMA
**What it is**: Amount field contains thousand-separator commas, e.g. `"1,500.00"`.

**Policy**: Auto-resolved. Commas are stripped and the numeric value is used.

**Rationale**: Unambiguous formatting artifact; `1,500.00` means 1500 in any locale that uses this convention.

---

### 3. ZERO_AMOUNT
**What it is**: Amount field parses to exactly 0.

**Policy**: Requires approval. Row is held for user review.

**Rationale**: A ₹0 expense is almost certainly a data entry error. We don't auto-skip because it could represent a placeholder row someone wants to keep.

---

### 4. NEGATIVE_AMOUNT
**What it is**: Amount field parses to a negative number.

**Policy**: Requires approval. Could be a refund or a data entry error — the user must confirm intent.

**Rationale**: Refunds are legitimate (e.g. a deposit returned), but a negative expense is ambiguous. We won't silently negate or skip it.

---

### 5. FLOAT_PRECISION
**What it is**: Amount has more than 2 decimal places (e.g. `1500.333`).

**Policy**: Auto-resolved. Rounded to 2 decimal places, then stored in paise (×100, integer).

**Rationale**: Currency amounts beyond 2 decimal places are a precision artifact. Rounding is disclosed in the anomaly description.

---

### 6. MISSING_CURRENCY
**What it is**: Currency field is empty, NaN, or absent.

**Policy**: Auto-resolved. Defaults to INR.

**Rationale**: The group is India-based; a missing currency is almost always INR.

---

### 7. USD_CURRENCY
**What it is**: Currency field is `USD`.

**Policy**: Auto-resolved. Converted to INR at a fixed rate of **₹85.21 per dollar**, then stored in paise as INR.

**Rationale**: Priya explicitly flagged that the original spreadsheet treated `$1 = ₹1`, which is wrong. We apply a declared, visible conversion rate. The rate is shown in the anomaly description so the user can see exactly what conversion was applied.

---

### 8. MISSING_PAID_BY
**What it is**: `paid_by` field is empty or NaN.

**Policy**: Unresolvable. Row is always skipped.

**Rationale**: There is no safe default. We cannot know who paid, so we cannot compute balances correctly. Importing this row would corrupt the ledger.

---

### 9. NAME_NORMALIZATION
**What it is**: `paid_by` or a name in `split_with` is not an exact match for a group member, but uniquely resolves after trimming and title-casing (e.g. `"rohan "` → `"Rohan"`).

**Policy**: Auto-resolved. The normalised name is used.

**Rationale**: Spreadsheet names often have trailing spaces or inconsistent capitalisation. The fix is unambiguous.

---

### 10. AMBIGUOUS_NAME
**What it is**: A name in `paid_by` or `split_with` doesn't match any group member, or matches more than one.

**Policy**: Requires approval. Row is held for user review.

**Rationale**: We cannot guess which person is meant. The user must resolve or reject the row.

---

### 11. SETTLEMENT_AS_EXPENSE
**What it is**: A row has `split_type = SETTLEMENT`, or its description contains keywords like "settlement", "paid back", "reimburs".

**Policy**: Requires approval. If approved, the row is imported as a **settlement** record (not an expense), which correctly offsets balances without creating a split.

**Rationale**: Meera's request — settlements logged as expenses inflate everyone's paid/owed totals incorrectly.

---

### 12. PERCENTAGE_NOT_100
**What it is**: `split_type` is `PERCENTAGE` but the values in `split_details` do not sum to 100%.

**Policy**: Unresolvable. Row is always skipped.

**Rationale**: A percentage split that doesn't sum to 100 is mathematically invalid. We cannot guess what the correct percentages should be.

---

### 13. SPLIT_TYPE_MISMATCH
**What it is**: `split_type` value is not one of the recognised types: `EQUAL`, `PERCENTAGE`, `EXACT`, `SHARE`, `SETTLEMENT`.

**Policy**: Unresolvable. Row is always skipped.

**Rationale**: An unrecognised split type cannot be mapped to a calculation. Rather than default to EQUAL silently, we reject it.

---

### 14. NON_MEMBER_IN_SPLIT
**What it is**: A name in `split_with` cannot be matched to any current group member.

**Policy**: Requires approval. Row is held.

**Rationale**: We cannot allocate a split share to an unknown person. The user may need to add the member to the group and re-import, or reject this row.

---

### 15. MEMBER_LEFT
**What it is**: A name in `split_with` matches a member who had already left the group (`left_at` is set) before the expense date.

**Policy**: Requires approval. Row is held with a clear explanation of the date conflict.

**Rationale**: Sam's request — a member who wasn't in the flat on the expense date shouldn't be liable for it. The user can confirm (unusual case: the member agreed to share the cost) or reject.

---

### 16. AMBIGUOUS_DATE
**What it is**: Date is in `DD/MM/YYYY` or `MM/DD/YYYY` format where both the day and month fields are ≤ 12, making it ambiguous.

**Policy**: Requires approval for truly ambiguous cases (both fields ≤ 12). Auto-resolved for unambiguous formats (e.g. `25/06/2026` — day > 12, so must be `DD/MM/YYYY`).

**Default interpretation when approved**: `DD/MM/YYYY` (Indian locale).

**Rationale**: The group is India-based so DD/MM/YYYY is standard, but we still surface the ambiguity rather than silently assuming.

---

## Database Schema

### `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | References `auth.users` |
| `name` | text | Populated from signup metadata |
| `email` | text unique | |

Auto-created by Postgres trigger on `auth.users` insert.

---

### `groups`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `created_at` | timestamptz | |

---

### `group_memberships`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → profiles | |
| `group_id` | uuid FK → groups | |
| `joined_at` | timestamptz | When the member joined |
| `left_at` | timestamptz nullable | Null = still active |

Unique on `(user_id, group_id)`. The `joined_at`/`left_at` pair is how the app enforces Sam's requirement: balances only count expenses that fall within a member's active window.

---

### `expenses`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `group_id` | uuid FK → groups | |
| `description` | text | |
| `paid_by_user_id` | uuid FK → profiles | |
| `total_amount_paise` | bigint | Integer paise, no floats |
| `currency` | text | Always `INR` at rest |
| `split_type` | enum | `EQUAL`, `UNEQUAL`, `PERCENTAGE`, `SHARE` |
| `expense_date` | date | |
| `is_settlement` | boolean | |
| `is_deleted` | boolean | Soft delete |
| `created_at` | timestamptz | |

---

### `expense_splits`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `expense_id` | uuid FK → expenses | |
| `user_id` | uuid FK → profiles | |
| `amount_paise` | bigint | Each person's share in paise |

Unique on `(expense_id, user_id)`.

---

### `settlements`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `group_id` | uuid FK → groups | |
| `from_user_id` | uuid FK → profiles | Person paying |
| `to_user_id` | uuid FK → profiles | Person receiving |
| `amount_paise` | bigint | Must be > 0 |
| `settled_at` | timestamptz | |

---

### `import_sessions`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `group_id` | uuid FK → groups | |
| `created_by` | uuid FK → profiles | |
| `status` | enum | `PENDING`, `REVIEWED`, `COMMITTED`, `FAILED` |
| `total_rows` | integer | |
| `anomalies_count` | integer | |
| `raw_rows` | jsonb | Full parsed CSV rows stored for Phase 2 |
| `created_at` | timestamptz | |

---

### `import_anomalies`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `import_session_id` | uuid FK → import_sessions | |
| `row_number` | integer | 1-based |
| `raw_row` | jsonb | The original CSV row |
| `anomaly_type` | text | One of the 16 types above |
| `description` | text | Human-readable explanation |
| `action_taken` | text | Suggested resolution |
| `requires_approval` | boolean | |
| `approved` | boolean nullable | Null = pending, true = approved, false = rejected |

---

## All amounts are stored in paise (integer)

`1 INR = 100 paise`. Every balance calculation, split, and settlement uses integer arithmetic only. Paise amounts are only converted to rupees strings at display time via `formatPaise()` in `lib/utils.ts`. This eliminates all floating-point rounding errors across the balance ledger.
