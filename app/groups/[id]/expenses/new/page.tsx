import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { BrutalCard } from "@/components/brutalist"
import { ExpenseForm } from "@/components/expense-form"

export default async function NewExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [groupResult, membershipsResult] = await Promise.all([
    supabase.from("groups").select("id, name").eq("id", id).single(),
    supabase
      .from("group_memberships")
      .select("user_id, profiles(name)")
      .eq("group_id", id)
      .is("left_at", null),
  ])

  if (groupResult.error || !groupResult.data) redirect(`/groups/${id}`)

  const group = groupResult.data
  const members = (membershipsResult.data ?? [])
    .map((m) => ({
      id: m.user_id,
      name: (m.profiles as unknown as { name: string } | null)?.name ?? "Unknown",
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex min-h-screen flex-col items-center justify-start p-5 pt-10">
      <div className="w-full max-w-lg">

        <div className="mb-8">
          <Link
            href={`/groups/${id}`}
            className="text-xs font-bold uppercase tracking-widest text-black/40 hover:text-black"
          >
            ← {group.name}
          </Link>
          <h1 className="mt-2 text-4xl font-black">New Expense</h1>
          <p className="mt-1 text-sm font-medium text-black/50">
            Add an expense and split it with your group.
          </p>
        </div>

        <BrutalCard className="p-8">
          <ExpenseForm
            groupId={id}
            groupName={group.name}
            members={members}
            currentUserId={user.id}
          />
        </BrutalCard>

      </div>
    </div>
  )
}
