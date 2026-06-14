import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getGroupBalances } from "@/lib/balance"
import { BrutalCard, BrutalBadge, SectionHeader } from "@/components/brutalist"
import { formatPaise } from "@/lib/utils"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // User profile name
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single()
  const userName = profile?.name ?? user.email?.split("@")[0] ?? "there"

  // Current group memberships
  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("group_id, groups(id, name)")
    .eq("user_id", user.id)
    .is("left_at", null)

  const groups = (memberships ?? [])
    .map((m) => m.groups as unknown as { id: string; name: string } | null)
    .filter((g): g is { id: string; name: string } => g !== null)

  // Balances + member counts in parallel per group
  const groupData = await Promise.all(
    groups.map(async (group) => {
      const [balances, memberResult] = await Promise.all([
        getGroupBalances(group.id, supabase),
        supabase
          .from("group_memberships")
          .select("user_id", { count: "exact" })
          .eq("group_id", group.id)
          .is("left_at", null),
      ])
      return {
        id: group.id,
        name: group.name,
        memberCount: memberResult.count ?? 0,
        netPaise: balances.net[user.id] ?? 0,
        transfers: balances.transfers,
      }
    })
  )

  // Aggregate: who owes the current user across all groups
  const owedMap = new Map<string, number>()
  for (const g of groupData) {
    for (const t of g.transfers) {
      if (t.to === user.id) owedMap.set(t.from, (owedMap.get(t.from) ?? 0) + t.amount_paise)
    }
  }

  // Resolve debtor names
  const debtorIds = [...owedMap.keys()]
  const nameMap = new Map<string, string>()
  if (debtorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", debtorIds)
    for (const p of profiles ?? []) nameMap.set(p.id, p.name)
  }

  // Recent expenses across all groups
  const allGroupIds = groups.map((g) => g.id)
  const { data: recentExpenses } = allGroupIds.length > 0
    ? await supabase
        .from("expenses")
        .select("id, description, expense_date, total_amount_paise, paid_by_user_id, group_id, groups(name), profiles!paid_by_user_id(name)")
        .in("group_id", allGroupIds)
        .eq("is_deleted", false)
        .eq("is_settlement", false)
        .order("expense_date", { ascending: false })
        .limit(5)
    : { data: [] }

  const totalNetPaise = groupData.reduce((sum, g) => sum + g.netPaise, 0)
  const isPositive = totalNetPaise >= 0

  const owedList = [...owedMap.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="flex min-h-screen flex-col gap-5 p-5">

      {/* Banner */}
      <BrutalCard className="bg-lime p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest opacity-60">FLATLEDGER · V1</p>
            <h1 className="text-5xl font-black leading-none tracking-tight">
              Hey, {userName}.
            </h1>
            <p className="mt-2 text-sm font-bold opacity-60 uppercase tracking-widest">Split expenses. No drama.</p>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <div className="flex items-center gap-2 rounded-full border-2 border-brutal bg-white px-4 py-2 shadow-[3px_3px_0px_#000]">
              <span className="text-xs font-bold uppercase tracking-widest opacity-50">Net Balance</span>
              <span className={`text-sm font-black ${isPositive ? "text-green-600" : "text-red-600"}`}>
                {isPositive ? "+" : "-"}{formatPaise(Math.abs(totalNetPaise))}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full border-2 border-brutal bg-white px-4 py-2 shadow-[3px_3px_0px_#000]">
              <span className="text-xs font-bold uppercase tracking-widest opacity-50">Groups</span>
              <span className="text-sm font-black">{groups.length} active</span>
            </div>
            <form action="/auth/signout" method="post">
              <button
                formAction={async () => {
                  "use server"
                  const supabase = await createClient()
                  await supabase.auth.signOut()
                  redirect("/login")
                }}
                className="flex items-center gap-1.5 rounded-full border-2 border-brutal bg-white px-4 py-2 text-xs font-black uppercase tracking-widest shadow-[3px_3px_0px_#000] hover:bg-cream transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </BrutalCard>

      {/* Three columns */}
      <div className="grid flex-1 grid-cols-3 gap-4">

        {/* Col 1 — Groups */}
        <div className="flex flex-col">
          <SectionHeader label="Your Groups" count={groupData.length} />
          <div className="flex flex-col gap-3">
            {groupData.length === 0 && (
              <p className="text-sm font-medium text-black/40">No groups yet.</p>
            )}
            {groupData.map((g) => {
              const owed = g.netPaise > 0
              const zero = g.netPaise === 0
              return (
                <Link key={g.id} href={`/groups/${g.id}`}>
                  <BrutalCard className="p-4 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000]">
                    <div className="mb-3 flex items-start justify-between">
                      <p className="text-lg font-black leading-tight">{g.name}</p>
                      <BrutalBadge>{g.memberCount} members</BrutalBadge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wide opacity-50">
                        {zero ? "Settled up" : owed ? "You're owed" : "You owe"}
                      </span>
                      <span className={`text-xl font-black ${zero ? "text-black/30" : owed ? "text-green-600" : "text-red-600"}`}>
                        {zero ? "—" : `${owed ? "+" : "-"}${formatPaise(Math.abs(g.netPaise))}`}
                      </span>
                    </div>
                  </BrutalCard>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Col 2 — Who owes you */}
        <div className="flex flex-col">
          <SectionHeader label="Who Owes You" count={owedList.length} />
          <div className="flex flex-col gap-3">
            {owedList.length === 0 && (
              <p className="text-sm font-medium text-black/40">Nobody owes you anything.</p>
            )}
            {owedList.map(([uid, amount]) => (
              <BrutalCard key={uid} className="relative bg-brutal p-5">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-white/50">Owes you</p>
                <p className="text-3xl font-black text-lime">{formatPaise(amount)}</p>
                <div className="mt-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-white/20 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-lime" />
                    {nameMap.get(uid) ?? uid.slice(0, 8)}
                  </span>
                </div>
              </BrutalCard>
            ))}
          </div>
        </div>

        {/* Col 3 — Recent expenses */}
        <div className="flex flex-col">
          <SectionHeader label="Recent Expenses" />
          <div className="flex flex-col gap-3">
            {(recentExpenses ?? []).length === 0 && (
              <p className="text-sm font-medium text-black/40">No expenses yet.</p>
            )}
            {(recentExpenses ?? []).map((e: any) => (
              <BrutalCard key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black">{e.description}</p>
                    <p className="mt-0.5 text-xs font-medium text-black/40">
                      {e.groups?.name} · {e.expense_date}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-black">{formatPaise(e.total_amount_paise)}</p>
                </div>
                <div className="mt-3">
                  <BrutalBadge>
                    {e.paid_by_user_id === user.id ? "Paid by you" : `Paid by ${e.profiles?.name ?? "…"}`}
                  </BrutalBadge>
                </div>
              </BrutalCard>
            ))}
          </div>
        </div>

      </div>

      {/* CTA */}
      <div className="flex justify-center gap-4 pb-2 pt-1">
        <Link
          href="/groups/new"
          className="flex items-center gap-2 rounded-2xl border-2 border-brutal bg-white px-8 py-4 text-sm font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000]"
        >
          New Group
        </Link>
        <button className="flex items-center gap-3 rounded-2xl border-2 border-brutal bg-lime px-10 py-4 text-lg font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0px_#000]">
          <span className="text-xl">+</span> Add Expense
        </button>
      </div>

    </div>
  )
}
