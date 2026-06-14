import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getGroupBalances, getUserBalanceBreakdown } from "@/lib/balance"
import { BrutalCard, BrutalBadge, SectionHeader } from "@/components/brutalist"
import { formatPaise } from "@/lib/utils"

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [groupResult, membershipsResult, balancesResult, breakdownResult] = await Promise.all([
    supabase.from("groups").select("id, name").eq("id", id).single(),
    supabase
      .from("group_memberships")
      .select("user_id, joined_at, left_at, profiles(name, email)")
      .eq("group_id", id),
    getGroupBalances(id, supabase),
    getUserBalanceBreakdown(user.id, id, supabase),
  ])

  if (groupResult.error || !groupResult.data) notFound()
  const group = groupResult.data
  const memberships = membershipsResult.data ?? []
  const balances = balancesResult
  const breakdown = breakdownResult

  // name lookup: userId → name
  const nameMap = new Map<string, string>()
  for (const m of memberships) {
    const p = m.profiles as { name: string; email: string } | null
    nameMap.set(m.user_id, p?.name ?? "Unknown")
  }

  const myNetPaise = balances.net[user.id] ?? 0
  const isPositive = myNetPaise > 0

  return (
    <div className="flex min-h-screen flex-col gap-5 p-5">

      {/* Header */}
      <BrutalCard className="bg-lime p-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/dashboard" className="mb-2 block text-xs font-bold uppercase tracking-widest opacity-60 hover:opacity-100">
              ← Dashboard
            </Link>
            <h1 className="text-5xl font-black leading-none tracking-tight">{group.name}</h1>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <div className="flex items-center gap-2 rounded-full border-2 border-brutal bg-white px-4 py-2 shadow-[3px_3px_0px_#000]">
              <span className="text-xs font-bold uppercase tracking-widest opacity-50">Your Balance</span>
              <span className={`text-sm font-black ${myNetPaise === 0 ? "text-black/40" : isPositive ? "text-green-600" : "text-red-600"}`}>
                {myNetPaise === 0 ? "Settled" : `${isPositive ? "+" : "-"}${formatPaise(Math.abs(myNetPaise))}`}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full border-2 border-brutal bg-white px-4 py-2 shadow-[3px_3px_0px_#000]">
              <span className="text-xs font-bold uppercase tracking-widest opacity-50">Members</span>
              <span className="text-sm font-black">{memberships.length}</span>
            </div>
          </div>
        </div>
      </BrutalCard>

      <div className="grid grid-cols-3 gap-4">

        {/* Col 1 — Members */}
        <div className="flex flex-col">
          <SectionHeader label="Members" count={memberships.length} />
          <div className="flex flex-col gap-3">
            {memberships.map((m) => {
              const p = m.profiles as { name: string; email: string } | null
              const isMe = m.user_id === user.id
              const left = !!m.left_at
              return (
                <BrutalCard key={m.user_id} className={`p-4 ${left ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-black">{p?.name ?? "Unknown"}{isMe ? " (you)" : ""}</p>
                      <p className="text-xs font-medium text-black/40">{p?.email}</p>
                    </div>
                    {left ? (
                      <BrutalBadge className="bg-black/30">Left</BrutalBadge>
                    ) : (
                      <BrutalBadge>Active</BrutalBadge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-black/30">
                    Joined {new Date(m.joined_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </BrutalCard>
              )
            })}
          </div>
        </div>

        {/* Col 2 — Settle up */}
        <div className="flex flex-col">
          <SectionHeader label="Minimum Transfers" count={balances.transfers.length} />
          <div className="flex flex-col gap-3">
            {balances.transfers.length === 0 && (
              <BrutalCard className="p-5">
                <p className="text-center text-sm font-bold text-black/40">All settled up 🎉</p>
              </BrutalCard>
            )}
            {balances.transfers.map((t, i) => (
              <BrutalCard key={i} className="p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-black/40">Transfer</p>
                <div className="flex items-center gap-2">
                  <span className="font-black">{nameMap.get(t.from) ?? t.from.slice(0, 6)}</span>
                  <span className="text-black/40">→</span>
                  <span className="font-black">{nameMap.get(t.to) ?? t.to.slice(0, 6)}</span>
                </div>
                <p className="mt-1 text-2xl font-black text-green-600">{formatPaise(t.amount_paise)}</p>
              </BrutalCard>
            ))}
          </div>
        </div>

        {/* Col 3 — My expense breakdown */}
        <div className="flex flex-col">
          <SectionHeader label="My Expenses" count={breakdown.length} />
          <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-1">
            {breakdown.length === 0 && (
              <p className="text-sm font-medium text-black/40">No expenses yet.</p>
            )}
            {breakdown.map((item) => (
              <BrutalCard key={item.expenseId} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{item.description}</p>
                    <p className="text-xs text-black/40">{item.date}</p>
                  </div>
                  <span className={`shrink-0 text-base font-black ${item.netPaise >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {item.netPaise >= 0 ? "+" : "-"}{formatPaise(Math.abs(item.netPaise))}
                  </span>
                </div>
                <div className="mt-2 flex gap-2 text-xs text-black/40">
                  {item.paidPaise > 0 && <span>Paid {formatPaise(item.paidPaise)}</span>}
                  {item.owedPaise > 0 && <span>Owe {formatPaise(item.owedPaise)}</span>}
                </div>
              </BrutalCard>
            ))}
          </div>
        </div>

      </div>

      {/* Actions */}
      <div className="flex justify-center gap-4 pb-2 pt-1">
        <Link
          href={`/groups/${id}/import`}
          className="flex items-center gap-2 rounded-2xl border-2 border-brutal bg-white px-8 py-4 text-sm font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000]"
        >
          Import CSV
        </Link>
        <Link
          href={`/groups/${id}/settle`}
          className="flex items-center gap-2 rounded-2xl border-2 border-brutal bg-white px-8 py-4 text-sm font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000]"
        >
          Settle Up
        </Link>
        <Link
          href={`/groups/${id}/expenses/new`}
          className="flex items-center gap-3 rounded-2xl border-2 border-brutal bg-lime px-10 py-4 text-lg font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000]"
        >
          <span className="text-xl">+</span> Add Expense
        </Link>
      </div>

    </div>
  )
}
