"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createSettlement } from "@/lib/balance"

export async function recordSettlement(formData: FormData) {
  const fromUserId  = formData.get("fromUserId")  as string
  const toUserId    = formData.get("toUserId")    as string
  const amountPaise = parseInt(formData.get("amountPaise") as string, 10)
  const groupId     = formData.get("groupId")     as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  await createSettlement(fromUserId, toUserId, amountPaise, groupId, supabase)

  revalidatePath(`/groups/${groupId}/settle`)
  revalidatePath(`/groups/${groupId}`)
}
