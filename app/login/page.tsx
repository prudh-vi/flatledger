"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push("/dashboard")
    router.refresh()
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setGoogleLoading(false)
    }
  }

  const inputClass =
    "w-full rounded-xl border-2 border-brutal bg-white px-4 py-3 text-base font-bold shadow-[2px_2px_0px_#000] outline-none focus:shadow-[3px_3px_0px_#000] placeholder:text-black/30"
  const labelClass = "mb-2 block text-xs font-black uppercase tracking-widest"

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-black tracking-tight">FlatLedger</h1>
          <p className="mt-2 text-sm font-bold text-black/40 uppercase tracking-widest">Split expenses. No drama.</p>
        </div>

        {/* Demo credentials */}
        <div className="mb-4 rounded-2xl border-2 border-brutal bg-yellow-100 p-4 shadow-[4px_4px_0px_#000]">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-black/60">Evaluator Demo Account</p>
          <div className="mb-1 font-mono text-sm font-bold">aisha@flatledger.com</div>
          <div className="mb-3 font-mono text-sm font-bold">password123</div>
          <button
            type="button"
            onClick={() => { setEmail("aisha@flatledger.com"); setPassword("password123") }}
            className="rounded-lg border-2 border-brutal bg-white px-3 py-1.5 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_#000]"
          >
            Fill credentials →
          </button>
        </div>

        {/* Card */}
        <div className="rounded-2xl border-2 border-brutal bg-white p-8 shadow-[6px_6px_0px_#000]">

          <h2 className="mb-6 text-2xl font-black">Sign in</h2>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border-2 border-brutal bg-white py-3 text-sm font-black uppercase tracking-widest shadow-[3px_3px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_#000] disabled:opacity-40"
          >
            {googleLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brutal border-t-transparent" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </button>

          {/* Divider */}
          <div className="mb-5 flex items-center gap-3">
            <div className="h-0.5 flex-1 bg-black/10" />
            <span className="text-xs font-black uppercase tracking-widest text-black/30">or</span>
            <div className="h-0.5 flex-1 bg-black/10" />
          </div>

          {/* Email/password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </div>

            {error && (
              <p className="rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl border-2 border-brutal bg-lime py-3 text-sm font-black uppercase tracking-widest shadow-[3px_3px_0px_#000] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_#000] disabled:opacity-40"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brutal border-t-transparent" />
                  Signing in…
                </span>
              ) : "Sign in →"}
            </button>
          </form>

        </div>

        <p className="mt-5 text-center text-sm font-bold text-black/40">
          No account?{" "}
          <Link href="/register" className="text-brutal underline underline-offset-4 hover:text-black/60">
            Register
          </Link>
        </p>

      </div>
    </div>
  )
}
