import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getGroupBalances } from "@/lib/balance"
import { BrutalCard } from "@/components/brutalist"
import { formatPaise } from "@/lib/utils"
import { recordSettlement } from "@/app/actions/settlements"

export default async function SettlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [balances, membershipsResult, groupResult] = await Promise.all([
    getGroupBalances(id, supabase),
    supabase
      .from("group_memberships")
      .select("user_id, profiles(name)")
      .eq("group_id", id),
    supabase.from("groups").select("name").eq("id", id).single(),
  ])

  const nameMap = new Map<string, string>()
  for (const m of membershipsResult.data ?? []) {
    const p = m.profiles as unknown as { name: string } | null
    nameMap.set(m.user_id, p?.name ?? "Unknown")
  }

  const groupName = groupResult.data?.name ?? "Group"
  const allSquare = balances.transfers.length === 0

  return (
    <div className="flex min-h-screen flex-col items-center justify-start p-5 pt-10">
      <div className="w-full max-w-lg">

        {/* Back + title */}
        <div className="mb-8">
          <Link
            href={`/groups/${id}`}
            className="text-xs font-bold uppercase tracking-widest text-black/40 hover:text-black"
          >
            ← {groupName}
          </Link>
          <h1 className="mt-2 text-4xl font-black">Settle Up</h1>
          {!allSquare && (
            <p className="mt-1 text-sm font-medium text-black/50">
              {balances.transfers.length} payment{balances.transfers.length !== 1 ? "s" : ""} needed to clear all debts.
            </p>
          )}
        </div>

        {/* ALL SQUARE */}
        {allSquare && (
          <BrutalCard className="bg-lime p-12 text-center">
            <p className="text-7xl leading-none">🎉</p>
            <h2 className="mt-4 text-5xl font-black leading-none tracking-tight">ALL SQUARE!</h2>
            <p className="mt-3 text-base font-medium text-black/60">
              No payments needed. Everyone's settled.
            </p>
            <Link
              href={`/groups/${id}`}
              className="mt-8 block rounded-2xl border-2 border-brutal bg-white px-8 py-3 text-sm font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000]"
            >
              Back to Group
            </Link>
          </BrutalCard>
        )}

        {/* Transfer cards */}
        {!allSquare && (
          <div className="space-y-4">
            {balances.transfers.map((t, i) => {
              const fromName = nameMap.get(t.from) ?? t.from.slice(0, 8)
              const toName   = nameMap.get(t.to)   ?? t.to.slice(0, 8)
              return (
                <BrutalCard key={i} className="p-6">

                  {/* Name badges */}
                  <div className="mb-5 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-brutal bg-brutal px-4 py-1.5 text-sm font-black uppercase tracking-widest text-white">
                      <span className="h-2 w-2 rounded-full bg-lime" />
                      {fromName}
                    </span>
                    <span className="text-2xl font-black text-black/30">→</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-brutal bg-brutal px-4 py-1.5 text-sm font-black uppercase tracking-widest text-white">
                      <span className="h-2 w-2 rounded-full bg-lime" />
                      {toName}
                    </span>
                  </div>

                  {/* Amount */}
                  <p className="mb-6 text-6xl font-black leading-none tracking-tight">
                    {formatPaise(t.amount_paise)}
                  </p>

                  {/* Record Payment form */}
                  <form action={recordSettlement}>
                    <input type="hidden" name="fromUserId"  value={t.from} />
                    <input type="hidden" name="toUserId"    value={t.to} />
                    <input type="hidden" name="amountPaise" value={t.amount_paise} />
                    <input type="hidden" name="groupId"     value={id} />
                    <button
                      type="submit"
                      className="w-full rounded-2xl border-2 border-brutal bg-lime py-4 text-sm font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0px_#000]"
                    >
                      ✓ Record Payment
                    </button>
                  </form>

                </BrutalCard>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
