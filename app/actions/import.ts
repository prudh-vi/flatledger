"use server"

import { createClient } from "@/lib/supabase/server"
import { runImportPhase1, confirmImport as commitImport } from "@/lib/importer"

export async function analyseCSV(csvString: string, groupId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  return runImportPhase1(csvString, groupId, user.id, supabase)
}

export async function submitConfirmImport(
  sessionId: string,
  approvals: Record<number, boolean>,
  groupId: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  return commitImport(sessionId, approvals, groupId, user.id, supabase)
}
