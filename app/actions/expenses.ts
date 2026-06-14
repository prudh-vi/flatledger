"use server"

import { createClient } from "@/lib/supabase/server"

const USD_TO_INR = 83.5

export interface CreateExpenseParams {
  groupId: string
  description: string
  amountRaw: number
  currency: "INR" | "USD"
  date: string
  paidByUserId: string
  splitType: "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "SHARE"
  splits: { userId: string; value: number }[]
}

export async function createExpense(params: CreateExpenseParams): Promise<{ expenseId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const amountInr  = params.currency === "USD" ? params.amountRaw * USD_TO_INR : params.amountRaw
  const totalPaise = Math.round(amountInr * 100)

  // Per-person paise amounts — integer arithmetic only
  let splitAmounts: { userId: string; amountPaise: number }[]

  if (params.splitType === "EQUAL") {
    const count     = params.splits.length
    const base      = Math.floor(totalPaise / count)
    const remainder = totalPaise - base * count
    splitAmounts = params.splits.map((s, i) => ({
      userId: s.userId,
      amountPaise: i === 0 ? base + remainder : base,
    }))
  } else if (params.splitType === "PERCENTAGE") {
    splitAmounts = params.splits.map((s) => ({
      userId: s.userId,
      amountPaise: Math.round(totalPaise * (s.value / 100)),
    }))
  } else if (params.splitType === "UNEQUAL") {
    const factor = params.currency === "USD" ? USD_TO_INR : 1
    splitAmounts = params.splits.map((s) => ({
      userId: s.userId,
      amountPaise: Math.round(s.value * factor * 100),
    }))
  } else {
    // SHARE — distribute proportionally
    const totalShares = params.splits.reduce((sum, s) => sum + s.value, 0)
    splitAmounts = params.splits.map((s) => ({
      userId: s.userId,
      amountPaise: Math.round(totalPaise * (s.value / totalShares)),
    }))
  }

  const { data: expense, error: expenseError } = await supabase
    .from("expenses")
    .insert({
      group_id:           params.groupId,
      description:        params.description.trim(),
      paid_by_user_id:    params.paidByUserId,
      total_amount_paise: totalPaise,
      currency:           "INR",
      split_type:         params.splitType,
      expense_date:       params.date,
      is_settlement:      false,
    })
    .select("id")
    .single()

  if (expenseError || !expense) throw new Error(expenseError?.message ?? "Failed to create expense")

  const { error: splitsError } = await supabase.from("expense_splits").insert(
    splitAmounts.map((s) => ({
      expense_id:   expense.id,
      user_id:      s.userId,
      amount_paise: s.amountPaise,
    }))
  )

  if (splitsError) throw new Error(splitsError.message)

  return { expenseId: expense.id }
}
