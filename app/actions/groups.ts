"use server"

import { createClient } from "@/lib/supabase/server"

export async function createGroup(name: string, memberEmails: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .insert({ name })
    .select("id")
    .single()
  if (groupError || !group) throw new Error(groupError?.message ?? "Failed to create group")

  await supabase.from("group_memberships").insert({
    group_id: group.id,
    user_id: user.id,
    joined_at: new Date().toISOString(),
  })

  // Look up each email and add as member — may fail for users not yet sharing a group
  const memberResults: { email: string; success: boolean }[] = []
  for (const raw of memberEmails.filter(Boolean)) {
    const email = raw.trim().toLowerCase()
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single()

    if (profile) {
      await supabase.from("group_memberships").insert({
        group_id: group.id,
        user_id: profile.id,
        joined_at: new Date().toISOString(),
      })
      memberResults.push({ email, success: true })
    } else {
      memberResults.push({ email, success: false })
    }
  }

  return { groupId: group.id, memberResults }
}
