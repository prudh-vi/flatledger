"use client"

import { useState, useRef } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { analyseCSV, submitConfirmImport } from "@/app/actions/import"
import { BrutalCard, BrutalBadge } from "@/components/brutalist"
import { formatPaise } from "@/lib/utils"
import type { Anomaly, ImportResult, ConfirmImportResult } from "@/lib/importer"

// ── Step indicator ────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Upload" },
    { n: 2, label: "Review" },
    { n: 3, label: "Done" },
  ] as const

  return (
    <div className="mb-8 flex items-center gap-0">
      {steps.map(({ n, label }, i) => (
        <div key={n} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-brutal text-sm font-black shadow-[2px_2px_0px_#000] ${
              current === n ? "bg-lime" : current > n ? "bg-brutal text-white" : "bg-white"
            }`}>
              {current > n ? "✓" : n}
            </div>
            <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
          </div>
          {i < 2 && (
            <div className={`mb-5 h-0.5 w-16 ${current > n ? "bg-brutal" : "bg-black/20"}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function ImportPage() {
  const { id: groupId } = useParams<{ id: string }>()

  const [step, setStep]           = useState<1 | 2 | 3>(1)
  const [file, setFile]           = useState<File | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [phase1, setPhase1]       = useState<(ImportResult & { validationErrors?: string[] }) | null>(null)
  const [approvals, setApprovals] = useState<Record<number, boolean>>({})
  const [phase2, setPhase2]       = useState<ConfirmImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Step 1 ──
  async function handleAnalyse() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const csvString = await file.text()
      const result = await analyseCSV(csvString, groupId)

      if (result.validationErrors?.length) {
        setError(result.validationErrors.join(" · "))
        return
      }

      // Default all requiresApproval rows to approved
      const defaults: Record<number, boolean> = {}
      for (const a of result.anomalies) {
        if (a.requiresApproval) defaults[a.rowNumber] = true
      }
      setApprovals(defaults)
      setPhase1(result)
      setStep(2)
    } catch (e: any) {
      setError(e.message ?? "Failed to analyse CSV")
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2 ──
  async function handleConfirm() {
    if (!phase1) return
    setLoading(true)
    setError(null)
    try {
      const result = await submitConfirmImport(phase1.sessionId, approvals, groupId)
      setPhase2(result)
      setStep(3)
    } catch (e: any) {
      setError(e.message ?? "Failed to confirm import")
    } finally {
      setLoading(false)
    }
  }

  function toggleApproval(rowNumber: number) {
    setApprovals((prev) => ({ ...prev, [rowNumber]: !prev[rowNumber] }))
  }

  // ── Render ──

  const needApprovalCount = (phase1?.anomalies ?? []).filter((a) => a.requiresApproval && !a.autoResolved).length

  return (
    <div className="flex min-h-screen flex-col items-center justify-start p-5 pt-10">
      <div className="w-full max-w-3xl">

        <div className="mb-6">
          <Link href={`/groups/${groupId}`} className="text-xs font-bold uppercase tracking-widest text-black/40 hover:text-black">
            ← Back to Group
          </Link>
          <h1 className="mt-2 text-4xl font-black">Import CSV</h1>
        </div>

        <StepIndicator current={step} />

        {/* ── Step 1: Upload ── */}
        {step === 1 && (
          <BrutalCard className="p-8">
            <h2 className="mb-1 text-2xl font-black">Upload your CSV</h2>
            <p className="mb-6 text-sm font-medium text-black/50">
              Must include: date, description, paid_by, amount, currency, split_type, split_with, split_details, notes
            </p>

            <div
              className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brutal bg-cream py-12 transition-colors hover:bg-lime/10"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <>
                  <p className="text-2xl">📄</p>
                  <p className="mt-2 text-base font-black">{file.name}</p>
                  <p className="text-xs font-medium text-black/40">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
                </>
              ) : (
                <>
                  <p className="text-3xl">⬆️</p>
                  <p className="mt-2 text-base font-black">Click to choose a file</p>
                  <p className="text-xs font-medium text-black/40">.csv only</p>
                </>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />

            {error && (
              <p className="mb-4 rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {error}
              </p>
            )}

            <button
              onClick={handleAnalyse}
              disabled={!file || loading}
              className="w-full rounded-2xl border-2 border-brutal bg-lime py-4 text-sm font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brutal border-t-transparent" />
                  Analysing…
                </span>
              ) : "Analyse CSV →"}
            </button>
          </BrutalCard>
        )}

        {/* ── Step 2: Review ── */}
        {step === 2 && phase1 && (
          <div className="space-y-4">

            {/* Summary bar */}
            <BrutalCard className="flex items-center gap-6 p-5">
              <div className="text-center">
                <p className="text-2xl font-black text-green-600">{phase1.readyToImport}</p>
                <p className="text-xs font-bold uppercase tracking-wider text-black/50">Rows ready</p>
              </div>
              <div className="h-8 w-0.5 bg-black/10" />
              <div className="text-center">
                <p className="text-2xl font-black">{phase1.anomalies.length}</p>
                <p className="text-xs font-bold uppercase tracking-wider text-black/50">Anomalies</p>
              </div>
              <div className="h-8 w-0.5 bg-black/10" />
              <div className="text-center">
                <p className="text-2xl font-black text-amber-600">{needApprovalCount}</p>
                <p className="text-xs font-bold uppercase tracking-wider text-black/50">Need your approval</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs font-medium text-black/40">Total rows</p>
                <p className="text-lg font-black">{phase1.totalRows}</p>
              </div>
            </BrutalCard>

            {/* Anomalies table */}
            {phase1.anomalies.length > 0 && (
              <BrutalCard className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-brutal bg-brutal text-white">
                        <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider">Row</th>
                        <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phase1.anomalies.map((a, i) => (
                        <tr key={i} className={`border-b border-black/10 ${i % 2 === 0 ? "bg-white" : "bg-cream/50"}`}>
                          <td className="px-4 py-3 font-black text-black/40">#{a.rowNumber}</td>
                          <td className="px-4 py-3">
                            <BrutalBadge className={a.autoResolved ? "bg-green-600" : a.requiresApproval ? "bg-amber-500" : "bg-red-600"}>
                              {a.anomalyType.replace(/_/g, " ")}
                            </BrutalBadge>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-black/70 max-w-xs">{a.description}</td>
                          <td className="px-4 py-3">
                            {a.autoResolved ? (
                              <span className="text-xs font-black text-green-600 uppercase tracking-wider">Auto-resolved ✓</span>
                            ) : a.requiresApproval ? (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => approvals[a.rowNumber] !== true && toggleApproval(a.rowNumber)}
                                  className={`rounded-lg border-2 border-brutal px-2 py-1 text-xs font-black uppercase shadow-[1px_1px_0px_#000] transition-all ${
                                    approvals[a.rowNumber] === true
                                      ? "bg-lime"
                                      : "bg-white hover:bg-lime/50"
                                  }`}
                                >
                                  ✓ Yes
                                </button>
                                <button
                                  onClick={() => approvals[a.rowNumber] !== false && toggleApproval(a.rowNumber)}
                                  className={`rounded-lg border-2 border-brutal px-2 py-1 text-xs font-black uppercase shadow-[1px_1px_0px_#000] transition-all ${
                                    approvals[a.rowNumber] === false
                                      ? "bg-red-400"
                                      : "bg-white hover:bg-red-100"
                                  }`}
                                >
                                  ✕ No
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs font-black text-red-600 uppercase tracking-wider">Skipped</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </BrutalCard>
            )}

            {error && (
              <p className="rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {error}
              </p>
            )}

            <button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full rounded-2xl border-2 border-brutal bg-lime py-4 text-sm font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000] disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brutal border-t-transparent" />
                  Importing…
                </span>
              ) : `Confirm Import →`}
            </button>
          </div>
        )}

        {/* ── Step 3: Report ── */}
        {step === 3 && phase2 && (
          <BrutalCard className="p-8">
            <h2 className="mb-6 text-3xl font-black">Import complete.</h2>

            <div className="mb-8 space-y-4">
              <div className="flex items-center gap-4 rounded-2xl border-2 border-brutal p-4 shadow-[3px_3px_0px_#000]">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-2xl font-black text-green-600">{phase2.imported - phase2.settlements}</p>
                  <p className="text-xs font-bold uppercase tracking-wider text-black/50">Expenses imported</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border-2 border-brutal p-4 shadow-[3px_3px_0px_#000]">
                <span className="text-2xl">🏦</span>
                <div>
                  <p className="text-2xl font-black">{phase2.settlements}</p>
                  <p className="text-xs font-bold uppercase tracking-wider text-black/50">Settlements recorded</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border-2 border-brutal p-4 shadow-[3px_3px_0px_#000]">
                <span className="text-2xl">⏭️</span>
                <div>
                  <p className="text-2xl font-black text-black/40">{phase2.skipped}</p>
                  <p className="text-xs font-bold uppercase tracking-wider text-black/50">Rows skipped</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border-2 border-brutal p-4 shadow-[3px_3px_0px_#000]">
                <span className="text-2xl">❌</span>
                <div>
                  <p className="text-2xl font-black text-red-600">{phase2.rejectedByUser}</p>
                  <p className="text-xs font-bold uppercase tracking-wider text-black/50">Rejected by you</p>
                </div>
              </div>
            </div>

            {phase2.errors.length > 0 && (
              <div className="mb-6">
                <p className="mb-2 text-xs font-black uppercase tracking-widest text-red-600">
                  {phase2.errors.length} row errors
                </p>
                <div className="space-y-1 rounded-xl border-2 border-red-500 bg-red-50 p-3">
                  {phase2.errors.map((e, i) => (
                    <p key={i} className="text-xs font-medium text-red-700">
                      Row #{e.rowNumber}: {e.reason}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <Link
              href={`/groups/${groupId}`}
              className="block w-full rounded-2xl border-2 border-brutal bg-lime py-4 text-center text-sm font-black uppercase tracking-widest shadow-[4px_4px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#000]"
            >
              View Group →
            </Link>
          </BrutalCard>
        )}

      </div>
    </div>
  )
}
