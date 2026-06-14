"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BrutalCard } from "@/components/brutalist"
import { createExpense } from "@/app/actions/expenses"

interface Member { id: string; name: string }

interface Props {
  groupId: string
  groupName: string
  members: Member[]
  currentUserId: string
}

type SplitType = "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "SHARE"
type Currency  = "INR" | "USD"

export function ExpenseForm({ groupId, groupName, members, currentUserId }: Props) {
  const router = useRouter()

  const today = new Date().toISOString().split("T")[0]

  const [description, setDescription] = useState("")
  const [amount,      setAmount]      = useState("")
  const [currency,    setCurrency]    = useState<Currency>("INR")
  const [date,        setDate]        = useState(today)
  const [paidBy,      setPaidBy]      = useState(currentUserId)
  const [splitType,   setSplitType]   = useState<SplitType>("EQUAL")
  const [splitWith,   setSplitWith]   = useState<string[]>(members.map((m) => m.id))
  const [splitDetails, setSplitDetails] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // ── Helpers ──────────────────────────────────────────────────

  function toggleMember(id: string) {
    setSplitWith((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
    setSplitDetails((prev) => {
      const next = { ...prev }
      if (prev[id] !== undefined) delete next[id]
      return next
    })
  }

  function setSplitTypeAndReset(t: SplitType) {
    setSplitType(t)
    setSplitDetails({})
  }

  function setDetail(uid: string, val: string) {
    setSplitDetails((prev) => ({ ...prev, [uid]: val }))
  }

  // ── Validation ────────────────────────────────────────────────

  const amountNum = parseFloat(amount) || 0

  const pctSum = splitType === "PERCENTAGE"
    ? splitWith.reduce((sum, uid) => sum + (parseFloat(splitDetails[uid] ?? "0") || 0), 0)
    : 0
  const pctValid = splitType !== "PERCENTAGE" || Math.abs(pctSum - 100) < 0.01

  const unequalSum = splitType === "UNEQUAL"
    ? splitWith.reduce((sum, uid) => sum + (parseFloat(splitDetails[uid] ?? "0") || 0), 0)
    : 0
  const unequalValid = splitType !== "UNEQUAL" || Math.abs(unequalSum - amountNum) < 0.01

  const canSubmit =
    description.trim() &&
    amountNum > 0 &&
    paidBy &&
    splitWith.length > 0 &&
    pctValid &&
    unequalValid &&
    !loading

  // ── Submit ────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      await createExpense({
        groupId,
        description,
        amountRaw: amountNum,
        currency,
        date,
        paidByUserId: paidBy,
        splitType,
        splits: splitWith.map((uid) => ({
          userId: uid,
          value: splitType === "EQUAL" ? 1 : parseFloat(splitDetails[uid] ?? "0") || 0,
        })),
      })
      router.push(`/groups/${groupId}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message ?? "Failed to create expense")
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────

  const splitTypeOptions: { value: SplitType; label: string }[] = [
    { value: "EQUAL",      label: "Equal"      },
    { value: "UNEQUAL",    label: "Unequal"    },
    { value: "PERCENTAGE", label: "Percentage" },
    { value: "SHARE",      label: "Share"      },
  ]

  const inputClass =
    "w-full rounded-xl border-2 border-brutal px-4 py-3 text-base font-bold shadow-[2px_2px_0px_#000] outline-none focus:shadow-[3px_3px_0px_#000] bg-white"

  const labelClass = "mb-2 block text-xs font-black uppercase tracking-widest"

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Description */}
      <div>
        <label className={labelClass}>Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Dinner at Pali Café"
          required
          className={inputClass}
        />
      </div>

      {/* Amount + Currency */}
      <div>
        <label className={labelClass}>Amount</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            required
            className={`${inputClass} flex-1`}
          />
          <div className="flex overflow-hidden rounded-xl border-2 border-brutal shadow-[2px_2px_0px_#000]">
            {(["INR", "USD"] as Currency[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`px-4 py-3 text-sm font-black uppercase transition-colors ${
                  currency === c ? "bg-lime" : "bg-white hover:bg-cream"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        {currency === "USD" && amountNum > 0 && (
          <p className="mt-1 text-xs font-bold text-black/50">
            ≈ ₹{(amountNum * 83.5).toLocaleString("en-IN", { maximumFractionDigits: 0 })} INR at 83.5
          </p>
        )}
      </div>

      {/* Date */}
      <div>
        <label className={labelClass}>Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className={inputClass}
        />
      </div>

      {/* Paid by */}
      <div>
        <label className={labelClass}>Paid by</label>
        <select
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
          className={inputClass}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}{m.id === currentUserId ? " (you)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Split type */}
      <div>
        <label className={labelClass}>Split type</label>
        <div className="flex overflow-hidden rounded-xl border-2 border-brutal shadow-[2px_2px_0px_#000]">
          {splitTypeOptions.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSplitTypeAndReset(value)}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-wide transition-colors ${
                splitType === value ? "bg-lime" : "bg-white hover:bg-cream"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Split with */}
      <div>
        <label className={labelClass}>Split with</label>
        <BrutalCard className="p-4">
          <div className="grid grid-cols-2 gap-2">
            {members.map((m) => {
              const checked = splitWith.includes(m.id)
              return (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 p-3 transition-colors ${
                    checked ? "border-brutal bg-lime" : "border-black/20 bg-white hover:border-brutal"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMember(m.id)}
                    className="sr-only"
                  />
                  <span className={`h-4 w-4 shrink-0 rounded border-2 border-brutal ${checked ? "bg-brutal" : "bg-white"} flex items-center justify-center`}>
                    {checked && <span className="text-[10px] font-black text-lime">✓</span>}
                  </span>
                  <span className="text-sm font-black truncate">
                    {m.name}{m.id === currentUserId ? " (you)" : ""}
                  </span>
                </label>
              )
            })}
          </div>
          {splitWith.length === 0 && (
            <p className="mt-2 text-xs font-bold text-red-600">Select at least one person</p>
          )}
        </BrutalCard>
      </div>

      {/* Split details — shown for non-EQUAL */}
      {splitType !== "EQUAL" && splitWith.length > 0 && (
        <div>
          <label className={labelClass}>
            {splitType === "UNEQUAL"    && `Amount per person (${currency})`}
            {splitType === "PERCENTAGE" && "Percentage per person"}
            {splitType === "SHARE"      && "Shares per person"}
          </label>
          <BrutalCard className="divide-y-2 divide-black/10 overflow-hidden">
            {splitWith.map((uid) => {
              const member = members.find((m) => m.id === uid)
              return (
                <div key={uid} className="flex items-center gap-3 p-3">
                  <span className="w-24 shrink-0 text-sm font-black truncate">
                    {member?.name ?? uid.slice(0, 6)}
                  </span>
                  <input
                    type="number"
                    value={splitDetails[uid] ?? ""}
                    onChange={(e) => setDetail(uid, e.target.value)}
                    placeholder={splitType === "PERCENTAGE" ? "%" : splitType === "SHARE" ? "1" : "0.00"}
                    min="0"
                    step={splitType === "SHARE" ? "1" : "0.01"}
                    className="flex-1 rounded-lg border-2 border-brutal px-3 py-2 text-sm font-bold outline-none focus:shadow-[2px_2px_0px_#000]"
                  />
                  <span className="shrink-0 text-xs font-bold text-black/40">
                    {splitType === "PERCENTAGE" ? "%" : splitType === "SHARE" ? "shares" : currency}
                  </span>
                </div>
              )
            })}
          </BrutalCard>

          {/* Validation feedback */}
          {splitType === "PERCENTAGE" && (
            <div className={`mt-2 flex items-center justify-between rounded-xl border-2 px-4 py-2 ${
              pctValid ? "border-green-500 bg-green-50" : "border-amber-500 bg-amber-50"
            }`}>
              <span className="text-xs font-bold text-black/60">Total</span>
              <span className={`text-sm font-black ${pctValid ? "text-green-600" : "text-amber-600"}`}>
                {pctSum.toFixed(1)}% {pctValid ? "✓" : `— need ${(100 - pctSum).toFixed(1)}% more`}
              </span>
            </div>
          )}
          {splitType === "UNEQUAL" && amountNum > 0 && (
            <div className={`mt-2 flex items-center justify-between rounded-xl border-2 px-4 py-2 ${
              unequalValid ? "border-green-500 bg-green-50" : "border-amber-500 bg-amber-50"
            }`}>
              <span className="text-xs font-bold text-black/60">Total allocated</span>
              <span className={`text-sm font-black ${unequalValid ? "text-green-600" : "text-amber-600"}`}>
                {unequalSum.toFixed(2)} / {amountNum.toFixed(2)} {currency}
                {unequalValid ? " ✓" : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-2xl border-2 border-brutal bg-lime py-4 text-sm font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0px_#000] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brutal border-t-transparent" />
            Saving…
          </span>
        ) : "Create Expense →"}
      </button>

    </form>
  )
}
