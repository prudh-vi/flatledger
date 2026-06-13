import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────

export interface Transfer {
  from: string;
  to: string;
  amount_paise: number;
}

export interface GroupBalances {
  net: Record<string, number>;
  transfers: Transfer[];
}

export interface ExpenseLineItem {
  expenseId: string;
  description: string;
  date: string;
  paidPaise: number;
  owedPaise: number;
  netPaise: number;
}

// ── Internal ──────────────────────────────────────────────────

type MembershipRow = { user_id: string; joined_at: string; left_at: string | null };

// Date strings are YYYY-MM-DD and compared lexicographically — no Date parsing needed.
// joined_at and left_at are truncated to date part before comparison.
function wasActiveMember(
  userId: string,
  expenseDate: string,
  memberships: MembershipRow[]
): boolean {
  return memberships.some((m) => {
    if (m.user_id !== userId) return false;
    const joinedDate = m.joined_at.split("T")[0];
    const leftDate = m.left_at ? m.left_at.split("T")[0] : null;
    // joined_at <= expense_date AND (left_at IS NULL OR left_at > expense_date)
    return joinedDate <= expenseDate && (leftDate === null || leftDate > expenseDate);
  });
}

// Greedy minimum cash-flow algorithm — O(n log n), all integer paise arithmetic, zero division.
function minimumTransfers(net: Record<string, number>): Transfer[] {
  const creditors: Array<{ userId: string; amount: number }> = [];
  const debtors:   Array<{ userId: string; amount: number }> = [];

  for (const [userId, amount] of Object.entries(net)) {
    if (amount > 0) creditors.push({ userId, amount });
    else if (amount < 0) debtors.push({ userId, amount: -amount });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const transfer = Math.min(creditors[i].amount, debtors[j].amount);
    transfers.push({ from: debtors[j].userId, to: creditors[i].userId, amount_paise: transfer });
    creditors[i].amount -= transfer;
    debtors[j].amount  -= transfer;
    if (creditors[i].amount === 0) i++;
    if (debtors[j].amount === 0) j++;
  }

  return transfers;
}

async function loadMemberships(groupId: string, supabase: SupabaseClient): Promise<MembershipRow[]> {
  const { data, error } = await supabase
    .from("group_memberships")
    .select("user_id, joined_at, left_at")
    .eq("group_id", groupId);
  if (error) throw new Error(`Failed to load memberships: ${error.message}`);
  return data ?? [];
}

// ── 1. getGroupBalances ───────────────────────────────────────

export async function getGroupBalances(
  groupId: string,
  supabase: SupabaseClient,
  asOfDate?: Date
): Promise<GroupBalances> {
  const dateFilter       = asOfDate ? asOfDate.toISOString().split("T")[0] : "9999-12-31";
  const settledAtFilter  = asOfDate ? asOfDate.toISOString() : "9999-12-31T23:59:59Z";

  const memberships = await loadMemberships(groupId, supabase);

  // Expenses
  const { data: expenses, error: expError } = await supabase
    .from("expenses")
    .select("id, paid_by_user_id, total_amount_paise, expense_date")
    .eq("group_id", groupId)
    .eq("is_deleted", false)
    .eq("is_settlement", false)
    .lte("expense_date", dateFilter);

  if (expError) throw new Error(`Failed to load expenses: ${expError.message}`);
  const expenseRows = expenses ?? [];
  const expenseIds = expenseRows.map((e) => e.id);
  const expenseDateMap = new Map(expenseRows.map((e) => [e.id, e.expense_date as string]));

  // Splits
  const splitRows: Array<{ expense_id: string; user_id: string; amount_paise: number }> = [];
  if (expenseIds.length > 0) {
    const { data: splits, error: splitError } = await supabase
      .from("expense_splits")
      .select("expense_id, user_id, amount_paise")
      .in("expense_id", expenseIds);
    if (splitError) throw new Error(`Failed to load splits: ${splitError.message}`);
    splitRows.push(...(splits ?? []));
  }

  // Integer-only net balance accumulation (paise, no floating point)
  const net: Record<string, number> = {};
  const add = (uid: string, p: number) => { net[uid] = (net[uid] ?? 0) + p; };
  const sub = (uid: string, p: number) => { net[uid] = (net[uid] ?? 0) - p; };

  // Credit payers — membership check applied
  for (const expense of expenseRows) {
    if (wasActiveMember(expense.paid_by_user_id, expense.expense_date, memberships)) {
      add(expense.paid_by_user_id, expense.total_amount_paise);
    }
  }

  // Debit split participants — membership time-bound check is NON-NEGOTIABLE
  for (const split of splitRows) {
    const expenseDate = expenseDateMap.get(split.expense_id);
    if (!expenseDate) continue;
    if (!wasActiveMember(split.user_id, expenseDate, memberships)) continue;
    sub(split.user_id, split.amount_paise);
  }

  // Apply settlements:
  // from_user paid someone → reduces their debt → net improves
  // to_user was paid       → their credit is consumed → net reduces
  const { data: settlements, error: settleError } = await supabase
    .from("settlements")
    .select("from_user_id, to_user_id, amount_paise")
    .eq("group_id", groupId)
    .lte("settled_at", settledAtFilter);

  if (settleError) throw new Error(`Failed to load settlements: ${settleError.message}`);

  for (const s of settlements ?? []) {
    add(s.from_user_id, s.amount_paise);
    sub(s.to_user_id,   s.amount_paise);
  }

  return { net, transfers: minimumTransfers(net) };
}

