"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createGroup } from "@/app/actions/groups"
import { BrutalCard } from "@/components/brutalist"

export default function NewGroupPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [emails, setEmails] = useState<string[]>([""])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partialResult, setPartialResult] = useState<{ email: string; success: boolean }[] | null>(null)
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null)

  function addEmail() {
    setEmails((prev) => [...prev, ""])
  }

  function removeEmail(i: number) {
    setEmails((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateEmail(i: number, val: string) {
    setEmails((prev) => prev.map((e, idx) => (idx === i ? val : e)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await createGroup(name.trim(), emails.filter(Boolean))
      const failed = result.memberResults.filter((r) => !r.success)
      if (failed.length > 0) {
        setPartialResult(result.memberResults)
        setCreatedGroupId(result.groupId)
      } else {
        router.push(`/groups/${result.groupId}`)
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to create group")
    } finally {
      setLoading(false)
    }
  }

  // Partial success — show which emails weren't found
  if (partialResult && createdGroupId) {
    const failed = partialResult.filter((r) => !r.success)
    return (
      <div className="flex min-h-screen items-center justify-center p-5">
        <BrutalCard className="w-full max-w-md p-8">
          <h1 className="mb-2 text-3xl font-black">Group created!</h1>
          <p className="mb-6 text-sm font-medium text-black/50">
            But {failed.length} email{failed.length > 1 ? "s" : ""} weren't found in FlatLedger:
          </p>
          <ul className="mb-6 space-y-2">
            {failed.map((r) => (
              <li key={r.email} className="flex items-center gap-2 text-sm font-bold">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">✕</span>
                {r.email}
              </li>
            ))}
          </ul>
          <p className="mb-6 text-xs font-medium text-black/40">
            They need to register first. You can add them later from the group page.
          </p>
          <Link
            href={`/groups/${createdGroupId}`}
            className="block w-full rounded-2xl border-2 border-brutal bg-lime py-3 text-center text-sm font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000]"
          >
            View Group →
          </Link>
        </BrutalCard>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <BrutalCard className="w-full max-w-md p-8">

        <div className="mb-8">
          <Link href="/dashboard" className="text-xs font-bold uppercase tracking-widest text-black/40 hover:text-black">
            ← Dashboard
          </Link>
          <h1 className="mt-3 text-4xl font-black leading-tight">New Group</h1>
          <p className="mt-1 text-sm font-medium text-black/50">Give it a name and invite your people.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Group name */}
          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-widest">
              Group Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Goa Trip 2026"
              required
              className="w-full rounded-xl border-2 border-brutal px-4 py-3 text-base font-bold shadow-[2px_2px_0px_#000] outline-none focus:shadow-[3px_3px_0px_#000]"
            />
          </div>

          {/* Member emails */}
          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-widest">
              Add Members by Email
            </label>
            <div className="space-y-2">
              {emails.map((email, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => updateEmail(i, e.target.value)}
                    placeholder="friend@example.com"
                    className="flex-1 rounded-xl border-2 border-brutal px-4 py-3 text-sm font-medium shadow-[2px_2px_0px_#000] outline-none focus:shadow-[3px_3px_0px_#000]"
                  />
                  {emails.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEmail(i)}
                      className="rounded-xl border-2 border-brutal px-3 py-2 text-sm font-black shadow-[2px_2px_0px_#000] hover:bg-red-50"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addEmail}
              className="mt-2 text-xs font-black uppercase tracking-widest text-black/50 hover:text-black"
            >
              + Add another
            </button>
          </div>

          {error && (
            <p className="rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full rounded-2xl border-2 border-brutal bg-lime py-4 text-sm font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create Group →"}
          </button>

        </form>
      </BrutalCard>
    </div>
  )
}
