/**
 * seed-users.ts — Create demo users via Supabase Admin API
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
 *   bun run supabase/seed-users.ts
 *
 * SUPABASE_URL is read from .env.local automatically.
 * Service role key: Supabase dashboard → Settings → API → service_role
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/$/, "")

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const USERS = [
  { email: "aisha@flatledger.com", name: "Aisha" },
  { email: "rohan@flatledger.com", name: "Rohan" },
  { email: "priya@flatledger.com", name: "Priya" },
  { email: "meera@flatledger.com", name: "Meera" },
  { email: "sam@flatledger.com",   name: "Sam"   },
  { email: "dev@flatledger.com",   name: "Dev"   },
]

const GROUP_ID   = "22222222-0000-0000-0000-000000000001"
const GROUP_NAME = "The Flat"

// Fixed UUIDs from the failed SQL seed — orphaned profiles to clean up
const ORPHANED_UUIDS = [
  "11111111-0000-0000-0000-000000000001",
  "11111111-0000-0000-0000-000000000002",
  "11111111-0000-0000-0000-000000000003",
  "11111111-0000-0000-0000-000000000004",
  "11111111-0000-0000-0000-000000000005",
  "11111111-0000-0000-0000-000000000006",
]

async function main() {

  // ── Step 0: Clean up orphaned data from failed SQL seed ────
  console.log("Cleaning up orphaned SQL seed data...")
  const emails = USERS.map((u) => u.email)
  await supabase.from("group_memberships").delete().in("user_id", ORPHANED_UUIDS)
  // Delete by both ID and email to catch profiles created with any UUID
  await supabase.from("profiles").delete().in("id", ORPHANED_UUIDS)
  await supabase.from("profiles").delete().in("email", emails)
  console.log("  ✓ Orphaned profiles and memberships removed\n")

  // ── Step 1: Get or create auth users ──────────────────────
  console.log("Creating users...")

  const { data: { users: existingAuthUsers } } = await supabase.auth.admin.listUsers()
  const authByEmail = new Map(existingAuthUsers.map((u) => [u.email, u]))

  const userIds: Record<string, string> = {}

  for (const u of USERS) {
    const existing = authByEmail.get(u.email)

    if (existing) {
      // Reset password so GoTrue rehashes it correctly
      const { error } = await supabase.auth.admin.updateUserById(existing.id, {
        password: "password123",
        email_confirm: true,
      })
      if (error) {
        console.error(`  ✗ ${u.name} reset failed: ${error.message}`)
        continue
      }
      userIds[u.name] = existing.id
      console.log(`  ✓ ${u.name} password reset (${existing.id})`)
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: "password123",
        email_confirm: true,
        user_metadata: { name: u.name },
      })
      if (error) {
        console.error(`  ✗ ${u.name} create failed: ${error.message}`)
        continue
      }
      userIds[u.name] = data.user.id
      console.log(`  ✓ ${u.name} created (${data.user.id})`)
    }
  }

  // ── Step 2: Group ──────────────────────────────────────────
  console.log("\nCreating group...")
  const { error: groupError } = await supabase
    .from("groups")
    .upsert({ id: GROUP_ID, name: GROUP_NAME, created_at: "2026-02-01T00:00:00Z" })
  if (groupError) { console.error(`  ✗ ${groupError.message}`); return }
  console.log(`  ✓ "${GROUP_NAME}"`)

  // ── Step 3: Memberships ────────────────────────────────────
  console.log("\nCreating memberships...")

  const memberships = [
    { name: "Aisha", joined_at: "2026-02-01T00:00:00Z", left_at: null },
    { name: "Rohan", joined_at: "2026-02-01T00:00:00Z", left_at: null },
    { name: "Priya", joined_at: "2026-02-01T00:00:00Z", left_at: null },
    { name: "Meera", joined_at: "2026-02-01T00:00:00Z", left_at: "2026-03-31T00:00:00Z" },
    { name: "Sam",   joined_at: "2026-04-10T00:00:00Z", left_at: null },
    // Dev: no membership (guest, trip only)
  ]

  for (const m of memberships) {
    const userId = userIds[m.name]
    if (!userId) { console.log(`  ⚠ Skipping ${m.name} — user missing`); continue }

    const { error } = await supabase
      .from("group_memberships")
      .upsert(
        { user_id: userId, group_id: GROUP_ID, joined_at: m.joined_at, left_at: m.left_at },
        { onConflict: "user_id,group_id" }
      )

    if (error) console.error(`  ✗ ${m.name}: ${error.message}`)
    else console.log(`  ✓ ${m.name}${m.left_at ? ` → left ${m.left_at.slice(0, 10)}` : ""}`)
  }

  console.log("\nDone.")
  console.log("  Email:    aisha@flatledger.com")
  console.log("  Password: password123")
}

main()