// ── 2. getUserBalanceBreakdown ────────────────────────────────

export async function getUserBalanceBreakdown(
  userId: string,
  groupId: string,
  supabase: SupabaseClient
): Promise<ExpenseLineItem[]> {
  const memberships = await loadMemberships(groupId, supabase);

  // All non-deleted expenses in the group
  const { data: allExpenses, error: expError } = await supabase
    .from("expenses")
    .select("id, description, expense_date, total_amount_paise, paid_by_user_id")
    .eq("group_id", groupId)
    .eq("is_deleted", false)
    .eq("is_settlement", false);

  if (expError) throw new Error(`Failed to load expenses: ${expError.message}`);
  const expenseRows = allExpenses ?? [];
  const expenseIds  = expenseRows.map((e) => e.id);

  // Splits for this user across those expenses
  const splitAmountMap = new Map<string, number>();
  if (expenseIds.length > 0) {
    const { data: splits, error: splitError } = await supabase
      .from("expense_splits")
      .select("expense_id, amount_paise")
      .eq("user_id", userId)
      .in("expense_id", expenseIds);
    if (splitError) throw new Error(`Failed to load user splits: ${splitError.message}`);
    for (const s of splits ?? []) {
      splitAmountMap.set(s.expense_id, s.amount_paise);
    }
  }

  const lineItems: ExpenseLineItem[] = [];

  for (const expense of expenseRows) {
    const paidPaise = expense.paid_by_user_id === userId ? (expense.total_amount_paise as number) : 0;
    const owedPaise = splitAmountMap.get(expense.id) ?? 0;

    // Skip expenses that don't affect this user at all
    if (paidPaise === 0 && owedPaise === 0) continue;

    // Membership time-bound check — NON-NEGOTIABLE
    if (!wasActiveMember(userId, expense.expense_date, memberships)) continue;

    lineItems.push({
      expenseId:   expense.id,
      description: expense.description,
      date:        expense.expense_date,
      paidPaise,
      owedPaise,
      netPaise: paidPaise - owedPaise,
    });
  }

  lineItems.sort((a, b) => a.date.localeCompare(b.date));
  return lineItems;
}

// ── 3. createSettlement ───────────────────────────────────────

export async function createSettlement(
  fromUserId: string,
  toUserId: string,
  amountPaise: number,
  groupId: string,
  supabase: SupabaseClient
): Promise<GroupBalances> {
  const { error } = await supabase.from("settlements").insert({
    group_id:     groupId,
    from_user_id: fromUserId,
    to_user_id:   toUserId,
    amount_paise: amountPaise,
    settled_at:   new Date().toISOString(),
  });

  if (error) throw new Error(`Failed to record settlement: ${error.message}`);

  return getGroupBalances(groupId, supabase);
}
